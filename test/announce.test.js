import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { test } from 'node:test';

import { announce, FIND_REQUEST, findReply } from '../src/announce.js';

test('a find request gets the name and port; anything else gets nothing', () => {
  assert.deepEqual(JSON.parse(findReply('annaware-find annaware-sync\n', { name: 'KFDisplay PC (X)', port: 8787 })),
    { service: 'annaware-sync', name: 'KFDisplay PC (X)', port: 8787 });
  assert.equal(findReply('annaware-find annaware-kds', { name: 'x', port: 1 }), null);
  assert.equal(findReply('hello', { name: 'x', port: 1 }), null);
});

test('the PC answers a find request sent to it over UDP', async () => {
  const stop = announce(8787, 'KFDisplay PC (test)', 18789);
  const client = dgram.createSocket('udp4');
  try {
    const reply = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no answer')), 3000);
      client.on('message', (msg) => {
        clearTimeout(timer);
        resolve(JSON.parse(msg.toString('utf8')));
      });
      setTimeout(() => client.send(FIND_REQUEST, 18789, '127.0.0.1'), 200);
    });
    assert.deepEqual(reply, { service: 'annaware-sync', name: 'KFDisplay PC (test)', port: 8787 });
  } finally {
    client.close();
    stop();
  }
});
