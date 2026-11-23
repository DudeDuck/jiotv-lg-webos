/**
 * Virtual TV: serves the app in a 1920x1080 browser with sample channels,
 * replays remote-control key presses and checks where focus lands.
 *
 *   npm run tv                  run the checks
 *   npm run tv -- --shots DIR   also save screenshots to DIR
 *
 * First run needs a browser: `npx playwright-core install chromium-headless-shell`,
 * or set CHROMIUM_PATH to an existing Chrome or Chromium binary.
 */
const { chromium } = require('playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const root = path.join(__dirname, '..');
const shotsDir = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : '';
const KEYS = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight', OK: 'Enter', BACK: 'Escape' };
const RED = 403;

const SAMPLE = {
  Telugu: ['Star Maa HD', 'Zee Telugu HD', 'ETV Telugu', 'Gemini TV HD', 'TV9 Telugu', 'NTV Telugu', 'ETV Andhra Pradesh', 'Star Maa Movies HD'],
  Hindi: ['Colors HD', 'Sony SAB HD', 'Aaj Tak'],
  English: ['Discovery HD', 'CNN News18'],
  Bengali: ['Zee Bangla']
};
const GROUPS = ['Entertainment', 'Movies', 'News', 'Music'];

function sampleChannels() {
  let id = 140;
  return Object.entries(SAMPLE).flatMap(([language, names]) => names.map((title, i) => ({
    id: String(id++), title, logo: '', group: GROUPS[i % GROUPS.length], language, isDrm: false
  })));
}

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => fs.readFile(path.join(root, req.url.split('?')[0]), (error, data) => {
      res.writeHead(error ? 404 : 200); res.end(data);
    })).listen(0, '127.0.0.1', () => resolve(server));
  });
}

// Options: `time` fixes the clock (an ISO string), `signedIn` stores a dummy Jio sign-in,
// and `service` replaces the TV service with a fake one that answers programme-guide
// requests: half-hour slots for every channel, nothing for 144 and an error for 143.
// `stream` (with `service`) also starts playback of a 3-level HLS stream whose URLs 404.
async function openApp(browser, port, favorites, options = {}) {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 }, deviceScaleFactor: shotsDir ? 2 : 1, timezoneId: 'Asia/Kolkata'
  });
  if (options.time) await page.clock.setFixedTime(new Date(options.time));
  await page.addInitScript(({ channels, favorites, options }) => {
    localStorage.setItem('jiotvwebos.channels.v1', JSON.stringify(channels));
    localStorage.setItem('jiotvwebos.favorites.v1', JSON.stringify(favorites));
    // `language: null` leaves the stored language alone (to test restarts); a string is stored as-is.
    if (options.language !== null) localStorage.setItem('jiotvwebos.language.v2', options.language || JSON.stringify('telugu'));
    if (options.signedIn) localStorage.setItem('jiotvwebos.jio-auth.v1', JSON.stringify({ authToken: 'test-token', mobile: '9000000000' }));
    if (!options.service) return;
    window.__serviceCalls = [];
    const slot = 30 * 60 * 1000;
    const service = {
      request(uri, request) {
        window.__serviceCalls.push({ method: request.method, parameters: request.parameters || {} });
        setTimeout(() => {
          if (request.method === 'epg/get') {
            const id = String(request.parameters.channelId);
            if (id === '143') { request.onFailure({ errorText: 'Jio programme guide returned HTTP 500.' }); return; }
            const first = Math.floor(Date.now() / slot) * slot - slot;
            const programmes = id === '144' ? [] : [0, 1, 2, 3].map((i) => ({
              startEpoch: first + i * slot, endEpoch: first + (i + 1) * slot, showname: `Programme ${id}-${i}`
            }));
            request.onSuccess({ returnValue: true, channelId: id, programmes });
          } else if (request.method === 'library/getChannels') {
            request.onFailure({ errorText: 'Offline in the virtual TV.' });
          } else if (options.stream && request.method === 'proxy/start') {
            request.onSuccess({ returnValue: true, baseUrl: `${location.origin}/no-stream` });
          } else if (options.stream && request.method === 'proxy/resolve') {
            request.onSuccess({ returnValue: true, mode: 'hls', levels: [
              { height: 1080, bandwidth: 5000000 }, { height: 720, bandwidth: 3200000 }, { height: 480, bandwidth: 1400000 }
            ] });
          }
          // Without `stream`, proxy/start is left unanswered: playback cannot start without Jio.
        }, 30);
        return { cancel() {} };
      }
    };
    // webOSTV.js assigns window.webOS when it loads; keep the fake in place.
    Object.defineProperty(window, 'webOS', { configurable: true, get: () => ({ service }), set() {} });
  }, { channels: options.channels || sampleChannels(), favorites, options });
  page.on('pageerror', (error) => { throw error; });
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForTimeout(500);
  return page;
}

