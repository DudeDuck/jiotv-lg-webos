# Fix tracker

Findings from the code review of 2026-11-16. When an item is fixed, tick its box, fill in **Fixed in** with the commit hash, and add a short **Comment** on what was done and how it was checked.

| # | Item | Priority | Status |
|---|------|----------|--------|
| 1 | Saved cannot be used with the TV remote | Must fix | Fixed |
| 2 | Package ships `.git`, README and a second service copy | Should fix | Fixed |
| 3 | Programme guide drops shows whose times arrive as text | Should fix | Fixed |
| 4 | Every channel change rebuilds the whole channel grid | Should fix | Fixed |
| 5 | Unused code in app and service | Should fix | Fixed |
| 6 | No tests | Should fix | Fixed |
| 7 | Rail language choice is forgotten on restart | Nice to have | Fixed |
| 8 | Search icon does not show on the TV | Reported on TV | Fixed, not yet confirmed on TV |

---

## 1. Saved cannot be used with the TV remote

- [x] Fixed
- **Where:** `app.js`, channel card `contextmenu` listener (line 161)
- **Problem:** `toggleFavorite` is only called on right-click. The LG remote has no right-click, so nothing can be saved and the Saved list stays empty.
- **Fix:** In the keydown handler, when a channel card has focus and the Red key (keyCode 403) is pressed, look up the channel by `dataset.channelId` and call `toggleFavorite`. Change the empty-state hint to "Press Red on a channel to save it".
- **Verify:** On the TV, press Red on a channel, open Saved, and confirm the channel is listed. Press Red again and confirm it is removed.
- **Fixed in:** `54806b7` (version 0.4.2)
- **Comment:** Red key (keyCode 403) on a focused channel card now calls `toggleFavorite`; the empty Saved hint says to press Red. Checked in the 1080p browser preview with a simulated Red key: saves, removes, focus stays on the card. Not yet checked with the real remote.

## 2. Package ships `.git`, README and a second service copy

- [x] Fixed
- **Where:** `README.md` line 29 and `.github/workflows/build-webos-ipk.yml` line 60 (`ares-package . service/...`)
- **Problem:** `ares-package .` packs the whole repo folder. The `.ipk` contains `.git` (81 files, 416 KB of history, branch names, git name and email), `README.md`, `.github/`, and a second copy of `service/`. On GitHub's build server, `actions/checkout@v4` writes the job's access token into `.git/config`, so the published build download carries it too. The token expires when the job ends.
- **Fix:** Add an `exclude` list to `appinfo.json`, which `ares-package` reads. The service is still packaged once, from its own argument.
- **Verify:** Build, then run `ar x <file>.ipk && tar -tzf data.tar.gz` and confirm none of the excluded paths appear and `jio_service.js` appears only once.
- **Fixed in:** `54806b7` (version 0.4.2)
- **Comment:** The fix changed from the plan: `ares-package -e` does not work on Linux in CLI 3.2.6 (it builds patterns with Windows path separators), so the excludes live in `appinfo.json` under `exclude` instead, and both build commands are unchanged. Rebuilt and listed the package: no `.git`, `.github`, `.gitignore`, `README.md`, `FIX.md`, `test/` or second `service/`; size went from 681 KB to 295 KB. Not yet installed on the TV with the new `exclude` key.

## 3. Programme guide drops shows whose times arrive as text

- [x] Fixed
- **Where:** `app.js`, `toEpochMilliseconds` (line 633)
- **Problem:** The pattern is written `\\d` instead of `\d`. A time sent as text, such as `"1731740000000"`, does not match, falls through to `Date.parse`, becomes "not a number", and the show is discarded. It only works today if Jio sends real numbers.
- **Fix:** Change the pattern to `/^-?\d+(?:\.\d+)?$/`.
- **Verify:** `node -e 'console.log(/^-?\d+(?:\.\d+)?$/.test("1731740000000"))'` prints `true`. On the TV, press Yellow on a channel and confirm the guide shows the current and upcoming programmes.
- **Fixed in:** `54806b7` (version 0.4.2)
- **Comment:** Pattern corrected to `/^-?\d+(?:\.\d+)?$/`. Covered by reasoning and `node --check` only; the guide was not exercised against Jio.

