const $ = id => document.getElementById(id);
let rows = [], sortKey = 'url', sortDir = 1, timer;

const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
const cmp = (a, b) => sortDir * String(a[sortKey]).localeCompare(String(b[sortKey]), undefined, { numeric: true, sensitivity: 'base' })
  || a.url.localeCompare(b.url);

async function load() {
  const tabs = await chrome.tabs.query({});
  const self = chrome.runtime.getURL('');
  const win = new Map();
  // Hide every Tab Table + Swiper page (not just this one) so it can't be closed from the table or Swipe.
  rows = tabs.filter(t => !(t.url || t.pendingUrl || '').startsWith(self)).map(t => {
    if (!win.has(t.windowId)) win.set(t.windowId, win.size + 1);
    const url = unwrapSuspended(t.url || t.pendingUrl || '');
    return { tab: t, url, title: t.title || url, site: siteOf(url), window: win.get(t.windowId) };
  });
  const n = {};
  for (const r of rows) n[r.key = dupKey(r.url)] = (n[r.key] || 0) + 1;
  for (const r of rows) r.copies = n[r.key] > 1 ? n[r.key] : '';
  render();
}

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}
const button = (label, fn, props) => el('button', { textContent: label, onclick: fn, ...props });
// Chrome's built-in favicon cache (needs the "favicon" permission); works for imported links too.
const fav = url => el('img', { className: 'fav', alt: '', width: 16, height: 16, loading: 'lazy',
  src: `/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32` });

// --- Recently closed: only tabs closed from this page, kept in chrome.storage.local ---
const MAX_CLOSED = 500; // ponytail: oldest entries dropped past this
const getClosed = async () => (await chrome.storage.local.get({ closed: [] })).closed;
const setClosed = list => chrome.storage.local.set({ closed: list.slice(0, MAX_CLOSED) });
const forget = async ids => setClosed((await getClosed()).filter(c => !ids.includes(c.id)));

// Reopen in the original window/position, falling back to the current window if it's gone.
// unloaded: discard right away (used by Undo) so it sits in the tab strip without loading.
function reopen(cs, { unloaded = false } = {}) {
  for (const c of [...cs].sort((a, b) => a.index - b.index))
    chrome.tabs.create({ url: c.url, windowId: c.windowId, index: c.index, active: false })
      .catch(() => chrome.tabs.create({ url: c.url, active: false }))
      .then(tab => unloaded && discardWhenReady(tab.id));
  forget(cs.map(c => c.id));
}

async function closeTabs(rs) {
  const closedAt = Date.now();
  const entries = rs.map(r => ({ id: crypto.randomUUID(), url: r.url, title: r.title, site: r.site,
    windowId: r.tab.windowId, index: r.tab.index, closedAt }));
  await setClosed([...entries, ...await getClosed()]);
  chrome.tabs.remove(rs.map(r => r.tab.id));
  $('status').replaceChildren(`Closed ${plural(entries.length, 'tab')}.`, button('Undo', () => {
    reopen(entries, { unloaded: true });
    $('status').textContent = `Reopened ${plural(entries.length, 'tab')}.`;
  }));
  return entries;
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const dtf = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
function ago(t) {
  const s = (t - Date.now()) / 1000;
  for (const [unit, n] of [['day', 86400], ['hour', 3600], ['minute', 60]])
    if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), unit);
  return rtf.format(0, 'second');
}

