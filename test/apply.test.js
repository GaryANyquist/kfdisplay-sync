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

test('an item upserts its row and replaces its modifier links and sizes', async () => {
  const db = fakeDb();
  await applyChange(db, {
    entity: 'item', id: 'i1', version: 3, op: 'upsert',
    data: {
      id: 'i1', name: 'Cheeseburger', price: 1100, category_id: 'c', color: '#CC0023', taxable: 0,
      archived: 0, sort_order: 4, source_key: null, image: null, show_on_menu_board: 1, out_of_stock: 0,
      hide_on_kiosk: 1, allow_modifier_split: 0,
      modifier_groups: [{ group_id: 'g1', sort_order: 0 }, { group_id: 'g2', sort_order: 1 }],
      variants: [{ id: 'i1~s', name: 'Single', price: 1100, sort_order: 0 }, { id: 'i1~d', name: 'Double', price: 1500, sort_order: 1 }],
    },
  });
  assert.match(db.calls[0].sql, /^DELETE FROM dbo\.item_modifier_groups WHERE item_id = @id;$/);
  assert.match(db.calls[1].sql, /^DELETE FROM dbo\.item_variants WHERE item_id = @id;$/);
  assert.match(db.calls[2].sql, /^MERGE dbo\.items WITH \(HOLDLOCK\)/);
  assert.match(db.calls[2].sql, /t\.synced_at = SYSUTCDATETIME\(\)/);
  assert.equal(p(db.calls[2]).price, 1100);
  assert.equal(p(db.calls[2]).show_on_menu_board, 1);
  assert.equal(p(db.calls[2]).hide_on_kiosk, 1);
  assert.deepEqual(db.calls.slice(3, 5).map((c) => [p(c).item_id, p(c).group_id]), [['i1', 'g1'], ['i1', 'g2']]);
  assert.deepEqual(db.calls.slice(5).map((c) => [c.sql.split(' (')[0], p(c).item_id, p(c).name, p(c).price]),
    [['INSERT INTO dbo.item_variants', 'i1', 'Single', 1100], ['INSERT INTO dbo.item_variants', 'i1', 'Double', 1500]]);
});

