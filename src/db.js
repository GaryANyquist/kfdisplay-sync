/** SQL Server access for the sync service: one transaction per change. */
import sql from 'mssql';

import { T } from './apply.js';

const TYPES = {
  [T.id]: sql.NVarChar(64),
  [T.text]: sql.NVarChar(200),
  [T.long]: sql.NVarChar(1000),
  [T.max]: sql.NVarChar(sql.MAX),
  [T.int]: sql.Int,
  [T.float]: sql.Float,
  [T.date]: sql.DateTime2(3),
};

let poolPromise = null;

export function getPool(config) {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config).connect().catch((err) => {
      poolPromise = null; // try again on the next request
      throw err;
    });
  }
  return poolPromise;
}

/** Runs `work(db)` in a transaction; commits if it resolves, rolls back if it throws. */
export async function inTransaction(config, work) {
  const pool = await getPool(config);
  const tx = new sql.Transaction(pool);
  await tx.begin();
  const db = {
    async exec(text, params) {
      const req = new sql.Request(tx);
      for (const p of params) req.input(p.name, TYPES[p.type], p.value);
      return req.query(text);
    },
  };
  try {
    await work(db);
    await tx.commit();
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

export async function databaseName(config) {
  const pool = await getPool(config);
  const r = await pool.request().query('SELECT DB_NAME() AS db');
  return r.recordset[0]?.db ?? '';
}

/**
 * What the Kitchen Display has done with these orders: ready (order_up_at) and bumped
 * (completed_at), as ISO UTC strings or null. Read-only; the tablet pulls this.
 */
export async function kitchenStatus(config, ids) {
  if (ids.length === 0) return [];
  const pool = await getPool(config);
  const req = pool.request();
  const list = ids
    .map((id, i) => {
      req.input(`i${i}`, sql.NVarChar(64), id);
      return `@i${i}`;
    })
    .join(',');
  const r = await req.query(
    `SELECT id, order_up_at, completed_at FROM dbo.orders WHERE id IN (${list})`
  );
  const iso = (d) => (d ? new Date(d).toISOString() : null);
  return r.recordset.map((o) => ({ id: o.id, order_up_at: iso(o.order_up_at), completed_at: iso(o.completed_at) }));
}

const iso = (d) => (d ? new Date(d).toISOString() : null);
const DATE_COLS = ['created_at', 'refunded_at', 'order_up_at', 'completed_at', 'paged_at', 'synced_at'];
const isoRow = (r) => {
  const out = { ...r };
  for (const c of DATE_COLS) if (c in out) out[c] = iso(out[c]);
  return out;
};

/**
 * Every register's sales between two times (newest first, at most `limit`), with their lines and options, and the
 * registers' names: Reports -> Transactions on any register (2.4.15). Rows keep the tablet's column names; times are
 * ISO UTC. `since`/`until` are Dates or null.
 */
export async function searchOrders(config, { since, until, limit }) {
  const pool = await getPool(config);
  const where = 'WHERE (@since IS NULL OR created_at >= @since) AND (@until IS NULL OR created_at < @until)';
  const top = `SELECT TOP (@limit) id FROM dbo.orders ${where} ORDER BY created_at DESC`;
  const req = () =>
    pool
      .request()
      .input('since', sql.DateTime2(3), since)
      .input('until', sql.DateTime2(3), until)
      .input('limit', sql.Int, limit);
  const orders = await req().query(`SELECT o.* FROM dbo.orders o WHERE o.id IN (${top}) ORDER BY o.created_at DESC`);
  const lines = await req().query(`SELECT l.* FROM dbo.order_lines l WHERE l.order_id IN (${top}) ORDER BY l.order_id, l.line_index`);
  const mods = await req().query(
    `SELECT m.* FROM dbo.order_line_modifiers m JOIN dbo.order_lines l ON l.uid = m.line_uid WHERE l.order_id IN (${top})`
  );
  const regs = await pool.request().query('SELECT register_id, register_name FROM dbo.register_settings');
  return {
    orders: orders.recordset.map(isoRow),
    lines: lines.recordset,
    modifiers: mods.recordset,
    registers: regs.recordset.map((r) => ({ id: r.register_id, name: r.register_name ?? '' })),
  };
}

/** The status of these sales here (a refund given on another register): [{ id, status, refunded_at, refund_reason }]. */
export async function orderStatus(config, ids) {
  if (ids.length === 0) return [];
  const pool = await getPool(config);
  const req = pool.request();
  const list = ids
    .map((id, i) => {
      req.input(`i${i}`, sql.NVarChar(64), id);
      return `@i${i}`;
    })
    .join(',');
  const r = await req.query(`SELECT id, status, refunded_at, refund_reason FROM dbo.orders WHERE id IN (${list})`);
  return r.recordset.map((o) => ({ id: o.id, status: o.status, refunded_at: iso(o.refunded_at), refund_reason: o.refund_reason ?? null }));
}
