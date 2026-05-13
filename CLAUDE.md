# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Chrome Manifest V3 extension that re-orders Twitter/X timelines strictly by timestamp (newest→oldest or oldest→newest). Activates on user profile pages and tweet detail pages; ignored everywhere else.

## Development workflow

No build step — pure JS + plain CSS, loaded directly as an unpacked extension.

- Load: `chrome://extensions` → enable Developer mode → "Load unpacked" → select repo root.
- After editing any file: click the reload icon on the extension card in `chrome://extensions`, then refresh the open Twitter/X tab. The extension does NOT hot-reload — a tab refresh alone runs the *previously-loaded* JS.
- No test runner. Verification is done by hand in a browser (load profile → click FAB → check order).
- Selector regressions are the most likely failure mode; see "Fragile selectors" below.

## Architecture

Everything lives in `content.js`, sectioned by `// ====` banners. The order matters — read it top-to-bottom:

1. **State** — `state.mode` (`off`/`newest`/`oldest`) and `state.pageType` (`profile`/`status`/`other`).
2. **Page type detection** — URL pathname → page type, with `RESERVED_TOP_LEVEL` blocklist (`home`, `explore`, `i`, etc.) and `PROFILE_SUFFIX` allowlist (`with_replies`, `media`, …). Photo modals (`/u/photo`, `/u/header_photo`) fall through to `other`.
3. **SPA route observer** — overrides `history.pushState`/`replaceState`, listens to `popstate`, plus a 500ms `setInterval` polling fallback. All three call the same `fire()` which de-dupes via `lastUrl`.
4. **Sort core** — the non-obvious bit:
   - **Does not reorder DOM.** Re-ordering nodes triggers React reconciliation. Instead, the timeline container gets class `xcs-sorted` and each cell gets inline `style.order`. CSS in `content.css` switches the container to `display: flex; flex-direction: column` and overrides Twitter's virtualization (`position: absolute; transform: matrix(...)`) with `!important`.
   - **Order value math:** `Date.parse(datetime) / 1000` → seconds (≈1.78e9). Using milliseconds would overflow CSS `order`'s int32 range.
   - **Sentinels:**
     - `ORIGINAL_SENTINEL = -2_147_483_647` — pins the original tweet on status pages to the very top, identified via `article[tabindex="-1"]` (Twitter sets this on the focused/main tweet).
     - `SENTINEL_END = 2_000_000_000` — sinks cells with no timestamp (reply input, "show more" buttons, dividers) to the bottom.
   - **MutationObserver** on the container handles cells that arrive after sort is enabled (scroll-load, lazy timestamps). It re-uses one observer instance and re-`observe()`s when the container changes (SPA navigation between profiles).
5. **Persistence** — only `state.mode` is persisted, under key `xcsMode` in `chrome.storage.local`. `loadPersistedMode()` is async and validates against `VALID_MODES` (treats anything else as `'off'`); `persistMode()` rejects invalid input. `state.pageType` is *not* persisted — always re-derived from URL.
6. **UI** — fixed-position floating button (`#xcs-root`) in the bottom-right. All DOM/CSS uses an `xcs-` prefix to avoid colliding with Twitter. Click-outside closes the menu via a capture-phase listener on `document`.
7. **Boot** — runs once at `document_idle`; calls `buildUI()`, sets initial pageType, hooks route observer, *then* asynchronously restores the persisted mode and re-applies visibility (this is why boot first renders in `'off'` and may switch a beat later — avoids blocking the FAB on storage I/O).

## Fragile selectors

These come from Twitter's current DOM and will break on UI refactors. Keep them all at the top of the sort-core section in `content.js` so they're easy to update.

| Selector | Purpose | Used in |
| --- | --- | --- |
| `[data-testid="cellInnerDiv"]` | Tweet cell (every row in the timeline) | `SEL_CELL` |
| `article[data-testid="tweet"]` | Tweet article inside a cell | `SEL_TWEET` |
| `article[tabindex="-1"]` | Original tweet on status pages | `isOriginalTweet()` |
| `time[datetime]` | Sort key source | `getCellTimestamp()` |

## Related project

`../vibe02-x-24h-time-userscript/twitter-x-24h-time.user.js` is the sibling Tampermonkey script that established the `MutationObserver({childList, subtree})` walking pattern reused here. Look there for prior art on Twitter DOM observation.
