// Swipe view: one open tab at a time. ← closes (into Recently closed, undoable), → keeps.
// Uses globals from tabs.js: rows, cmp, closeTabs, el, button, fav, plural, $.
const kept = new Set();       // tab ids kept this session
const previews = new Map();   // url -> Promise<og data | null>
const ALL = { origins: ['<all_urls>'] };
let shownKey = null, busy = false;

// Fetch the page ourselves (no cookies) and read Open Graph / Twitter / plain meta tags.
async function fetchOG(url) {
  try {
    const res = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(8000) });
    if (!res.ok || !/html/i.test(res.headers.get('content-type') || '')) return null;
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const meta = (...keys) => {
      for (const k of keys) {
        const v = doc.querySelector(`meta[property="${k}"], meta[name="${k}"]`)?.content?.trim();
        if (v) return v;
      }
    };
    let image = meta('og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src');
    try { image = image && new URL(image, res.url).href; } catch { image = null; }
    if (!/^https?:/i.test(image || '')) image = null;
    return {
      title: meta('og:title', 'twitter:title') || doc.title.trim(),
      description: meta('og:description', 'twitter:description', 'description'),
      siteName: meta('og:site_name', 'application-name'),
      image,
    };
  } catch { return null; }
}

function preview(url) {
  if (!/^https?:/i.test(url)) return Promise.resolve(null);
  if (!previews.has(url)) previews.set(url, fetchOG(url));
  return previews.get(url);
}

const queue = () => rows.filter(r => r.tab && !kept.has(r.tab.id)).sort(cmp);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

async function renderSwipe() {
  if (document.body.dataset.view !== 'swipe') { shownKey = null; return; } // no fetching while hidden
  const q = queue();
  $('swipeProgress').textContent = `${plural(q.length, 'tab')} left · ${kept.size.toLocaleString()} kept`;
  const r = q[0];
  const key = r ? `${r.tab.id} ${r.url}` : 'done';
  if (key === shownKey) return;
  shownKey = key;
  busy = false;

  if (!r) {
    $('swipeCard').replaceChildren(el('div', { className: 'card done' },
      el('h2', { textContent: 'All caught up' }),
      el('p', { className: 'desc', textContent: kept.size ? `You kept ${plural(kept.size, 'tab')}. Start over to review them again.` : 'No open tabs to review.' })));
    $('swipeActions').hidden = true;
    return;
  }
  $('swipeActions').hidden = false;

  const media = el('div', { className: 'og-img' }, el('img', { className: 'big-fav', alt: '', width: 48, height: 48,
    src: `/_favicon/?pageUrl=${encodeURIComponent(r.url)}&size=64` }));
  const siteName = el('span', { textContent: r.site || r.url });
  const title = el('h2', { textContent: r.title });
  const desc = el('p', { className: 'desc muted', textContent: 'Loading preview…' });
  const url = el('div', { className: 'url', textContent: r.url, title: r.url, translate: false });
  const site = el('div', { className: 'card-site' }, fav(r.url), siteName,
    ...(r.copies ? [el('span', { className: 'badge', textContent: `×${r.copies} open` })] : []));
  $('swipeCard').replaceChildren(el('article', { className: 'card in' }, media, el('div', { className: 'card-body' }, site, title, desc, url)));

  const q1 = q[1];
  if (q1 && await hasAccess()) preview(q1.url); // prefetch next card
  const og = await hasAccess() ? await preview(r.url) : null;
  if (shownKey !== key) return; // moved on while loading
  desc.textContent = og?.description || (og ? '' : 'No preview available.');
  if (og?.title) title.textContent = og.title;
  if (og?.siteName) siteName.textContent = og.siteName;
  if (og?.image) {
    const img = el('img', { className: 'cover', alt: '', referrerPolicy: 'no-referrer', src: og.image });
    img.onerror = () => img.remove();
    img.onload = () => media.replaceChildren(img);
  }
}

// Every decision is pushed here so Undo can step back through them, most recent first.
const history = [];

function decide(action) {
  const r = queue()[0];
  if (!r || busy) return;
  busy = true;
  document.querySelector('#swipeCard .card')?.classList.add(action === 'keep' ? 'out-right' : 'out-left');
  setTimeout(async () => {
    if (action === 'keep') { kept.add(r.tab.id); history.push({ keep: r.tab.id }); renderSwipe(); }
    else history.push({ closed: await closeTabs([r]) }); // tab listener reloads rows -> renderSwipe shows next card
    $('swipeUndo').disabled = false;
  }, reduced() ? 0 : 180);
}

// Undo keep: un-keep it. Undo close: reopen it where it was (and drop it from Recently closed).
// Either way it was the first card in sort order, so it comes straight back as the current card.
function undo() {
  const last = history.pop();
  if (!last) return;
  if (last.keep) { kept.delete(last.keep); renderSwipe(); }
  else reopen(last.closed, { unloaded: true });
  $('swipeUndo').disabled = !history.length;
  $('status').textContent = '';
}

const hasAccess = () => chrome.permissions.contains(ALL);
async function renderAccess() {
  $('swipeAccess').hidden = await hasAccess();
}
$('allowPreviews').onclick = async () => {
  if (await chrome.permissions.request(ALL)) {
    previews.clear();
    shownKey = null;
    renderAccess();
    renderSwipe();
  }
};

$('swipeClose').onclick = () => decide('close');
$('swipeKeep').onclick = () => decide('keep');
$('swipeGo').onclick = () => {
  const r = queue()[0];
  if (r) { chrome.tabs.update(r.tab.id, { active: true }); chrome.windows.update(r.tab.windowId, { focused: true }); }
};
$('swipeRestart').onclick = () => {
  kept.clear();
  for (let i = history.length - 1; i >= 0; i--) if (history[i].keep) history.splice(i, 1); // keeps are void now
  $('swipeUndo').disabled = !history.length;
  shownKey = null;
  renderSwipe();
};
$('swipeUndo').onclick = undo;

addEventListener('keydown', e => {
  if (document.body.dataset.view !== 'swipe' || e.altKey || e.target.matches('input, textarea')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z' || !mod && (e.key === 'Backspace' || e.key.toLowerCase() === 'z')) { e.preventDefault(); undo(); }
  if (mod) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); decide('close'); }
  if (e.key === 'ArrowRight') { e.preventDefault(); decide('keep'); }
});
renderAccess();
