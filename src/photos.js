/**
 * Menu-board photos from the tablet. KFIDisplay shows an item's photo from a folder on this PC
 * (C:\images by default), found by the file name in items.image. Photos that came from Wix or the
 * tablet's camera exist only on the tablet, so the tablet asks which of them are missing here and
 * sends those. A file is only ever added, never replaced: a changed photo has a new name.
 */
import { mkdir, readdir, rename, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const SAFE_NAME = /^[A-Za-z0-9._-]{1,150}\.(jpe?g|png|gif)$/i;

export const isSafeName = (name) => typeof name === 'string' && SAFE_NAME.test(name) && !name.includes('..');

/** The kind of image the bytes really are (not what the name claims), or null. */
export function imageKind(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 6 && buf.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif';
  return null;
}

/** Which of `names` are not in `dir` yet. Names are compared case-insensitively, as Windows does. */
export async function missingPhotos(dir, names) {
  let have;
  try {
    have = new Set((await readdir(dir)).map((f) => f.toLowerCase()));
  } catch {
    have = new Set(); // the folder doesn't exist yet
  }
  return names.filter((n) => isSafeName(n) && !have.has(n.toLowerCase()));
}

/**
 * Saves a photo (base64) as `name` in `dir`. Returns 'saved' or 'exists'; throws a message for a bad
 * name, a bad image or a file that is too big. Written to a temp file first, so KFIDisplay never opens half a photo.
 */
export async function savePhoto(dir, name, base64) {
  if (!isSafeName(name)) throw new Error('bad photo name');
  if (typeof base64 !== 'string' || base64.length > Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 8) {
    throw new Error('photo is missing or too large');
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) throw new Error('photo is missing or too large');
  if (!imageKind(bytes)) throw new Error('not a jpeg, png or gif image');

  await mkdir(dir, { recursive: true });
  if ((await missingPhotos(dir, [name])).length === 0) return 'exists';
  const final = path.join(dir, name);
  const tmp = path.join(dir, `.${name}.${process.pid}.tmp`);
  try {
    await writeFile(tmp, bytes, { flag: 'wx' });
    await rename(tmp, final);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
  return 'saved';
}
