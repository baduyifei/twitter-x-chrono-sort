# X Chrono Sort

A Chrome extension (Manifest V3) that forces Twitter/X timelines into strict chronological order — newest→oldest or oldest→newest — on user profile pages and tweet detail pages. No algorithmic re-ranking, no recommended interleaving, just timestamps.

> Companion to [twitter-x-24h-time-userscript](https://github.com/baduyifei/twitter-x-24h-time) (24-hour timestamp conversion). This project tackles a different irritant: the order Twitter renders posts in.

## Why

Even on the "Latest" tab, Twitter's profile and reply views re-rank by engagement, threading, and other signals, which makes it hard to read a conversation as it happened. This extension applies a floor-level guarantee: visual order matches `<time datetime>` exactly.

## What it does

- On a user profile (`/<username>`, `/<username>/with_replies`, `/<username>/media`, …) — sorts the timeline.
- On a tweet detail page (`/<username>/status/<id>`) — sorts the reply list; the original tweet stays pinned at the top.
- Everywhere else (home feed, explore, notifications, messages, settings, modal photo views) — does nothing.
- Your last-chosen sort direction is remembered across page reloads, new tabs, and browser restarts (via `chrome.storage.local`). To stop sorting, pick "默认顺序" — the choice itself is what's persisted.

## Install (developer mode)

1. Clone or download this repo.
2. Open `chrome://extensions` in Chrome.
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and choose the repo folder.
5. Open any Twitter/X profile or tweet detail page — a green/blue floating clock button appears in the bottom-right.

## Usage

Click the floating button to open the menu:

| Option | Effect |
| --- | --- |
| ↓ 从新到旧 (newest first) | Most recent post at the top |
| ↑ 从旧到新 (oldest first) | Earliest post at the top |
| ⊘ 默认顺序 (default) | Restore Twitter's native order |

When sorting is active, the button turns green. The button hides itself on pages where sorting doesn't apply.

## How it works (short version)

Rather than re-ordering DOM nodes (which React would un-do), the extension uses CSS flex `order` on each tweet cell, computed from the cell's `<time datetime>`. Twitter's virtualization (`position: absolute; transform: matrix(...)`) is overridden with `!important` rules so the flex container can lay cells out top-to-bottom by `order` value.

See [CLAUDE.md](./CLAUDE.md) for the architecture deep dive — sentinel values, SPA route hooks, MutationObserver bookkeeping, and the selector dependencies that are most likely to break on Twitter UI refactors.

## Known limits

- **Only sorts what's already loaded.** Twitter loads tweets in batches as you scroll; the extension does not auto-scroll to load more. Scroll yourself, and newly loaded cells are picked up by a MutationObserver.
- **Twitter UI changes will break the selectors.** They are all isolated near the top of the sort-core section in `content.js` for quick patching.
- **Logged-in only.** The DOM structure under the logged-out web view differs and isn't supported in this version.
- **No pinned-tweet handling yet.** On profiles with a pinned tweet, the pinned cell is sorted along with the rest. (Planned: keep it at top regardless of sort direction.)

## File layout

```
.
├── manifest.json     # MV3 config: content_script on x.com / twitter.com
├── content.js        # All logic (state, page detect, route observer, sort, UI)
├── content.css       # FAB + menu styles + .xcs-sorted overrides
├── icons/            # 16/48/128px placeholders (Twitter-blue squares)
├── CLAUDE.md         # Architecture & maintenance notes
└── README.md
```

## License

MIT.
