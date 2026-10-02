import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyChange, TABLES } from '../src/apply.js';
import { applyBatch, authorized, createServer } from '../src/server.js';

/** A fake database that records each statement and its parameters. */
function fakeDb() {
  const calls = [];
  return { calls, exec: async (sql, params) => void calls.push({ sql, params }) };
}
const p = (call) => Object.fromEntries(call.params.map((x) => [x.name, x.value]));

test('an item upserts its row and replaces its modifier links', async () => {
  const db = fakeDb();
  await applyChange(db, {
    entity: 'item', id: 'i1', version: 3, op: 'upsert',
    data: {
      id: 'i1', name: 'Cheeseburger', price: 1100, category_id: 'c', color: '#CC0023', taxable: 0,
      archived: 0, sort_order: 4, source_key: null, image: null, show_on_menu_board: 1, out_of_stock: 0,
      modifier_groups: [{ group_id: 'g1', sort_order: 0 }, { group_id: 'g2', sort_order: 1 }],
    },
  });
  assert.match(db.calls[0].sql, /^DELETE FROM dbo\.item_modifier_groups WHERE item_id = @id;$/);
  assert.match(db.calls[1].sql, /^MERGE dbo\.items WITH \(HOLDLOCK\)/);
  assert.match(db.calls[1].sql, /t\.synced_at = SYSUTCDATETIME\(\)/);
  assert.equal(p(db.calls[1]).price, 1100);
  assert.equal(p(db.calls[1]).show_on_menu_board, 1);
  assert.deepEqual(db.calls.slice(2).map((c) => [p(c).item_id, p(c).group_id]), [['i1', 'g1'], ['i1', 'g2']]);
});

test('the request never chooses column names', async () => {
  const db = fakeDb();
  await applyChange(db, {
    entity: 'category', id: 'c', version: 1, op: 'upsert',
    data: { name: 'Burgers', color: '#000', sort_order: 0, 'name = 1; DROP TABLE x --': 'boom', extra: 1 },
  });
  assert.doesNotMatch(db.calls[0].sql, /DROP|extra/);
  assert.deepEqual(db.calls[0].params.map((x) => x.name), Object.keys(TABLES.categories.cols));
});

test('the id in the change wins over one in the data', async () => {
  const db = fakeDb();
  await applyChange(db, { entity: 'discount', id: 'd1', version: 1, op: 'upsert', data: { id: 'other', name: '10%', type: 'percent', value: 10 } });
  assert.equal(p(db.calls[0]).id, 'd1');
});

test('an order replaces its lines and modifiers and never touches kitchen columns', async () => {
  const db = fakeDb();
  await applyChange(db, {
    entity: 'order', id: 'o1', version: 1, op: 'upsert',
    data: {
      number: 7, created_at: '2026-10-01T16:00:00.000Z', shift_id: 's', subtotal: 1100, discount_amount: 0,
      tax: 0, tip: 200, total: 1300, payment_type: 'card', payment_amount: 1300, status: 'completed',
      pager_number: '12', tender: 'card', processor: 'square', processor_ref: 'pay_1', order_up_at: 'x',
      lines: [{
        uid: 'l1', item_id: 'i1', name: 'Cheeseburger', base_price: 1100, qty: 1, taxable: 0, note: 'no onion', line_index: 0,
        modifiers: [{ group_id: 'g', group_name: 'Cheese', option_id: 'o', option_name: 'American Cheese', price_delta: 0 }],
      }],
    },
  });
  const merge = db.calls[0];
  assert.match(merge.sql, /^MERGE dbo\.orders/);
  assert.doesNotMatch(merge.sql, /order_up_at|paged_at|completed_at/);
  assert.ok(p(merge).created_at instanceof Date);
  assert.equal(p(merge).created_at.toISOString(), '2026-10-01T16:00:00.000Z');
  assert.equal(p(merge).refunded_at, null);
  assert.match(db.calls[1].sql, /DELETE FROM dbo\.order_line_modifiers/);
  assert.match(db.calls[2].sql, /DELETE FROM dbo\.order_lines WHERE order_id/);
  assert.equal(p(db.calls[3]).order_id, 'o1');
  assert.deepEqual([p(db.calls[4]).line_uid, p(db.calls[4]).option_name], ['l1', 'American Cheese']);
});

