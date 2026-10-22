/*
 * The KFDisplay sync service. Runs on the KFDisplay PC and receives changes
 * from the register tablet over the truck's Wi-Fi.
 *
 *   GET  /v1/health  -> { ok, database }
 *   POST /v1/sync    { changes: [...] } -> { applied: [...], failed: [...] }
 *   POST /v1/photos/check { names: [...] } -> { missing: [...] }   which menu-board photos this PC lacks
 *   POST /v1/photos { name, data }          -> { result }            saves one photo (base64) into PHOTO_DIR
 *   POST /v1/kitchen-status { ids: [...] } -> { orders: [{ id, order_up_at, completed_at }] }
 *                    what the Kitchen Display did with those orders; the tablet pulls it
 *   POST /v1/restart        -> { ok, restarting }     stops; start-sync.cmd starts it again
 *   GET  /v1/photos         -> { photos: [names] }   the photos in PHOTO_DIR
 *   GET  /v1/photos/<name>  -> the image itself       (KFIDisplay on another PC copies these)
 *
 * All need "Authorization: Bearer <SYNC_KEY>"; the two GET photo routes also take DISPLAY_KEY, so the
 * menu-board PC can copy photos without the register's key (Gary, 2026-10-22). Each change is applied in its
 * own transaction, so one bad change can't block or half-apply the others.
 * Logs say how many changes came and went, never their contents.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import http from 'node:http';

import { applyChange } from './apply.js';
import { databaseName, inTransaction, kitchenStatus } from './db.js';
import { imageKind, listPhotos, missingPhotos, readPhoto, savePhoto } from './photos.js';

const MAX_BODY = 10 * 1024 * 1024;
const MAX_CHANGES = 200;
const MAX_IDS = 500;

const digest = (s) => createHash('sha256').update(s).digest();

export function authorized(header, key) {
  const m = /^Bearer (.+)$/.exec(header ?? '');
  return !!m && timingSafeEqual(digest(m[1]), digest(key));
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('request too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Applies a batch; `run(change)` does one change in a transaction. Exported for tests. */
export async function applyBatch(changes, run) {
  const applied = [];
  const failed = [];
  for (const c of changes) {
    try {
      await run(c);
      applied.push({ entity: c.entity, id: c.id, version: c.version });
    } catch (err) {
      failed.push({ entity: c?.entity, id: c?.id, error: String(err?.message ?? err).slice(0, 300) });
    }
  }
  return { applied, failed };
}

export function createServer(cfg, deps = {}) {
  const run = deps.run ?? ((c) => inTransaction(cfg.sql, (db) => applyChange(db, c)));
  const dbName = deps.databaseName ?? (() => databaseName(cfg.sql));
  const photoDir = cfg.photoDir ?? 'C:\\images';
  const kitchen = deps.kitchenStatus ?? ((ids) => kitchenStatus(cfg.sql, ids));

  return http.createServer(async (req, res) => {
    try {
      // KFIDisplay on another PC copies photos with the display key; everything else needs the sync key.
      const photoRead = req.method === 'GET' && (req.url === '/v1/photos' || req.url.startsWith('/v1/photos/'));
      const key = req.headers.authorization;
      const ok = authorized(key, cfg.syncKey) || (photoRead && !!cfg.displayKey && authorized(key, cfg.displayKey));
      if (!ok) return send(res, 401, { error: 'bad sync key' });

      if (photoRead && req.url === '/v1/photos') return send(res, 200, { photos: await listPhotos(photoDir) });
      if (photoRead) {
        const bytes = await readPhoto(photoDir, decodeURIComponent(req.url.slice('/v1/photos/'.length)));
        if (!bytes) return send(res, 404, { error: 'no such photo' });
        const kind = imageKind(bytes);
        res.writeHead(200, { 'Content-Type': kind === 'png' ? 'image/png' : kind === 'gif' ? 'image/gif' : 'image/jpeg' });
        return res.end(bytes);
      }

      if (req.method === 'POST' && req.url === '/v1/restart') {
        // From the register (Settings -> KFDisplay sync -> Restart) or tools/control.js. start-sync.cmd starts the
        // service again a few seconds later (with any new code), unless tools/control.js stop left stop.flag.
        console.log(`${new Date().toISOString()} restart asked for`);
        send(res, 200, { ok: true, restarting: true });
        setTimeout(() => (deps.exit ?? process.exit)(0), 300);
        return;
      }

      if (req.method === 'GET' && req.url === '/v1/health') {
        return send(res, 200, { ok: true, database: await dbName() });
      }

      if (req.method === 'POST' && req.url === '/v1/sync') {
        let body;
        try {
          body = JSON.parse(await readBody(req));
        } catch (err) {
          return send(res, err.status ?? 400, { error: err.status ? err.message : 'body is not JSON' });
        }
        const changes = body?.changes;
        if (!Array.isArray(changes) || changes.length > MAX_CHANGES) {
          return send(res, 400, { error: `changes must be a list of at most ${MAX_CHANGES}` });
        }
        const result = await applyBatch(changes, run);
        console.log(
          `${new Date().toISOString()} sync: ${result.applied.length} applied, ${result.failed.length} failed` +
            (result.failed.length ? ` (${result.failed.map((f) => `${f.entity} ${f.id}: ${f.error}`).join('; ')})` : '')
        );
        return send(res, 200, result);
      }

      if (req.method === 'POST' && req.url === '/v1/kitchen-status') {
        let body;
        try {
          body = JSON.parse(await readBody(req));
        } catch (err) {
          return send(res, err.status ?? 400, { error: err.status ? err.message : 'body is not JSON' });
        }
        const ids = body?.ids;
        if (!Array.isArray(ids) || ids.length > MAX_IDS || ids.some((i) => typeof i !== 'string' || !i || i.length > 64)) {
          return send(res, 400, { error: `ids must be a list of at most ${MAX_IDS} order ids` });
        }
        return send(res, 200, { orders: await kitchen(ids) });
      }

      if (req.method === 'POST' && (req.url === '/v1/photos/check' || req.url === '/v1/photos')) {
        let body;
        try {
          body = JSON.parse(await readBody(req));
        } catch (err) {
          return send(res, err.status ?? 400, { error: err.status ? err.message : 'body is not JSON' });
        }
        if (req.url === '/v1/photos/check') {
          const names = body?.names;
          if (!Array.isArray(names) || names.length > MAX_IDS) return send(res, 400, { error: 'names must be a list' });
          return send(res, 200, { missing: await missingPhotos(photoDir, names) });
        }
        try {
          const result = await savePhoto(photoDir, body?.name, body?.data);
          if (result === 'saved') console.log(`${new Date().toISOString()} photo saved: ${body.name}`);
          return send(res, 200, { result });
        } catch (err) {
          return send(res, 400, { error: String(err?.message ?? err) });
        }
      }

      return send(res, 404, { error: 'not found' });
    } catch (err) {
      // Typically SQL Server unreachable or the login refused.
      console.error(`${new Date().toISOString()} error: ${err?.message ?? err}`);
      return send(res, 503, { error: `database unavailable: ${err?.message ?? err}` });
    }
  });
}
