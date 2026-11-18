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
const KEYS = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight', OK: 'Enter' };
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

async function openApp(browser, port, favorites) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.addInitScript(({ channels, favorites }) => {
    localStorage.setItem('jtv-webos.channels.v1', JSON.stringify(channels));
    localStorage.setItem('jtv-webos.favorites.v1', JSON.stringify(favorites));
    localStorage.setItem('jtv-webos.language.v2', JSON.stringify('telugu'));
  }, { channels: sampleChannels(), favorites });
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
  // One Telugu and one Hindi channel saved, language chip on Telugu.
  const page = await openApp(browser, port, ['141', '140']);
  await page.click('.rail-item[data-group="favorites"]');
  const titles = () => page.$$eval('.channel-card .channel-copy > strong', (nodes) => nodes.map((n) => n.textContent));
  assert.deepStrictEqual(await titles(), ['Star Maa HD', 'Zee Telugu HD'].sort(), 'Saved lists channels of every language');
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

(async () => {
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    for (const check of [checkDpad, checkSaved]) { await check(browser, port); console.log(`pass  ${check.name}`); }
  } catch (error) {
    console.error(`FAIL  ${error.message}`); process.exitCode = 1;
  } finally { await browser.close(); server.close(); }
})();