test('deleting an order on the tablet leaves the PC copy alone', async () => {
  const db = fakeDb();
  await applyChange(db, { entity: 'order', id: 'o1', version: 2, op: 'delete' });
  assert.equal(db.calls.length, 0);
});

test('deleting a modifier group removes its options and links', async () => {
  const db = fakeDb();
  await applyChange(db, { entity: 'modifier_group', id: 'g', version: 2, op: 'delete' });
  assert.deepEqual(db.calls.map((c) => c.sql.split(' WHERE')[0]), [
    'DELETE FROM dbo.modifier_options', 'DELETE FROM dbo.item_modifier_groups', 'DELETE FROM dbo.modifier_groups',
  ]);
});

test('the catalog replaces every menu table', async () => {
  const db = fakeDb();
  await applyChange(db, {
    entity: 'catalog', id: 'all', version: 1, op: 'upsert',
    data: {
      categories: [{ id: 'c', name: 'Burgers', color: '#000', sort_order: 0 }],
      items: [{ id: 'i', name: 'Hot Dog', price: 600, category_id: 'c', color: '#000', taxable: 0, archived: 0, sort_order: 0, show_on_menu_board: 0, out_of_stock: 0 }],
      item_modifier_groups: [], modifier_groups: [], modifier_options: [], discounts: [],
    },
  });
  const deletes = db.calls.filter((c) => c.sql.startsWith('DELETE')).map((c) => c.sql);
  assert.equal(deletes.length, 6);
  const inserts = db.calls.filter((c) => c.sql.startsWith('INSERT')).map((c) => c.sql.split(' (')[0]);
  assert.deepEqual(inserts, ['INSERT INTO dbo.categories', 'INSERT INTO dbo.items']);
});

test('bad values and unknown entities are refused', async () => {
  const db = fakeDb();
  await assert.rejects(applyChange(db, { entity: 'item', id: 'i', op: 'upsert', data: { name: 'x', price: 11.5 } }), /whole number/);
  await assert.rejects(applyChange(db, { entity: 'users', id: 'u', op: 'delete' }), /unknown entity/);
  await assert.rejects(applyChange(db, { entity: 'order', id: 'o', op: 'upsert', data: { created_at: 'soon' } }), /date/);
});

test('a batch applies what it can and reports the rest', async () => {
  const result = await applyBatch(
    [{ entity: 'item', id: 'a', version: 1 }, { entity: 'item', id: 'b', version: 4 }],
    async (c) => { if (c.id === 'b') throw new Error('nope'); }
  );
  assert.deepEqual(result.applied, [{ entity: 'item', id: 'a', version: 1 }]);
  assert.deepEqual(result.failed, [{ entity: 'item', id: 'b', error: 'nope' }]);
});

test('the key must match exactly', () => {
  const key = 'k'.repeat(32);
  assert.equal(authorized(`Bearer ${key}`, key), true);
  assert.equal(authorized(`Bearer ${key}x`, key), false);
  assert.equal(authorized(undefined, key), false);
  assert.equal(authorized(key, key), false);
});

test('the HTTP service end to end, with a fake database', async () => {
  const key = 'test-key-that-is-long-enough-123';
  const seen = [];
  const server = createServer({ syncKey: key }, {
    run: async (c) => { seen.push(c.id); },
    databaseName: async () => 'KFDisplay',
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const noKey = await fetch(`${base}/v1/health`);
    assert.equal(noKey.status, 401);
    const health = await fetch(`${base}/v1/health`, { headers: { Authorization: `Bearer ${key}` } });
    assert.deepEqual(await health.json(), { ok: true, database: 'KFDisplay' });
    const sync = await fetch(`${base}/v1/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: [{ entity: 'order', id: 'o1', version: 2, op: 'upsert', data: {} }] }),
    });
    assert.deepEqual(await sync.json(), { applied: [{ entity: 'order', id: 'o1', version: 2 }], failed: [] });
    assert.deepEqual(seen, ['o1']);
    const bad = await fetch(`${base}/v1/sync`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: '{' });
    assert.equal(bad.status, 400);
  } finally {
    server.close();
  }
});
