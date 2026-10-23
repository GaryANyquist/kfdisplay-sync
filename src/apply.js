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

/** Column types: id/short text, longer text, unlimited text, whole numbers, decimals, UTC timestamps. */
export const T = { id: 'id', text: 'text', long: 'long', max: 'max', int: 'int', float: 'float', date: 'date' };

export const TABLES = {
  categories: { key: ['id'], cols: { id: T.id, name: T.text, color: T.text, sort_order: T.int }, synced: true },
  items: {
    key: ['id'],
    cols: {
      id: T.id, name: T.text, price: T.int, category_id: T.id, color: T.text, taxable: T.int,
      archived: T.int, sort_order: T.int, source_key: T.text, image: T.long,
      show_on_menu_board: T.int, out_of_stock: T.int, description: T.long,
      hide_on_kiosk: T.int, allow_modifier_split: T.int,
    },
    synced: true,
  },
  // An item's sizes, each with its own price (Wix price variants; the tablet's v21).
  item_variants: {
    key: ['id'],
    // Ids are "<item id>~<Wix variant id>", longer than other ids.
    cols: { id: T.text, item_id: T.id, name: T.text, price: T.int, sort_order: T.int },
  },
  modifier_groups: {
    key: ['id'],
    cols: {
      id: T.id, name: T.text, required: T.int, multi_select: T.int, sort_order: T.int,
      min_select: T.int, max_select: T.int,
    },
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
      starts_on: T.text, ends_on: T.text, sale_price: T.int,
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
      processor: T.text, processor_ref: T.text, register_id: T.id,
    },
    synced: true,
    // A sale refunded here from another register (entity order_status) stays refunded when the register that took
    // it sends the sale again before it has heard of the refund.
    sticky: { when: "t.status <> 'completed' AND s.status = 'completed'", cols: ['status', 'refunded_at', 'refund_reason'] },
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
      price_delta: T.int, half: T.int,
    },
  },
  // Orders sent to the kitchen and not paid yet (pay later, register 2.6.0); data is the register's JSON.
  open_tickets: {
    key: ['id'],
    cols: {
      id: T.id, number: T.int, table_no: T.text, created_at: T.date, updated_at: T.date, register_id: T.id, shift_id: T.id,
      customer_name: T.text, data: T.max, status: T.text,
    },
  },
  // A sale paid several ways (register 2.5.1): each payment, in order. Sent with its order.
  order_payments: {
    key: ['order_id', 'seq'],
    cols: {
      order_id: T.id, seq: T.int, tender: T.text, amount: T.int, tip: T.int, tendered: T.int, change_due: T.int,
      card_brand: T.text, last4: T.text, processor: T.text, processor_ref: T.text, reference_id: T.text,
    },
  },
  // Coupons (register 2.5.0): made on a register or copied from Wix (ids wxk_...), with what each covers.
  coupons: {
    key: ['id'],
    cols: {
      id: T.id, code: T.text, name: T.text, type: T.text, value: T.float, buy_qty: T.int, get_qty: T.int,
      min_subtotal: T.int, one_item: T.int, starts_on: T.text, ends_on: T.text, active: T.int, sort_order: T.int,
    },
    synced: true,
  },
  coupon_targets: {
    key: ['coupon_id', 'target_type', 'target_id'],
    cols: { coupon_id: T.id, target_type: T.text, target_id: T.id },
  },
  // Each register's settings (no keys or passwords: those never leave the tablet), as JSON.
  register_settings: {
    key: ['register_id'],
    cols: { register_id: T.id, register_name: T.text, settings: T.max },
    synced: true,
  },
  // Each register's record of which tablet item, category, group or option is which Wix id.
  register_wix_links: {
    key: [],
    cols: { register_id: T.id, kind: T.text, wix_id: T.text, local_id: T.id, image_url: T.long },
  },
};

const MENU_TABLES = [
  'coupon_targets', 'coupons',
  'auto_discount_targets', 'auto_discounts',
  'item_modifier_groups', 'item_variants', 'modifier_options', 'modifier_groups', 'items', 'categories', 'discounts',
];