const focusName = (page) => page.evaluate(() => {
  const a = document.activeElement;
  if (a.dataset.language) return `lang:${a.dataset.language}`;
  if (a.classList.contains('channel-card')) return `card:${a.dataset.index}`;
  if (a.classList.contains('rail-item')) return `rail:${a.dataset.group}`;
  if (a.dataset.group) return `genre:${a.dataset.group}`;
  return a.id || a.tagName;
});

async function press(page, step) {
  if (step === 'RED') {
    await page.evaluate((code) => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'keyCode', { value: code });
      document.activeElement.dispatchEvent(event);
    }, RED);
  } else await page.keyboard.press(KEYS[step]);
  await page.waitForTimeout(50);
}

async function shot(page, name) {
  if (shotsDir) { fs.mkdirSync(shotsDir, { recursive: true }); await page.screenshot({ path: path.join(shotsDir, name) }); }
}

async function checkDpad(browser, port) {
  const page = await openApp(browser, port, ['141', '143']);
  const steps = ['D', 'D', 'R', 'D', 'L', 'L', 'D', 'D', 'OK', 'R'];
  const expected = ['genre:News', 'card:0', 'card:1', 'card:5', 'card:4', 'rail:telugu', 'rail:all', 'rail:favorites', 'rail:favorites', 'card:0'];
  assert.strictEqual(await focusName(page), 'lang:telugu', 'starts on the Telugu chip');
  const seen = [];
  for (const step of steps) { await press(page, step); seen.push(await focusName(page)); }
  assert.deepStrictEqual(seen, expected, 'd-pad focus trail');
  await shot(page, 'saved.png');
  await page.close();
}

async function checkSaved(browser, port) {
  // 141 is Zee Telugu HD and 148 is Colors HD (Hindi); the language chip starts on Telugu.
  const page = await openApp(browser, port, ['141', '148']);
  await page.click('.rail-item[data-group="favorites"]');
  const titles = () => page.$$eval('.channel-card .channel-copy > strong', (nodes) => nodes.map((n) => n.textContent));
  assert.deepStrictEqual(await titles(), ['Zee Telugu HD', 'Colors HD'], 'Saved lists channels of every language');
  assert.ok(await page.isHidden('#language-filter-row'), 'language chips are hidden inside Saved');
  assert.strictEqual(await page.textContent('#library-title'), 'Saved channels');
  await shot(page, 'saved-all-languages.png');

  // Unsaving the first card must leave focus on the neighbour that took its place.
  await page.focus('.channel-card');
  await press(page, 'RED');
  assert.strictEqual(await focusName(page), 'card:0', 'focus stays in the list after unsaving');
  assert.strictEqual((await titles()).length, 1);
  await press(page, 'RED');
  assert.strictEqual(await focusName(page), 'rail:favorites', 'focus falls back to the rail when Saved empties');
  await page.close();
}

async function checkTopBar(browser, port) {
  for (const [time, expected] of [['2026-11-23T00:30:00+05:30', '12:30 AM'], ['2026-11-23T12:00:00+05:30', '12:00 PM'], ['2026-11-23T19:05:00+05:30', '7:05 PM']]) {
    const page = await openApp(browser, port, [], { time });
    assert.strictEqual(await page.textContent('#clock'), expected, `clock at ${time}`);
    if (expected === '7:05 PM') {
      const settings = await page.$('#settings-open');
      assert.strictEqual((await settings.innerText()).trim(), '', 'settings button shows no text');
      assert.strictEqual(await settings.getAttribute('aria-label'), 'Settings');
      assert.ok(await settings.$('svg'), 'settings button has a drawn gear icon');
      const box = await settings.boundingBox();
      assert.ok(box.width <= 64, `settings button is icon-sized (${box.width}px)`);
      const clock = await (await page.$('#clock')).boundingBox();
      assert.ok(clock.x > box.x && clock.x + clock.width > 1800, 'clock sits in the top right corner');
      await page.focus('#settings-open');
      await shot(page, 'top-bar.png');
    }
    await page.close();
  }
}

