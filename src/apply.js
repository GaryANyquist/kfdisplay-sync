/*
 * Turns one change from the tablet into SQL against the register tables.
 *
 * Everything the tablet sends is data. Column names come only from TABLES
 * below, never from the request, and every value goes in as a typed
 * parameter. A key the tablet sends that isn't listed here is ignored.
 *
 * `db.exec(sql, params)` is supplied by the caller: the real one runs inside
 * a transaction (db.js), the tests pass a fake that records statements.
 */

/** Column types: id/short text, longer text, whole numbers, decimals, UTC timestamps. */
export const T = { id: 'id', text: 'text', long: 'long', int: 'int', float: 'float', date: 'date' };

export const TABLES = {
  categories: { key: ['id'], cols: { id: T.id, name: T.text, color: T.text, sort_order: T.int }, synced: true },
  items: {
    key: ['id'],
    cols: {
      id: T.id, name: T.text, price: T.int, category_id: T.id, color: T.text, taxable: T.int,
      archived: T.int, sort_order: T.int, source_key: T.text, image: T.long,
      show_on_menu_board: T.int, out_of_stock: T.int,
    },
    synced: true,
  },
  modifier_groups: {
    key: ['id'],
    cols: { id: T.id, name: T.text, required: T.int, multi_select: T.int, sort_order: T.int },
    synced: true,
  },
  modifier_options: {
    key: ['id'],
    cols: { id: T.id, group_id: T.id, name: T.text, price_delta: T.int, sort_order: T.int, default_on: T.int },
  },
  item_modifier_groups: { key: ['item_id', 'group_id'], cols: { item_id: T.id, group_id: T.id, sort_order: T.int } },
  discounts: {
    key: ['id'],
    cols: { id: T.id, name: T.text, type: T.text, value: T.float, starts_on: T.text, ends_on: T.text },
    synced: true,
  },
  auto_discounts: {
    key: ['id'],
    cols: {
      id: T.id, name: T.text, type: T.text, value: T.float, active: T.int, sort_order: T.int,
      starts_on: T.text, ends_on: T.text,
    },
    synced: true,
  },
  auto_discount_targets: {
    key: ['discount_id', 'target_type', 'target_id'],
    cols: { discount_id: T.id, target_type: T.text, target_id: T.id },
  },
  shifts: {
    key: ['id'],
    cols: {
      id: T.id, opened_at: T.date, starting_cash: T.int, closed_at: T.date, counted_cash: T.int,
      over_short: T.int, note: T.long, prepaid: T.int,
    },
    synced: true,
  },
  orders: {
    key: ['id'],
    cols: {
      id: T.id, number: T.int, created_at: T.date, shift_id: T.id, customer_name: T.text,
      discount_id: T.id, discount_name: T.text, discount_type: T.text, discount_value: T.float,
      subtotal: T.int, discount_amount: T.int, tax: T.int, tip: T.int, total: T.int,
      payment_type: T.text, payment_amount: T.int, tendered: T.int, change_due: T.int,
      card_brand: T.text, last4: T.text, payment_note: T.long, status: T.text,
      refunded_at: T.date, refund_reason: T.long, pager_number: T.text, tender: T.text,
      processor: T.text, processor_ref: T.text,
    },
    synced: true,
  },
  order_lines: {
    key: ['uid'],
    cols: {
      uid: T.id, order_id: T.id, item_id: T.id, name: T.text, base_price: T.int, qty: T.int,
      taxable: T.int, note: T.long, line_index: T.int,
      auto_discount_id: T.id, auto_discount_name: T.text, auto_discount_type: T.text,
      auto_discount_value: T.float, auto_discount_amount: T.int,
    },
  },
  order_line_modifiers: {
    key: [],
    cols: {
      line_uid: T.id, group_id: T.id, group_name: T.text, option_id: T.id, option_name: T.text,
      price_delta: T.int,
    },
  },
};

const MENU_TABLES = [
  'auto_discount_targets', 'auto_discounts',
  'item_modifier_groups', 'modifier_options', 'modifier_groups', 'items', 'categories', 'discounts',
];

export const ENTITIES = ['catalog', 'category', 'item', 'modifier_group', 'discount', 'auto_discount', 'shift', 'order'];

/** Checks and converts one value; throws a message the tablet shows if it's wrong. */
function value(table, col, type, raw) {
  if (raw === undefined || raw === null) return null;
  switch (type) {
    case T.int:
      if (typeof raw === 'boolean') return raw ? 1 : 0;
      if (!Number.isInteger(raw)) throw new Error(`${table}.${col} must be a whole number`);
      return raw;
    case T.float:
      if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new Error(`${table}.${col} must be a number`);
      return raw;
    case T.date: {
      const d = new Date(raw);
      if (typeof raw !== 'string' || Number.isNaN(d.getTime())) throw new Error(`${table}.${col} must be a date`);
      return d;
    }
    default:
      if (typeof raw !== 'string') throw new Error(`${table}.${col} must be text`);
      return raw;
  }
}

function params(table, row, cols = Object.keys(TABLES[table].cols)) {
  const spec = TABLES[table].cols;
  return cols.map((c) => ({ name: c, type: spec[c], value: value(table, c, spec[c], row[c]) }));
}