export const ENTITIES = [
  'catalog', 'category', 'item', 'modifier_group', 'discount', 'auto_discount', 'shift', 'order',
  'settings', 'wix_links', 'kitchen_status', 'order_status', 'coupon', 'open_ticket',
];

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
  const { key, cols, synced, sticky } = TABLES[table];
  const names = Object.keys(cols);
  const nonKey = names.filter((c) => !key.includes(c));
  const sets = nonKey.map((c) =>
    sticky?.cols.includes(c) ? `t.${c} = CASE WHEN ${sticky.when} THEN t.${c} ELSE s.${c} END` : `t.${c} = s.${c}`
  );
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

    case 'open_ticket': {
      // Any register may add to or pay a ticket: the newer edit wins, and a paid or voided ticket never reopens.
      if (op === 'delete') return;
      const names = Object.keys(TABLES.open_tickets.cols);
      const sets = names.filter((c) => c !== 'id').map((c) => `t.${c} = s.${c}`).join(', ');
      return db.exec(
        `MERGE dbo.open_tickets WITH (HOLDLOCK) AS t\n` +
          `USING (SELECT ${names.map((c) => `@${c} AS ${c}`).join(', ')}) AS s\n` +
          'ON t.id = s.id\n' +
          `WHEN MATCHED AND t.status = 'open' AND (s.updated_at >= t.updated_at OR s.status <> 'open') THEN UPDATE SET ${sets}\n` +
          `WHEN NOT MATCHED THEN INSERT (${names.join(', ')}) VALUES (${names.map((c) => `s.${c}`).join(', ')});`,
        params('open_tickets', row)
      );
    }

    case 'coupon':
      await del(db, 'DELETE FROM dbo.coupon_targets WHERE coupon_id = @id;', id);
      if (op === 'delete') return del(db, 'DELETE FROM dbo.coupons WHERE id = @id;', id);
      await upsert(db, 'coupons', row);
      for (const t of list(data, 'targets')) await insert(db, 'coupon_targets', { ...t, coupon_id: id });
      return;

    case 'item':
      await del(db, 'DELETE FROM dbo.item_modifier_groups WHERE item_id = @id;', id);
      await del(db, 'DELETE FROM dbo.item_variants WHERE item_id = @id;', id);
      if (op === 'delete') return del(db, 'DELETE FROM dbo.items WHERE id = @id;', id);
      await upsert(db, 'items', row);
      for (const link of list(data, 'modifier_groups')) {
        await insert(db, 'item_modifier_groups', { ...link, item_id: id });
      }
      for (const v of list(data, 'variants')) await insert(db, 'item_variants', { ...v, item_id: id });
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
      // A split sale's payments (register 2.5.1); an older register sends none and leaves none.
      if (data.payments !== undefined) {
        await del(db, 'DELETE FROM dbo.order_payments WHERE order_id = @id;', id);
        for (const p of list(data, 'payments')) await insert(db, 'order_payments', { ...p, order_id: id });
      }
      return;

    case 'settings':
      // One register's settings; the id is the register's own id (it keeps it for good).
      if (op === 'delete') return del(db, 'DELETE FROM dbo.register_settings WHERE register_id = @id;', id);
      return upsert(db, 'register_settings', { register_id: id, register_name: data.register_name, settings: data.settings });

    case 'wix_links':
      // The register replaces its whole list, so the PC does too.
      await del(db, 'DELETE FROM dbo.register_wix_links WHERE register_id = @id;', id);
      if (op === 'delete') return;
      for (const l of list(data, 'links')) await insert(db, 'register_wix_links', { ...l, register_id: id });
      return;

    case 'kitchen_status':
      // When the kitchen tablet marked the order ready and done. Only those two columns change.
      if (op === 'delete') return;
      return db.exec('UPDATE dbo.orders SET order_up_at = @ready, completed_at = @done WHERE id = @id;', [
        { name: 'ready', type: T.date, value: value('orders', 'order_up_at', T.date, data.order_up_at) },
        { name: 'done', type: T.date, value: value('orders', 'completed_at', T.date, data.completed_at) },
        { name: 'id', type: T.id, value: id },
      ]);

    case 'order_status':
      // A register refunded another register's sale (Reports -> Transactions, 2.4.15). Only these columns change;
      // the register that took the sale pulls the new status (POST /v1/order-status).
      if (op === 'delete') return;
      if (!['completed', 'refunded', 'voided'].includes(data.status)) throw new Error('order_status.status is not a status');
      return db.exec('UPDATE dbo.orders SET status = @status, refunded_at = @at, refund_reason = @reason WHERE id = @id;', [
        { name: 'status', type: T.text, value: data.status },
        { name: 'at', type: T.date, value: value('orders', 'refunded_at', T.date, data.refunded_at) },
        { name: 'reason', type: T.long, value: value('orders', 'refund_reason', T.long, data.refund_reason) },
        { name: 'id', type: T.id, value: id },
      ]);

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