async function checkListView(browser, port) {
  const page = await openApp(browser, port, [], { time: '2026-11-23T19:05:00+05:30', signedIn: true, service: true });
  const epgCalls = () => page.evaluate(() => window.__serviceCalls.filter((c) => c.method === 'epg/get').map((c) => c.parameters.channelId));
  assert.deepStrictEqual(await epgCalls(), [], 'grid view does not fetch any guide');

  // Up from the language chips reaches the layout switch; pick List with the remote.
  await press(page, 'U');
  assert.strictEqual(await focusName(page), 'view-grid');
  await press(page, 'R');
  assert.strictEqual(await focusName(page), 'view-list');
  await press(page, 'OK');
  assert.strictEqual(await focusName(page), 'view-list', 'focus stays on the switch');
  assert.ok(await page.$('.channel-list.list-view'), 'list layout is on');
  assert.strictEqual(await page.getAttribute('#view-list', 'aria-pressed'), 'true');
  await page.waitForTimeout(600);

  const row = (id) => page.$eval(`.channel-card[data-channel-id="${id}"] .row-epg`, (el) => el.innerText.replace(/\s+/g, ' ').trim());
  assert.strictEqual(await row(140), 'NOW7:00 PM – 7:30 PM Programme 140-1 NEXT7:30 PM Programme 140-2', 'row shows now and next');
  assert.strictEqual(await row(144), 'No guide listing for this channel');
  assert.strictEqual(await row(143), 'Guide unavailable right now');
  const width = await page.$eval('.channel-card[data-channel-id="140"] .row-epg-progress span', (el) => el.style.width);
  assert.strictEqual(width, '16.7%', '5 of 30 minutes watched');

  const firstCalls = await epgCalls();
  assert.ok(firstCalls.length >= 3 && firstCalls.length < 8, `only rows on screen are fetched (${firstCalls.join(',')})`);
  await shot(page, 'list-view.png');

  // One column: Down walks the rows, Left opens the rail; rows further down load as they appear.
  const steps = ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'L'];
  const expected = ['lang:telugu', 'genre:News', 'card:0', 'card:1', 'card:2', 'card:3', 'card:4', 'card:5', 'card:6', 'card:7', 'rail:telugu'];
  const seen = [];
  for (const step of steps) { await press(page, step); seen.push(await focusName(page)); }
  assert.deepStrictEqual(seen, expected, 'list d-pad focus trail');
  await page.waitForTimeout(600);
  const allCalls = await epgCalls();
  assert.deepStrictEqual([...new Set(allCalls)].sort(), ['140', '141', '142', '143', '144', '145', '146', '147'], 'every row is fetched once scrolled to');
  assert.strictEqual(allCalls.length, new Set(allCalls).size, 'no channel is fetched twice');

  // The layout survives a restart.
  await page.reload();
  await page.waitForTimeout(400);
  assert.ok(await page.$('.channel-list.list-view'), 'list layout is remembered');

  // OK on a row tunes that channel.
  await page.focus('.channel-card[data-index="1"]');
  await press(page, 'OK');
  assert.ok(await page.evaluate(() => document.body.classList.contains('playing')), 'OK on a row starts playback');
  assert.strictEqual(await page.textContent('#now-title'), 'Zee Telugu HD');
  await page.close();
}

async function checkOrder(browser, port) {
  // Real Jio IDs: Telugu popular, news, Christian and the TEST9 test channel, plus one Hindi channel.
  const channels = [
    ['618', 'TV9 Telugu', 'Telugu', 'News'], ['629', 'ETV Telugu', 'Telugu', 'Entertainment'], ['977', 'Calvary', 'Telugu', 'Devotional'],
    ['1112', 'Maa HD', 'Telugu', 'Entertainment'], ['1229', 'TEST9 HD', 'Telugu', 'Entertainment'], ['598', 'Sri Venkateshwar Bhakti', 'Telugu', 'Devotional'],
    ['155', 'Colors HD', 'Hindi', 'Entertainment'], ['760', 'Maa Movies HD', 'Telugu', 'Movies'], ['200', 'Sony Max', 'Hindi', 'Movies']
  ].map(([id, title, language, group]) => ({ id, title, logo: '', group, language, isDrm: false }))
    .sort((a, b) => Number(a.id) - Number(b.id)); // the TV service delivers channels in ID order
  const page = await openApp(browser, port, ['1112', '155', '977', '760', '200'], { channels });
  const titles = () => page.$$eval('.channel-card .channel-copy > strong', (nodes) => nodes.map((n) => n.textContent));
  assert.deepStrictEqual(await titles(), ['Maa HD', 'Maa Movies HD', 'Sri Venkateshwar Bhakti', 'ETV Telugu', 'TV9 Telugu', 'Calvary'], 'Telugu custom order, TEST9 hidden');
  await shot(page, 'telugu-order.png');
  await page.click('.rail-item[data-group="all"]');
  assert.deepStrictEqual(await titles(), ['Colors HD', 'Sony Max', 'Sri Venkateshwar Bhakti', 'TV9 Telugu', 'ETV Telugu', 'Maa Movies HD', 'Calvary', 'Maa HD'], 'All stays in ID order');
  await page.click('.rail-item[data-group="favorites"]');
  assert.deepStrictEqual(await titles(), ['Maa Movies HD', 'Sony Max', 'Maa HD', 'Calvary', 'Colors HD'], 'Saved: movie channels first, then the rest');
  await page.close();
}

