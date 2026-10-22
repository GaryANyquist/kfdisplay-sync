import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { imageKind, isSafeName, missingPhotos, savePhoto } from '../src/photos.js';
import { createServer } from '../src/server.js';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('fake jpeg body')]);
const b64 = (b) => b.toString('base64');

async function tmpDir() {
  return mkdtemp(path.join(os.tmpdir(), 'kfd-photos-'));
}

test('only plain image file names are accepted', () => {
  assert.equal(isSafeName('it_160-wix-1791315247281.jpg'), true);
  assert.equal(isSafeName('A.PNG'), true);
  for (const bad of ['../a.jpg', 'a/b.jpg', 'a\\b.jpg', 'a.exe', 'a.jpg.exe', '', '.jpg', 'a..b.jpg', 5, null]) {
    assert.equal(isSafeName(bad), false, String(bad));
  }
});

test('the bytes decide whether it is an image', () => {
  assert.equal(imageKind(JPEG), 'jpg');
  assert.equal(imageKind(Buffer.from('MZ not an image')), null);
  assert.equal(imageKind(Buffer.from('GIF89a....')), 'gif');
});

test('a photo is saved once under its own name and then reported as present', async () => {
  const dir = await tmpDir();
  try {
    assert.deepEqual(await missingPhotos(dir, ['a.jpg', 'b.jpg']), ['a.jpg', 'b.jpg']);
    assert.equal(await savePhoto(dir, 'a.jpg', b64(JPEG)), 'saved');
    assert.deepEqual(await readFile(path.join(dir, 'a.jpg')), JPEG);
    assert.deepEqual(await missingPhotos(dir, ['A.JPG', 'b.jpg']), ['b.jpg']);
    // never replaced: same name again leaves the first file alone
    assert.equal(await savePhoto(dir, 'a.jpg', b64(Buffer.concat([JPEG, Buffer.from('x')]))), 'exists');
    assert.deepEqual(await readFile(path.join(dir, 'a.jpg')), JPEG);
    assert.deepEqual(await readdir(dir), ['a.jpg']); // no temp files left behind
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('bad names, non-images and empty data are refused and write nothing', async () => {
  const dir = await tmpDir();
  try {
    await assert.rejects(savePhoto(dir, '../evil.jpg', b64(JPEG)), /bad photo name/);
    await assert.rejects(savePhoto(dir, 'a.jpg', b64(Buffer.from('MZ program'))), /not a jpeg/);
    await assert.rejects(savePhoto(dir, 'a.jpg', ''), /missing or too large/);
    assert.deepEqual(await readdir(dir), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a folder that does not exist yet is created on the first photo', async () => {
  const parent = await tmpDir();
  const dir = path.join(parent, 'images');
  try {
    assert.deepEqual(await missingPhotos(dir, ['a.jpg']), ['a.jpg']);
    assert.equal(await savePhoto(dir, 'a.jpg', b64(JPEG)), 'saved');
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('the HTTP photo endpoints need the key and do what the tablet expects', async () => {
  const dir = await tmpDir();
  const key = 'test-key-that-is-long-enough-123';
  const server = createServer({ syncKey: key, photoDir: dir }, { run: async () => {}, databaseName: async () => 'KFDisplay' });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url, body, auth = true) =>
    fetch(`${base}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await post('/v1/photos/check', { names: ['a.jpg'] }, false)).status, 401);
    assert.deepEqual(await (await post('/v1/photos/check', { names: ['a.jpg', '../x.jpg'] })).json(), { missing: ['a.jpg'] });
    assert.deepEqual(await (await post('/v1/photos', { name: 'a.jpg', data: b64(JPEG) })).json(), { result: 'saved' });
    assert.deepEqual(await (await post('/v1/photos/check', { names: ['a.jpg'] })).json(), { missing: [] });
    const bad = await post('/v1/photos', { name: 'a.jpg', data: b64(Buffer.from('MZ nope')) });
    assert.equal(bad.status, 400);
    assert.equal((await post('/v1/photos/check', { names: 'a.jpg' })).status, 400);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('KFIDisplay on another PC lists and copies photos with the display key, and can do nothing else', async () => {
  const dir = await tmpDir();
  const key = 'test-key-that-is-long-enough-123';
  const displayKey = 'display-key-that-is-long-enough-456';
  await writeFile(path.join(dir, 'b.jpg'), JPEG);
  await writeFile(path.join(dir, 'a.jpg'), JPEG);
  await writeFile(path.join(dir, 'notes.txt'), 'not a photo');
  const server = createServer({ syncKey: key, displayKey, photoDir: dir }, { run: async () => {}, databaseName: async () => 'KFDisplay' });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (url, k) => fetch(`${base}${url}`, { headers: k ? { Authorization: `Bearer ${k}` } : {} });
  try {
    assert.deepEqual(await (await get('/v1/photos', displayKey)).json(), { photos: ['a.jpg', 'b.jpg'] });
    const photo = await get('/v1/photos/a.jpg', displayKey);
    assert.equal(photo.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(Buffer.from(await photo.arrayBuffer()), JPEG);
    assert.equal((await get('/v1/photos/a.jpg', key)).status, 200, 'the sync key works too');
    assert.equal((await get('/v1/photos', undefined)).status, 401);
    assert.equal((await get('/v1/photos/missing.jpg', displayKey)).status, 404);
    assert.equal((await get('/v1/photos/..%2F..%2Fsecret.jpg', displayKey)).status, 404);
    assert.equal((await get('/v1/photos/notes.txt', displayKey)).status, 404);
    // The display key can't send changes, save photos or read anything else.
    assert.equal((await get('/v1/health', displayKey)).status, 401);
    const post = await fetch(`${base}/v1/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${displayKey}` },
      body: JSON.stringify({ name: 'c.jpg', data: b64(JPEG) }),
    });
    assert.equal(post.status, 401);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