async function renderClosed() {
  const list = await getClosed();
  $('closedCount').textContent = list.length ? list.length.toLocaleString() : '';
  $('reopenAll').disabled = $('clearClosed').disabled = !list.length;
  $('closedRows').replaceChildren(...(list.length ? list.map(c => {
    const tr = el('tr');
    tr.insertCell().append(button('Reopen', () => reopen([c]), { ariaLabel: `Reopen ${c.title}` }),
      button('Forget', () => forget([c.id]), { className: 'danger', ariaLabel: `Remove ${c.title} from list` }));
    tr.insertCell().append(fav(c.url), c.title);
    tr.insertCell().append(c.url);
    tr.cells[2].className = 'url';
    tr.cells[2].translate = false;
    tr.insertCell().append(el('time', { dateTime: new Date(c.closedAt).toISOString(), textContent: ago(c.closedAt), title: dtf.format(c.closedAt) }));
    tr.cells[1].title = c.title;
    tr.cells[2].title = c.url;
    return tr;
  }) : [el('tr', {}, el('td', { className: 'empty', colSpan: 4, textContent: 'Tabs you close from Tab Table + Swiper show up here.' }))]));
}

$('reopenAll').onclick = async () => reopen(await getClosed());
$('clearClosed').onclick = async () => {
  const prev = await getClosed();
  await setClosed([]);
  $('status').replaceChildren(`Cleared ${prev.length.toLocaleString()} ${prev.length === 1 ? 'entry' : 'entries'}.`,
    button('Undo', async () => { await setClosed(prev); $('status').textContent = ''; }));
};
chrome.storage.onChanged.addListener(c => { if (c.closed) renderClosed(); });
setInterval(renderClosed, 60_000); // keep "x minutes ago" fresh

// View switch lives in the URL hash so reload/back keep it.
function showView() {
  const view = { '#closed': 'closed', '#swipe': 'swipe' }[location.hash] || 'open';
  document.body.dataset.view = view;
  $('tabOpen').ariaSelected = String(view === 'open');
  $('tabSwipe').ariaSelected = String(view === 'swipe');
  $('tabClosed').ariaSelected = String(view === 'closed');
  if (typeof renderSwipe === 'function') renderSwipe(); // undefined on first call, before swipe.js loads
}
addEventListener('hashchange', showView);
showView();
renderClosed();

function row(r) {
  const tr = el('tr', { className: r.copies ? 'dup' : '' });
  tr.insertCell().append(
    button('Go', () => { chrome.tabs.update(r.tab.id, { active: true }); chrome.windows.update(r.tab.windowId, { focused: true }); },
      { ariaLabel: `Go to ${r.title}` }),
    button('Close', () => closeTabs([r]), { className: 'danger', ariaLabel: `Close ${r.title}` }));
  tr.insertCell().append(r.site);
  tr.insertCell().append(fav(r.url), r.title);
  tr.insertCell().append(r.url);
  tr.cells[3].className = 'url';
  tr.cells[3].translate = false;
  tr.insertCell().append(r.window);
  tr.insertCell().append(r.copies ? el('span', { className: 'badge', textContent: `×${r.copies}`, title: `${r.copies} copies` }) : '');
  for (const td of [tr.cells[1], tr.cells[2], tr.cells[3]]) td.title = td.textContent;
  return tr;
}

function render() {
  const dupOnly = $('dupOnly').checked;
  // Group by site (base URL); groups A→Z (Z→A when sorting by Site descending), rows within a group by the current sort.
  const groups = new Map();
  for (const r of [...rows].sort(cmp).filter(r => !dupOnly || r.copies)) {
    const g = r.site || '(other)';
    groups.has(g) ? groups.get(g).push(r) : groups.set(g, [r]);
  }
  const dir = sortKey === 'site' ? sortDir : 1;
  const out = [];
  for (const [site, items] of [...groups].sort(([a], [b]) => dir * a.localeCompare(b))) {
    const tr = el('tr', { className: 'group' });
    tr.insertCell().append(button(`Close ${items.length}`, () => closeTabs(items),
      { className: 'danger', ariaLabel: `Close ${plural(items.length, 'tab')} from ${site}` }));
    const label = tr.insertCell();
    label.colSpan = 5;
    label.append(fav(items[0].url), site, el('span', { className: 'count', textContent: plural(items.length, 'link') }));
    out.push(tr, ...items.map(row));
  }
  if (!out.length) {
    const td = el('td', { className: 'empty', colSpan: 6, textContent: dupOnly ? 'No duplicate tabs. Nice and tidy.' : 'No tabs to show.' });
    out.push(el('tr', {}, td));
  }
  $('rows').replaceChildren(...out);
  renderSwipe(); // swipe.js

  const open = rows;
  const dupes = open.length - new Set(open.map(r => r.key)).size;
  const pill = (text, cls = '') => {
    const [num, ...rest] = text.split(' ');
    return el('span', { className: `pill ${cls}` }, el('b', { textContent: num }), ` ${rest.join(' ')}`);
  };
  $('summary').replaceChildren(
    pill(plural(open.length, 'tab')),
    pill(plural(new Set(open.map(r => r.window)).size, 'window')),
    pill(plural(new Set(open.map(r => r.site)).size, 'site')),
    pill(plural(dupes, 'duplicate'), dupes ? 'dup' : ''));
  for (const th of document.querySelectorAll('th[data-key]')) {
    th.dataset.sort = th.dataset.key === sortKey ? (sortDir > 0 ? '▲' : '▼') : '';
    th.ariaSort = th.dataset.key === sortKey ? (sortDir > 0 ? 'ascending' : 'descending') : 'none';
  }
}