## 4. Every channel change rebuilds the whole channel grid

- [x] Fixed
- **Where:** `app.js`, `play()` (line 510, `state.active = channel; render();`)
- **Problem:** `render()` recreates every channel card on each channel change, while the grid is hidden behind the video. `stopPlayback()` already rebuilds it when you go back, so this work is wasted at the moment the TV is starting the stream.
- **Fix:** Delete `render();` from that line.
- **Verify:** On the TV, use Channel Up/Down several times, then press Back and confirm the grid shows and focus returns to the last channel.
- **Fixed in:** `54806b7` (version 0.4.2)
- **Comment:** Removed `render()` from `play()`. `stopPlayback()` still rebuilds the grid on return. Not exercised with real playback.

## 5. Unused code in app and service

- [x] Fixed
- **Where:**
  - `app.js` lines 353-379: `parseQualityLevels`, `discoverQualityLevels`
  - `jio_service.js` lines 684-694: `getQualityLevels`
  - `jio_service.js` lines 1049-1056: `auth/refresh` and `proxy/qualities` commands
  - `jio_service.js` lines 1083-1087: `proxy/stop` command
- **Problem:** None of these have callers. Quality levels come from `proxy/resolve`, and the proxy stops when its subscription is cancelled.
- **Fix:** Delete them, about 50 lines. Search for each name first to confirm it is still unused.
- **Verify:** `node --check` passes on both files, and a channel still plays and steps down in quality when buffering.
- **Fixed in:** `54806b7` (version 0.4.2)
- **Comment:** Deleted `parseQualityLevels`, `discoverQualityLevels`, `getQualityLevels` and the `proxy/qualities`, `auth/refresh`, `proxy/stop` commands (53 lines). Searched both files afterwards: no remaining references. `node --check` passes.

## 6. No tests

- [x] Fixed
- **Where:** `service/com.codex.jtvwebos.service/hls_utils.js`
- **Problem:** This module rewrites every stream playlist before the TV plays it, and nothing checks it. The two `\\d` typos also got in because no code runs outside the TV.
- **Fix:** Add `test/hls_utils.test.js` using Node's built-in `node:test`. Feed one sample HLS playlist and one sample DASH manifest through the module and check the output. Add `node --test` to the build workflow. No new dependency.
- **Verify:** `node --test` passes locally and in the GitHub build.
- **Fixed in:** `54806b7` (version 0.4.2)
- **Comment:** Added `test/hls_utils.test.js` (4 tests, Node built-in runner, no dependency) and a `node --test` step plus `test/**` trigger in the build workflow. `node --test` passes locally; the GitHub run has not happened yet.

## 7. Rail language choice is forgotten on restart

- [x] Fixed
- **Where:** `app.js`, rail click handler (line 929)
- **Problem:** Language chips save the choice; the rail items do not. Picking "All" in the rail and restarting the app returns to the default language.
- **Fix:** Add `localStorage.setItem(LANGUAGE_KEY, list)` in the non-Saved branch of the handler.
- **Verify:** Pick "All" in the rail, restart the app, and confirm "All" is still selected.
- **Fixed in:** `54806b7` (version 0.4.2)
- **Comment:** Rail language choice is now saved with `localStorage.setItem(LANGUAGE_KEY, list)`. Checked in the browser preview: picking All in the rail stores `all`.

## 8. Search icon does not show on the TV

- [x] Fixed
- **Where:** `index.html` line 20, `styles.css` `.search-wrap` icon rule
- **Problem:** The icon was a text character, U+2315 (TELEPHONE RECORDER). It is a rare character that the TV's font does not have, so nothing was drawn. It showed in desktop browsers because their fonts include it.
- **Fix:** Replace the character with a small inline SVG magnifier, which does not depend on any font.
- **Verify:** On the TV, the magnifier shows at the left of the search box.
- **Fixed in:** `54806b7` (version 0.4.3)
- **Comment:** Renders in the 1080p browser preview. The other icons (grid, star, gear, play, pause) are also text characters; they were not reported missing, so they were left alone. Not yet confirmed on the TV.