function requireKey(table, row) {
  for (const k of TABLES[table].key) {
    if (typeof row?.[k] !== 'string' || !row[k]) throw new Error(`${table} row is missing ${k}`);
  }
}

/** Insert or update one row. Columns the tablet doesn't own (kitchen times) are never touched. */
export async function upsert(db, table, row) {
  requireKey(table, row);
  const { key, cols, synced } = TABLES[table];
  const names = Object.keys(cols);
  const nonKey = names.filter((c) => !key.includes(c));
  const sets = nonKey.map((c) => `t.${c} = s.${c}`);
  if (synced) sets.push('t.synced_at = SYSUTCDATETIME()');
  const sql =
    `MERGE dbo.${table} WITH (HOLDLOCK) AS t\n` +
    `USING (SELECT ${names.map((c) => `@${c} AS ${c}`).join(', ')}) AS s\n` +
    `ON ${key.map((k) => `t.${k} = s.${k}`).join(' AND ')}\n` +
    `WHEN MATCHED THEN UPDATE SET ${sets.join(', ')}\n` +
    `WHEN NOT MATCHED THEN INSERT (${names.join(', ')}) VALUES (${names.map((c) => `s.${c}`).join(', ')});`;
  await db.exec(sql, params(table, row));
}

export async function insert(db, table, row) {
  const names = Object.keys(TABLES[table].cols);
  await db.exec(
    `INSERT INTO dbo.${table} (${names.join(', ')}) VALUES (${names.map((c) => `@${c}`).join(', ')});`,
    params(table, row)
  );
}

function list(data, field) {
  const v = data?.[field];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error(`${field} must be a list`);
  return v;
}

const del = (db, sql, id) => db.exec(sql, [{ name: 'id', type: T.id, value: id }]);

/**
 * Applies one change. Throws if it can't; the caller rolls that change back
 * and reports it to the tablet, which retries it later.
 */
export async function applyChange(db, change) {
  const { entity, id, op, data } = change ?? {};
  if (!ENTITIES.includes(entity)) throw new Error(`unknown entity ${String(entity)}`);
  if (typeof id !== 'string' || !id) throw new Error('change has no id');
  if (op !== 'upsert' && op !== 'delete') throw new Error(`unknown op ${String(op)}`);
  if (op === 'upsert' && (typeof data !== 'object' || data === null)) throw new Error('upsert has no data');
  const row = op === 'upsert' ? { ...data, id } : null;

  switch (entity) {
    case 'category':
      if (op === 'delete') return del(db, 'DELETE FROM dbo.categories WHERE id = @id;', id);
      return upsert(db, 'categories', row);

    case 'discount':
      if (op === 'delete') return del(db, 'DELETE FROM dbo.discounts WHERE id = @id;', id);
      return upsert(db, 'discounts', row);

    case 'auto_discount':
      await del(db, 'DELETE FROM dbo.auto_discount_targets WHERE discount_id = @id;', id);
      if (op === 'delete') return del(db, 'DELETE FROM dbo.auto_discounts WHERE id = @id;', id);
      await upsert(db, 'auto_discounts', row);
      for (const t of list(data, 'targets')) await insert(db, 'auto_discount_targets', { ...t, discount_id: id });
      return;

    case 'item':
      await del(db, 'DELETE FROM dbo.item_modifier_groups WHERE item_id = @id;', id);
      if (op === 'delete') return del(db, 'DELETE FROM dbo.items WHERE id = @id;', id);
      await upsert(db, 'items', row);
      for (const link of list(data, 'modifier_groups')) {
        await insert(db, 'item_modifier_groups', { ...link, item_id: id });
      }
      return;

    case 'modifier_group':
      await del(db, 'DELETE FROM dbo.modifier_options WHERE group_id = @id;', id);
      if (op === 'delete') {
        await del(db, 'DELETE FROM dbo.item_modifier_groups WHERE group_id = @id;', id);
        return del(db, 'DELETE FROM dbo.modifier_groups WHERE id = @id;', id);
      }
      await upsert(db, 'modifier_groups', row);
      for (const o of list(data, 'options')) await insert(db, 'modifier_options', { ...o, group_id: id });
      return;

    case 'shift':
      // Drawers are kept like sales: clearing the tablet's history doesn't remove them here.
      if (op === 'delete') return;
      return upsert(db, 'shifts', row);

    case 'order':
      // The tablet only "deletes" sales by clearing its own history; the PC keeps them.
      if (op === 'delete') return;
      await upsert(db, 'orders', row);
      await del(
        db,
        'DELETE FROM dbo.order_line_modifiers WHERE line_uid IN (SELECT uid FROM dbo.order_lines WHERE order_id = @id);',
        id
      );
      await del(db, 'DELETE FROM dbo.order_lines WHERE order_id = @id;', id);
      for (const line of list(data, 'lines')) {
        await insert(db, 'order_lines', { ...line, order_id: id });
        for (const m of list(line, 'modifiers')) await insert(db, 'order_line_modifiers', { ...m, line_uid: line.uid });
      }
      return;

    case 'catalog':
      // The whole menu: replace every menu table with what the tablet has.
      if (op === 'delete') return;
      for (const t of MENU_TABLES) await db.exec(`DELETE FROM dbo.${t};`, []);
      for (const t of [...MENU_TABLES].reverse()) {
        for (const r of list(data, t)) await insert(db, t, r);
      }
      return;
  }
}