async function checkLanguageMemory(browser, port) {
  const active = (page) => page.getAttribute('.language-chip.active', 'data-language');
  const stored = (page) => page.evaluate(() => localStorage.getItem('jiotvwebos.language.v2'));

  // A chip choice survives a restart.
  let page = await openApp(browser, port, [], { language: null });
  assert.strictEqual(await active(page), 'telugu', 'Telugu by default');
  await page.click('.language-chip[data-language="hindi"]');
  assert.strictEqual(await stored(page), '"hindi"');
  await page.reload(); await page.waitForTimeout(400);
  assert.strictEqual(await active(page), 'hindi', 'Hindi is remembered after a restart');

  // So does a rail choice.
  await page.click('.rail-item[data-group="all"]');
  await page.reload(); await page.waitForTimeout(400);
  assert.strictEqual(await active(page), 'all', 'All is remembered after a restart');
  await page.close();

  // A value saved unquoted by builds up to 0.4.11 is still understood.
  page = await openApp(browser, port, [], { language: 'english' });
  assert.strictEqual(await active(page), 'english', 'old unquoted value is read');
  await page.close();
}

async function checkQuality(browser, port) {
  const page = await openApp(browser, port, [], { signedIn: true, service: true, stream: true });
  const button = () => page.textContent('#quality-button');
  const level = () => page.evaluate(() => new URL(document.getElementById('player').src).searchParams.get('level'));
  const menuOpen = () => page.evaluate(() => !document.getElementById('quality-menu').hidden);
  await page.focus('.channel-card[data-index="0"]');
  await press(page, 'OK');
  await page.waitForTimeout(300);
  assert.strictEqual(await button(), 'Quality: Auto', 'a channel starts on Auto');
  assert.strictEqual(await level(), '0', 'Auto starts at the best level');

  // Left from play/pause reaches Quality; OK opens the menu on the current choice.
  await press(page, 'L');
  assert.strictEqual(await focusName(page), 'quality-button');
  await press(page, 'OK');
  const options = await page.$$eval('.quality-option', (nodes) => nodes.map((n) => n.textContent));
  assert.deepStrictEqual(options, ['Auto', '1080p · 5.0 Mbps', '720p · 3.2 Mbps', '480p · 1.4 Mbps']);
  assert.strictEqual(await page.evaluate(() => document.activeElement.textContent), 'Auto', 'focus starts on the current choice');
  await shot(page, 'quality-menu.png');

  // Pin 720p with the remote.
  await press(page, 'D'); await press(page, 'D'); await press(page, 'OK');
  assert.strictEqual(await menuOpen(), false, 'menu closes after a choice');
  assert.strictEqual(await focusName(page), 'quality-button');
  assert.strictEqual(await button(), 'Quality: 720p');
  assert.strictEqual(await level(), '1', 'the 720p stream is loaded');

  // Back closes the menu without leaving the channel.
  await press(page, 'OK');
  assert.strictEqual(await page.evaluate(() => document.activeElement.textContent), '720p · 3.2 Mbps');
  await press(page, 'BACK');
  assert.strictEqual(await menuOpen(), false, 'Back closes the menu');
  assert.ok(await page.evaluate(() => document.body.classList.contains('playing')), 'still on the channel');

  // A stream failure after the grace period steps down and hands control back to Auto.
  await page.waitForTimeout(2700);
  await page.evaluate(() => document.getElementById('player').dispatchEvent(new Event('error')));
  assert.strictEqual(await button(), 'Quality: Auto', 'an automatic step-down ends the pinned choice');
  assert.strictEqual(await level(), '2', 'dropped one level to 480p');
  await page.close();
}

(async () => {
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    for (const check of [checkDpad, checkSaved, checkTopBar, checkListView, checkOrder, checkLanguageMemory, checkQuality]) { await check(browser, port); console.log(`pass  ${check.name}`); }
  } catch (error) {
    console.error(`FAIL  ${error.message}`); process.exitCode = 1;
  } finally { await browser.close(); server.close(); }
})();
