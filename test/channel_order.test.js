const test = require('node:test');
const assert = require('node:assert');
const order = require('../channel_order');
// The 84 Telugu channels in Jio's v3.1 list on 2026-11-23 (id, title, language only).
const telugu = require('./fixtures/telugu-v3.1.json');

const ids = (channels) => channels.map((channel) => channel.id);
const sorted = () => order.sortTeluguFirst(telugu.filter(order.isVisible));

test('TEST9 HD is hidden', () => {
  assert.strictEqual(order.isVisible({ id: '1229' }), false);
  assert.strictEqual(sorted().length, 83);
  assert.ok(!ids(sorted()).includes('1229'));
});

test('popular and HD channels come first, then devotional, in the listed order', () => {
  assert.deepStrictEqual(ids(sorted()).slice(0, order.TELUGU_FIRST.length), order.TELUGU_FIRST);
  assert.deepStrictEqual(sorted().slice(0, 3).map((c) => c.title), ['Maa HD', 'ETV HD', 'Sun Gemini HD']);
});

test('news comes after the rest, and Christian channels come last', () => {
  const list = ids(sorted());
  const christian = list.slice(-order.TELUGU_CHRISTIAN.length);
  assert.deepStrictEqual(christian, order.TELUGU_CHRISTIAN);
  const newsStart = list.indexOf('614');
  assert.deepStrictEqual(list.slice(newsStart, -christian.length), order.TELUGU_NEWS, 'news block in ID order');
  assert.deepStrictEqual(list.slice(order.TELUGU_FIRST.length, newsStart).map(Number),
    list.slice(order.TELUGU_FIRST.length, newsStart).map(Number).sort((a, b) => a - b), 'the rest in ID order');
});

test('every listed ID exists in the fixture, and no channel is in two groups', () => {
  const known = new Set(ids(telugu));
  const all = [...order.TELUGU_FIRST, ...order.TELUGU_NEWS, ...order.TELUGU_CHRISTIAN, ...order.HIDDEN_IDS];
  for (const id of all) assert.ok(known.has(id), `ID ${id} is not in Jio's Telugu list`);
  assert.strictEqual(new Set(all).size, all.length);
});

test("a channel Jio files under News moves to the news block even if not listed", () => {
  const list = ids(order.sortTeluguFirst([
    { id: '734', language: 'Telugu', group: 'News' }, { id: '629', language: 'Telugu', group: 'Entertainment' },
    { id: '607', language: 'Telugu' }, { id: '1112', language: 'Telugu' }
  ]));
  assert.deepStrictEqual(list, ['1112', '629', '734', '607']);
});

test('other languages follow the Telugu channels in ID order', () => {
  const list = ids(order.sortTeluguFirst([
    { id: '500', language: 'Hindi' }, { id: '646', language: 'Telugu' }, { id: '100', language: 'English' }, { id: '1112', language: 'Telugu' }
  ]));
  assert.deepStrictEqual(list, ['1112', '646', '100', '500']);
});
