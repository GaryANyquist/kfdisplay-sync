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
