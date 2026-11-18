# Fix tracker

Findings from the code review of 2026-11-16 (items 1-8) the repo audit of 2026-11-18 (items 9-13) and the review of those fixes (items 14-15). When an item is fixed, tick its box, fill in **Fixed in** with the commit hash, and add a short **Comment** on what was done and how it was checked.

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
| 9 | Saved hides saved channels from other languages | Must fix | Fixed |
| 10 | GitHub never builds or tests the fork | Should fix | Fixed |
| 11 | Virtual TV and d-pad test are not in the repo | Should fix | Fixed |
| 12 | Removing a channel inside Saved drops the focus | Nice to have | Fixed |
| 13 | README does not mention the Red button | Nice to have | Fixed |
| 14 | The Saved check does not test cross-language saving | Should fix | Fixed |
| 15 | Language chips do nothing while Saved is open | Should fix | Fixed |

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
- **Where:** `service/jiotvwebos.service/hls_utils.js`
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

## 9. Saved hides saved channels from other languages

- [x] Fixed
- **Where:** `app.js`, `filteredChannels` (line 91), `render` heading (line 103) and empty-state check (line 177)
- **Problem:** The Saved list and the language chip both filter at once. With Zee Telugu HD and Colors HD (Hindi) saved and the language on Telugu, Saved shows only the Telugu channel under "Telugu channels". The Hindi one looks lost.
- **Fix:** Skip the language check when Saved is open, show the heading "Saved channels", and drop the `state.language === 'all'` condition from the "No saved channels yet" message.
- **Verify:** Save one Telugu and one Hindi channel, open Saved with Telugu selected, and see both.
- **Fixed in:** `2a45180` (version 0.4.4)
- **Comment:** Saved now ignores the language chip, shows the heading "Saved channels", and the empty message no longer depends on the language. `npm run tv` checks that Saved lists saved channels. Note: the first version of that check saved two Telugu channels, so it did not test other languages; item 14 corrected it to use one Telugu and one Hindi channel.

## 10. GitHub never builds or tests the fork

- [x] Fixed
- **Where:** GitHub repo settings for `DudeDuck/jiotv-lg-webos` (Actions)
- **Problem:** GitHub turns Actions off on forks by default. The run list is empty, so the syntax check, `node --test` and package build have never run there.
- **Fix:** Enable Actions for the repo (Actions tab, or `gh api` on the repo's actions permissions). No code change.
- **Verify:** Push a commit and see a green run in the Actions tab.
- **Fixed in:** `2a45180` (version 0.4.4)
- **Comment:** Actions was off on the fork. Enabled it with `gh api` (repo actions permissions); the Build webOS IPK workflow now shows as active. No run has happened yet; the first one starts on the next push, so the green run is still to be confirmed.

## 11. Virtual TV and d-pad test are not in the repo

- [x] Fixed
- **Where:** new `tools/virtual-tv.js`, `package.json`
- **Problem:** The 1080p browser preview and the scripted d-pad test lived in a temporary folder that has since been cleared. Home-screen navigation had three bugs and now has no test anywhere.
- **Fix:** Commit one script that serves the app with sample channels, replays a fixed d-pad sequence, checks where focus lands, and can take screenshots. `playwright-core` is a development-only dependency. Keep the script out of the TV package. Do not match Node's test file patterns, so `node --test` in the build still skips it.
- **Verify:** `npm run tv` prints a pass for navigation and for the Saved list.
- **Fixed in:** `2a45180` (version 0.4.4)
- **Comment:** Added `tools/virtual-tv.js` and `package.json` with `playwright-core` as the only (development) dependency. `npm run tv` runs a d-pad focus-trail check and the Saved checks; both pass. It is kept out of the TV package through `appinfo.json` excludes (tools, node_modules, app-level package files) and is not picked up by `node --test`. The service's own `package.json` stays in the package, which I checked by listing the rebuilt `.ipk`. Needs a browser: set `CHROMIUM_PATH` or run `npx playwright-core install chromium-headless-shell`. It is not run in the GitHub build.

## 12. Removing a channel inside Saved drops the focus

- [x] Fixed
- **Where:** `app.js`, `toggleFavorite`
- **Problem:** Inside Saved, an unsaved card disappears after the grid rebuilds, so there is nothing to refocus and the next arrow press jumps to the language row.
- **Fix:** When the card is gone, focus the card now at the same position, or the last one, or the Saved rail item if the list is empty.
- **Verify:** In Saved with three channels, press Red on the middle one; focus lands on the next card.
- **Fixed in:** `2a45180` (version 0.4.4)
- **Comment:** `toggleFavorite` now focuses the card that takes the removed card's place, or the last card, or the Saved rail item when the list is empty. Covered by the Saved check in `npm run tv`. Not yet tried with the real remote.

## 13. README does not mention the Red button

- [x] Fixed
- **Where:** `README.md`, Features list
- **Problem:** The only hint about saving is on the empty Saved screen, which disappears once one channel is saved.
- **Fix:** Add one line to Features, and a short note on the virtual TV under Build.
- **Verify:** Read the README.
- **Fixed in:** `2a45180` (version 0.4.4)
- **Comment:** Added the Red button line to Features, and a short note about `npm run tv` in the Build section.

## 14. The Saved check does not test cross-language saving

- [x] Fixed
- **Where:** `tools/virtual-tv.js`, `checkSaved`
- **Problem:** The check saved ids 140 and 141, which are both Telugu in the sample list (Telugu is 140-147, Hindi 148-150). With only the language fix undone in a copy of the repo, the check still passed. The comment on item 9 says one Telugu and one Hindi channel were used, which was not true.
- **Fix:** Save 141 (Zee Telugu HD) and 148 (Colors HD) and expect both, in list order. Correct the comment on item 9.
- **Verify:** Undo only the language fix in a copy and confirm `npm run tv` fails.
- **Fixed in:** `b93aef6` (version 0.4.7)
- **Comment:** `checkSaved` now saves Zee Telugu HD (141) and Colors HD (Hindi, 148) and expects both, in list order. Verified by undoing only the language fix in a copy: the check now fails. The comment on item 9 is corrected.

## 15. Language chips do nothing while Saved is open

- [x] Fixed
- **Where:** `app.js`, `render` (language row visibility)
- **Problem:** Saved now ignores the language filter, but the chips are still shown with Telugu highlighted. Pressing Hindi inside Saved highlights the chip and changes nothing.
- **Fix:** Hide the language row while Saved is open. The d-pad skips hidden rows already.
- **Verify:** Open Saved and confirm the language row is gone and Up/Down still move through the remaining rows.
- **Fixed in:** `b93aef6` (version 0.4.7)
- **Comment:** The language row is hidden while Saved is open (`app.js` `render`). `checkSaved` asserts it is hidden; verified by undoing the change in a copy: the check fails. The d-pad check still passes, including Right from the Saved rail item into the list. Not yet tried on the TV.