test('settings, Wix links and kitchen times from a register', async () => {
  const db = fakeDb();
  await applyChange(db, {
    entity: 'settings', id: 'reg_ab12', version: 1, op: 'upsert',
    data: { register_name: 'R1', settings: '{"taxRate":0,"registerName":"R1"}' },
  });
  assert.match(db.calls[0].sql, /^MERGE dbo\.register_settings/);
  assert.deepEqual([p(db.calls[0]).register_id, p(db.calls[0]).register_name, p(db.calls[0]).settings], ['reg_ab12', 'R1', '{"taxRate":0,"registerName":"R1"}']);

  const links = fakeDb();
  await applyChange(links, {
    entity: 'wix_links', id: 'reg_ab12', version: 2, op: 'upsert',
    data: { links: [{ kind: 'item', wix_id: 'w1', local_id: 'it_7', image_url: null }, { kind: 'group', wix_id: 'g1', local_id: 'wxg_g1' }] },
  });
  assert.match(links.calls[0].sql, /^DELETE FROM dbo\.register_wix_links WHERE register_id = @id;$/);
  assert.deepEqual(links.calls.slice(1).map((c) => [p(c).register_id, p(c).kind, p(c).local_id]), [['reg_ab12', 'item', 'it_7'], ['reg_ab12', 'group', 'wxg_g1']]);

  const kitchen = fakeDb();
  await applyChange(kitchen, {
    entity: 'kitchen_status', id: 'o1', version: 1, op: 'upsert',
    data: { order_up_at: '2026-10-22T18:01:00.000Z', completed_at: null },
  });
  assert.match(kitchen.calls[0].sql, /^UPDATE dbo\.orders SET order_up_at = @ready, completed_at = @done WHERE id = @id;$/);
  assert.deepEqual([p(kitchen.calls[0]).ready.toISOString(), p(kitchen.calls[0]).done, p(kitchen.calls[0]).id], ['2026-10-22T18:01:00.000Z', null, 'o1']);
  const gone = fakeDb();
  await applyChange(gone, { entity: 'kitchen_status', id: 'o1', version: 2, op: 'delete' });
  assert.equal(gone.calls.length, 0, 'the PC keeps kitchen times like it keeps sales');
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
  assert.equal(deletes.length, 11);
  assert.ok(deletes.includes('DELETE FROM dbo.coupons;') && deletes.includes('DELETE FROM dbo.coupon_targets;'));
  assert.ok(deletes.includes('DELETE FROM dbo.item_variants;'));
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
  const kitchenAsked = [];
  const server = createServer({ syncKey: key }, {
    run: async (c) => { seen.push(c.id); },
    kitchenStatus: async (ids) => { kitchenAsked.push(ids); return [{ id: 'o1', order_up_at: '2026-10-06T16:10:00.000Z', completed_at: null }]; },
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

    const ks = await fetch(`${base}/v1/kitchen-status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['o1', 'o2'] }),
    });
    assert.deepEqual(await ks.json(), { orders: [{ id: 'o1', order_up_at: '2026-10-06T16:10:00.000Z', completed_at: null }] });
    assert.deepEqual(kitchenAsked, [['o1', 'o2']]);
    const ksBad = await fetch(`${base}/v1/kitchen-status`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify({ ids: [1] }) });
    assert.equal(ksBad.status, 400);
    const ksNoKey = await fetch(`${base}/v1/kitchen-status`, { method: 'POST', body: '{}' });
    assert.equal(ksNoKey.status, 401);
  } finally {
    server.close();
  }
});

test('an automatic discount replaces its targets, with dates', async () => {
  const db = fakeDb();
  await applyChange(db, {
    entity: 'auto_discount', id: 'a1', version: 1, op: 'upsert',
    data: { name: 'Burger Tuesday', type: 'amount', value: 100, active: 1, sort_order: 0, starts_on: '2026-10-01', ends_on: '2026-10-31',
      targets: [{ target_type: 'category', target_id: 'c1' }, { target_type: 'item', target_id: 'i9' }] },
  });
  assert.match(db.calls[0].sql, /^DELETE FROM dbo\.auto_discount_targets WHERE discount_id = @id;$/);
  assert.match(db.calls[1].sql, /^MERGE dbo\.auto_discounts/);
  assert.deepEqual([p(db.calls[1]).starts_on, p(db.calls[1]).ends_on], ['2026-10-01', '2026-10-31']);
  assert.deepEqual(db.calls.slice(2).map((c) => [p(c).discount_id, p(c).target_type, p(c).target_id]),
    [['a1', 'category', 'c1'], ['a1', 'item', 'i9']]);
});

test('deleting an automatic discount removes its targets first', async () => {
  const db = fakeDb();
  await applyChange(db, { entity: 'auto_discount', id: 'a1', version: 2, op: 'delete' });
  assert.deepEqual(db.calls.map((c) => c.sql.split(' WHERE')[0]), ['DELETE FROM dbo.auto_discount_targets', 'DELETE FROM dbo.auto_discounts']);
});

test('order lines carry their automatic discount', async () => {
  const db = fakeDb();
  await applyChange(db, {
    entity: 'order', id: 'o2', version: 1, op: 'upsert',
    data: { number: 1, created_at: '2026-10-15T18:00:00.000Z', shift_id: 's', subtotal: 1100, discount_amount: 100, tax: 0, tip: 0,
      total: 1000, payment_type: 'cash', payment_amount: 1000, status: 'completed',
      lines: [{ uid: 'l1', item_id: 'i', name: 'Burger', base_price: 1100, qty: 1, taxable: 0, line_index: 0,
        auto_discount_id: 'a1', auto_discount_name: 'Burger Tuesday', auto_discount_type: 'amount', auto_discount_value: 100,
        auto_discount_amount: 100, modifiers: [] }] },
  });
  const lineInsert = db.calls.find((c) => c.sql.startsWith('INSERT INTO dbo.order_lines'));
  assert.deepEqual([p(lineInsert).auto_discount_name, p(lineInsert).auto_discount_amount], ['Burger Tuesday', 100]);
});

test('a drawer upserts with its prepaid flag, and is never deleted', async () => {
  const db = fakeDb();
  await applyChange(db, {
    entity: 'shift', id: 'sh1', version: 1, op: 'upsert',
    data: { opened_at: '2026-10-03T15:00:00.000Z', starting_cash: 0, closed_at: null, counted_cash: null,
      over_short: null, note: null, prepaid: 1 },
  });
  assert.match(db.calls[0].sql, /^MERGE dbo\.shifts/);
  assert.equal(p(db.calls[0]).prepaid, 1);
  assert.ok(p(db.calls[0]).opened_at instanceof Date);
  const del = fakeDb();
  await applyChange(del, { entity: 'shift', id: 'sh1', version: 2, op: 'delete' });
  assert.equal(del.calls.length, 0);
});

test('an item carries its description', async () => {
  const db = fakeDb();
  await applyChange(db, {
    entity: 'item', id: 'm', version: 1, op: 'upsert',
    data: { name: 'Swedish Meatballs', price: 1200, category_id: 'c', color: '#CC0023', taxable: 0, archived: 0,
      sort_order: 0, show_on_menu_board: 1, out_of_stock: 0, description: 'Two meatballs in gravy', modifier_groups: [] },
  });
  const merge = db.calls.find((c) => c.sql.startsWith('MERGE dbo.items'));
  assert.equal(p(merge).description, 'Two meatballs in gravy');
});

test('restart: only with the sync key; answers, then stops (start-sync.cmd starts it again)', async () => {
  const key = 'test-key-that-is-long-enough-123';
  let exited = null;
  const server = createServer({ syncKey: key, displayKey: 'display-key-that-is-long-enough-456' }, { exit: (code) => { exited = code; } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (k) => fetch(`${base}/v1/restart`, { method: 'POST', headers: k ? { Authorization: `Bearer ${k}` } : {} });
  try {
    assert.equal((await post()).status, 401);
    assert.equal((await post('display-key-that-is-long-enough-456')).status, 401, 'the display key cannot restart it');
    assert.equal(exited, null);
    assert.deepEqual(await (await post(key)).json(), { ok: true, restarting: true });
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(exited, 0);
  } finally {
    server.close();
  }
});

test('a refund given on another register is never undone by the sale being sent again', async () => {
  const db = fakeDb();
  await applyChange(db, {
    entity: 'order', id: 'o1', version: 3, op: 'upsert',
    data: { id: 'o1', number: 4, created_at: '2026-10-22T18:00:00.000Z', shift_id: 's1', subtotal: 900, discount_amount: 0,
      tax: 0, tip: 0, total: 900, payment_type: 'card', payment_amount: 900, status: 'completed', register_id: 'reg_1', lines: [] },
  });
  const merge = db.calls[0];
  assert.equal(p(merge).register_id, 'reg_1');
  for (const c of ['status', 'refunded_at', 'refund_reason']) {
    assert.ok(merge.sql.includes(`t.${c} = CASE WHEN t.status <> 'completed' AND s.status = 'completed' THEN t.${c} ELSE s.${c} END`), c);
  }
  assert.ok(merge.sql.includes('t.total = s.total'));

  const st = fakeDb();
  await applyChange(st, {
    entity: 'order_status', id: 'o1', version: 1, op: 'upsert',
    data: { status: 'refunded', refunded_at: '2026-10-22T19:00:00.000Z', refund_reason: 'Square refund r1' },
  });
  assert.match(st.calls[0].sql, /^UPDATE dbo\.orders SET status = @status, refunded_at = @at, refund_reason = @reason WHERE id = @id;$/);
  assert.deepEqual([p(st.calls[0]).status, p(st.calls[0]).reason, p(st.calls[0]).id], ['refunded', 'Square refund r1', 'o1']);
  await assert.rejects(applyChange(fakeDb(), { entity: 'order_status', id: 'o1', version: 1, op: 'upsert', data: { status: 'gone' } }));
});

test('registers read every sale back, and pull refunds given elsewhere', async () => {
  const key = 'test-key-that-is-long-enough-123';
  const asked = [];
  const server = createServer({ syncKey: key }, {
    searchOrders: async (q) => { asked.push(q); return { orders: [{ id: 'o1' }], lines: [], modifiers: [], registers: [{ id: 'reg_1', name: 'R1' }] }; },
    orderStatus: async (ids) => ids.map((id) => ({ id, status: 'refunded', refunded_at: null, refund_reason: null })),
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, auth = true) =>
    fetch(`${base}${path}`, { method: 'POST', headers: auth ? { Authorization: `Bearer ${key}` } : {}, body: JSON.stringify(body) });
  try {
    const r = await post('/v1/orders/search', { since: '2026-10-22T05:00:00.000Z', limit: 100 });
    assert.deepEqual((await r.json()).registers, [{ id: 'reg_1', name: 'R1' }]);
    assert.deepEqual([asked[0].since.toISOString(), asked[0].until, asked[0].limit], ['2026-10-22T05:00:00.000Z', null, 100]);
    assert.equal((await post('/v1/orders/search', {})).status, 200);
    assert.equal(asked[1].limit, 500);
    assert.equal((await post('/v1/orders/search', { since: 'nope' })).status, 400);
    assert.equal((await post('/v1/orders/search', { limit: 99999 })).status, 400);
    assert.equal((await post('/v1/orders/search', {}, false)).status, 401);

    const s = await post('/v1/order-status', { ids: ['o1'] });
    assert.deepEqual(await s.json(), { orders: [{ id: 'o1', status: 'refunded', refunded_at: null, refund_reason: null }] });
    assert.equal((await post('/v1/order-status', { ids: [1] })).status, 400);
  } finally {
    server.close();
  }
});

test('a coupon replaces what it covers; a deleted coupon goes with its targets', async () => {
  const db = fakeDb();
  await applyChange(db, {
    entity: 'coupon', id: 'k1', version: 1, op: 'upsert',
    data: { code: 'SAVE10', name: 'Save ten', type: 'percent', value: 10, min_subtotal: 2000, one_item: 1, active: 1,
      targets: [{ target_type: 'category', target_id: 'c1' }, { target_type: 'item', target_id: 'i9' }] },
  });
  assert.match(db.calls[0].sql, /^DELETE FROM dbo\.coupon_targets WHERE coupon_id = @id;$/);
  assert.match(db.calls[1].sql, /^MERGE dbo\.coupons/);
  assert.deepEqual([p(db.calls[1]).code, p(db.calls[1]).value, p(db.calls[1]).min_subtotal], ['SAVE10', 10, 2000]);
  assert.deepEqual(db.calls.slice(2).map((c) => [p(c).coupon_id, p(c).target_type, p(c).target_id]), [['k1', 'category', 'c1'], ['k1', 'item', 'i9']]);
  const gone = fakeDb();
  await applyChange(gone, { entity: 'coupon', id: 'k1', version: 2, op: 'delete' });
  assert.deepEqual(gone.calls.map((c) => c.sql.split(' WHERE')[0]), ['DELETE FROM dbo.coupon_targets', 'DELETE FROM dbo.coupons']);
});
