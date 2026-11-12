// CSV parsing/export + column auto-detection. Plain script: loaded by tabs.html, required by test.js.
const SAFE = /^(https?|ftp|file|chrome|chrome-extension|about):/i;
const FORMULA = /^[=+\-@\t\r]/; // spreadsheet formula injection

function siteOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// Same page = same URL ignoring #fragment, trailing slash and host case.
function dupKey(url) {
  try { const u = new URL(url); u.hash = ''; return u.href.replace(/\/$/, ''); } catch { return url; }
}

// Tab-suspender extensions replace a tab's URL with their own page, e.g.
// chrome-extension://<id>/suspended.html#ttl=...&uri=https://real.url  or  .../park.html?url=https%3A%2F%2F...
// Return the real URL so duplicates/export/previews see the actual link.
function unwrapSuspended(url) {
  if (!/^chrome-extension:/i.test(url)) return url;
  const m = url.match(/[#?&](?:uri|url)=(.*)$/i);
  if (!m) return url;
  const v = /^https?%3A/i.test(m[1]) ? decodeURIComponent(m[1].split('&')[0]) : m[1];
  return /^https?:\/\//i.test(v) ? v : url;
}

function parseCSV(text, d = ',') {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else q = false;
    } else if (c === '"') q = true;
    else if (c === d) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(f => f.trim()));
}

// 1 = has a scheme, 0.5 = bare domain/path like "example.com/x", 0 = not a URL.
function urlScore(v) {
  if (/^([a-z][\w+.-]*:\/\/|about:)/i.test(v)) return 1;
  if (/^(www\.)?[\w-]+(\.[\w-]+)*\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(v)) return 0.5;
  return 0;
}

// Returns { links: [{url, title, site}], cols: {url, title, site} } — cols names what was detected.
// ponytail: heuristics, not ML. URL column picked by content; title/site by header keywords, then content.
function fromCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0];
  const delim = [',', '\t', ';', '|'].reduce((a, d) => first.split(d).length > first.split(a).length ? d : a);
  const rows = parseCSV(text, delim).map(r => r.map(c => c.replace(/^'(?=[=+\-@\t\r])/, '').trim()));
  const none = { links: [], cols: {} };
  if (!rows.length) return none;

  const body = rows.length > 1 ? rows.slice(1) : rows;
  const width = Math.max(...rows.map(r => r.length));
  const avg = (c, f) => body.reduce((s, r) => s + f(r[c] || ''), 0) / body.length;

  let url = -1, best = 0.3;
  for (let c = 0; c < width; c++) { const s = avg(c, urlScore); if (s > best) [url, best] = [c, s]; }
  if (url < 0) return none;

  const header = urlScore(rows[0][url] || '') ? [] : rows[0];
  const pick = (re, skip) => header.findIndex((h, i) => !skip.includes(i) && re.test(h));
  const site = pick(/site|domain|host/i, [url]);
  let title = pick(/title|name|page|subject|label|text|desc/i, [url, site]);
  if (title < 0) title = [...Array(width).keys()].find(c => c !== url && c !== site &&
    avg(c, urlScore) < 0.3 && avg(c, v => (v && isNaN(v) ? 1 : 0)) > 0.5) ?? -1;

  const links = [];
  for (const r of header.length ? rows.slice(1) : rows) {
    let u = unwrapSuspended(r[url] || '');
    if (!u) continue;
    if (!/^[a-z][\w+.-]*:/i.test(u)) u = 'https://' + u;
    if (!SAFE.test(u)) continue;
    try { new URL(u); } catch { continue; }
    links.push({ url: u, title: r[title] || u, site: r[site] || siteOf(u) });
  }
  const name = i => (i < 0 ? '(auto)' : header[i] || `column ${i + 1}`);
  return { links, cols: { url: name(url), title: name(title), site: name(site) } };
}

function toCSV(rows) {
  const esc = v => {
    v = String(v ?? '');
    if (FORMULA.test(v)) v = "'" + v;
    return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  return [['Site', 'Title', 'URL', 'Window'], ...rows.map(r => [r.site, r.title, r.url, r.window])]
    .map(r => r.map(esc).join(',')).join('\r\n');
}

if (typeof module === 'object') module.exports = { parseCSV, fromCSV, toCSV, dupKey, siteOf, unwrapSuspended };