for (const th of document.querySelectorAll('th[data-key]')) th.onclick = () => {
  sortDir = sortKey === th.dataset.key ? -sortDir : 1;
  sortKey = th.dataset.key;
  render();
};
$('dupOnly').onchange = render;

$('export').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([toCSV([...rows].sort(cmp))], { type: 'text/csv' }));
  a.download = `tabs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

$('import').onclick = () => $('file').click();
$('file').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const { links, cols } = fromCSV(await f.text());
  if (!links.length) { $('status').textContent = `Couldn't find a URL column in ${f.name}.`; return; }
  // Skip links already open, and repeats within the file.
  const seen = new Set(rows.map(r => r.key));
  const urls = links.map(l => l.url).filter(u => !seen.has(dupKey(u)) && seen.add(dupKey(u)));
  const skipped = links.length - urls.length;
  const opened = await openDiscarded(urls, n => {
    $('status').textContent = `Opening ${n.toLocaleString()} of ${plural(urls.length, 'link')} from ${f.name}…`;
  });
  const failed = urls.length - opened;
  $('status').textContent = `Opened ${plural(opened, 'link')} from ${f.name} as unloaded tabs`
    + (skipped ? `, skipped ${skipped.toLocaleString()} already open` : '')
    + (failed ? `, ${failed.toLocaleString()} couldn't be opened` : '')
    + `. Columns: URL = ${cols.url}, title = ${cols.title}, site = ${cols.site}.`;
};

// Open links as discarded (unloaded) tabs in this window: they appear in the tab strip
// but don't load until clicked. A discard can be refused until the new tab commits its
// URL, so retry on each update; give up waiting after 15s.
function discardWhenReady(tabId) {
  return new Promise(resolve => {
    const finish = () => { chrome.tabs.onUpdated.removeListener(listener); clearTimeout(t); resolve(); };
    const listener = id => { if (id === tabId) chrome.tabs.discard(tabId).then(finish, () => {}); };
    const t = setTimeout(() => chrome.tabs.discard(tabId).catch(() => {}).finally(finish), 15000);
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function openDiscarded(urls, onProgress) {
  const { id: windowId } = await chrome.windows.getCurrent();
  const queue = [...urls];
  let opened = 0;
  // ponytail: 4 at a time so a big CSV doesn't spin up hundreds of renderers at once
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const url = queue.shift();
      try {
        const tab = await chrome.tabs.create({ url, windowId, active: false });
        await discardWhenReady(tab.id);
        onProgress(++opened);
      } catch { /* e.g. file:// without file access */ }
    }
  }));
  return opened;
}

const refresh = () => { clearTimeout(timer); timer = setTimeout(load, 150); };
for (const ev of ['onCreated', 'onRemoved', 'onUpdated', 'onMoved', 'onAttached']) chrome.tabs[ev].addListener(refresh);
load();
