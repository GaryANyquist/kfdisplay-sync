/** SQL Server access for the sync service: one transaction per change. */
import sql from 'mssql';

import { T } from './apply.js';

const TYPES = {
  [T.id]: sql.NVarChar(64),
  [T.text]: sql.NVarChar(200),
  [T.long]: sql.NVarChar(1000),
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
