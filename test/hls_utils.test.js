const test = require('node:test');
const assert = require('node:assert');
const { sanitizeWebOsHlsManifest, rewriteDashManifest } = require('../service/com.codex.jtvwebos.service/hls_utils');

test('HLS: drops tags the LG player rejects, keeps the rest', () => {
  const out = sanitizeWebOsHlsManifest('#EXTM3U\n#EXT-X-PROGRAM-DATE-TIME:2026-01-01T00:00:00Z\n#EXT-X-INDEPENDENT-SEGMENTS\n#EXTINF:4,\nseg1.ts');
  assert.strictEqual(out, '#EXTM3U\n#EXTINF:4,\nseg1.ts');
});

test('HLS: leaves non-playlist text untouched', () => {
  assert.strictEqual(sanitizeWebOsHlsManifest('<html>#EXT-X-DATERANGE:x</html>'), '<html>#EXT-X-DATERANGE:x</html>');
});

test('DASH: adds an absolute BaseURL pointing at the manifest folder', () => {
  const out = rewriteDashManifest('<MPD a="1"><Period/></MPD>', 'https://cdn.jio.com/live/ch1/index.mpd?x=1&y=2');
  assert.strictEqual(out, '<MPD a="1"><BaseURL>https://cdn.jio.com/live/ch1/</BaseURL><Period/></MPD>');
});

test('DASH: resolves a relative BaseURL and keeps an absolute one', () => {
  const url = 'https://cdn.jio.com/live/ch1/index.mpd';
  assert.strictEqual(rewriteDashManifest('<MPD><BaseURL>dash/</BaseURL><Period/></MPD>', url), '<MPD><BaseURL>https://cdn.jio.com/live/ch1/dash/</BaseURL><Period/></MPD>');
  const absolute = '<MPD><BaseURL>https://other.jio.com/a/</BaseURL><Period/></MPD>';
  assert.strictEqual(rewriteDashManifest(absolute, url), absolute);
});
