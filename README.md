# Tab Table + Swiper

A Chrome extension that shows every open tab across all your windows in one sortable table, and helps you clean them up.

Click the toolbar icon to open Tab Table + Swiper in a new tab. It has three views: **Open tabs**, **Swipe** and **Recently closed**.

## Features

### Open tabs
- One row per tab: site, page title, URL, window number and copy count, with site icons.
- Tabs are grouped by site (`www.` dropped). Each group has a **Close N** button that closes every tab in it.
- Click any column header to sort. URL is the default.
- **Duplicates**: tabs with the same URL (ignoring `#fragment`, trailing slash and host case) get an amber stripe and a `×N` badge. **Duplicates only** hides the rest.
- Each row has **Go** (switch to the tab) and **Close**. Closing shows an **Undo** in the status line, which brings the tabs back unloaded in their original window and position.
- Updates live as tabs open, close and change.
- The extension's own pages are hidden, so you can't close them by accident.

### Swipe
- One open tab at a time as a card. **←** closes it, **→** keeps it.
- **Undo** (button, **Z**, **Backspace** or **⌘Z**/**Ctrl+Z**) steps back through decisions. Closed tabs come back unloaded.
- Cards show the page's Open Graph preview: image, title, description, site name. These need an optional "read all sites" permission, which Tab Table + Swiper only asks for when you click **Allow** in the Swipe view. Pages are fetched directly from each site without your cookies.
- Without that permission, cards show the tab's title, icon and URL.

### Recently closed
- Every tab closed from Tab Table + Swiper (table, group button or Swipe), newest first, with when it was closed.
- **Reopen**, **Forget**, **Reopen all** and **Clear list** (with Undo). Keeps the latest 500 and survives restarts.

### CSV export and import
- **Export CSV** saves every tab (Site, Title, URL, Window) in the current sort order. Cells starting with `=`, `+`, `-` or `@` are prefixed with `'` so spreadsheets don't run them as formulas.
- **Import CSV…** accepts comma, tab, semicolon or `|` separated files, with or without a header row:
  - The URL column is found by its contents. Bare domains like `example.com/page` get `https://` added.
  - Title and site columns are matched by header names (`Page Name`, `Website`, `Link Text`…) or guessed from the contents.
  - Only web links are opened. `javascript:` and similar are dropped.
  - Links open as **unloaded tabs** in the current window: they appear in the tab strip but don't load until clicked. Links already open, and repeats within the file, are skipped.
  - The status line reports how many opened and which columns were used.

### Tab suspender support
Tabs suspended by extensions like Tab Suspender (`chrome-extension://…suspended.html#…uri=…`) are read as their real URL. They group, de-duplicate, export and preview correctly, and exported suspender URLs import as the real link.

## Install
1. Clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the repo folder.
4. Pin the extension and click its icon.

After pulling changes, click the reload icon on the extension's card in `chrome://extensions`.

## Permissions
| Permission | Why |
|---|---|
| `tabs` | Read tab titles and URLs across windows |
| `favicon` | Show site icons from Chrome's icon cache |
| `storage` | Keep the Recently closed list |
| `<all_urls>` (optional) | Fetch pages for Swipe previews. Only requested when you click **Allow** |

## Files
| File | What it does |
|---|---|
| `manifest.json` | Extension manifest (MV3) |
| `background.js` | Opens Tab Table + Swiper when the toolbar icon is clicked |
| `tabs.html` | Page layout and styles (light and dark) |
| `tabs.js` | Open tabs table, closing and undo, Recently closed, import/export |
| `swipe.js` | Swipe view and Open Graph previews |
| `csv.js` | CSV parsing/export, column detection, duplicate keys, suspender URL unwrapping |
| `test.js` | Tests for `csv.js` |

## Tests
```
node test.js
```
No dependencies. Only `csv.js` is tested; the UI is plain JavaScript run in Chrome.
