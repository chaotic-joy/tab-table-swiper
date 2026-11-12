// node test.js
const assert = require('assert');
const { fromCSV, toCSV, dupKey, unwrapSuspended } = require('./csv.js');
const pick = (links, ...keys) => links.map(l => keys.map(k => l[k]));

// Round-trip our own export, incl. quotes/commas and formula-injection guard.
const rows = [
  { site: 'a.com', title: 'Hello, "world"', url: 'https://a.com/x', window: 1 },
  { site: 'b.com', title: '=SUM(1)', url: 'https://b.com/', window: 2 },
];
assert.ok(toCSV(rows).includes("'=SUM(1)"));
assert.deepStrictEqual(pick(fromCSV(toCSV(rows)).links, 'site', 'title', 'url'), pick(rows, 'site', 'title', 'url'));

// Unfamiliar headers, scheme-less URLs, extra columns.
assert.deepStrictEqual(pick(fromCSV('Link,Page Name,Notes\nexample.com/a,Example A,hi\nhttps://ex.org,Ex Org,\n').links, 'url', 'title', 'site'),
  [['https://example.com/a', 'Example A', 'example.com'], ['https://ex.org', 'Ex Org', 'ex.org']]);

// No header, tab-separated, title first.
assert.deepStrictEqual(pick(fromCSV('My Page\thttps://x.io/p\nOther\thttps://y.io\n').links, 'title', 'url'),
  [['My Page', 'https://x.io/p'], ['Other', 'https://y.io']]);

// Semicolons, site column named "Website", URL column named "Address".
assert.deepStrictEqual(fromCSV('Website;Address;Title\nGitHub;https://github.com;Home\n').links[0],
  { url: 'https://github.com', title: 'Home', site: 'GitHub' });

// Dangerous schemes dropped; no URL column -> nothing.
assert.strictEqual(fromCSV('url\njavascript:alert(1)\nhttps://ok.com').links.length, 1);
assert.strictEqual(fromCSV('a,b\n1,2\n').links.length, 0);

// Duplicate key ignores fragment, trailing slash, host case.
assert.strictEqual(dupKey('https://A.com/x#y'), dupKey('https://a.com/x'));
assert.strictEqual(dupKey('https://a.com/'), dupKey('https://a.com'));

// Suspender URLs unwrap to the real link (raw trailing uri=, and encoded url= param); others untouched.
assert.strictEqual(unwrapSuspended('chrome-extension://abc/suspended.html#ttl=Hi&pos=0&uri=https://x.com/a?b=1&c=2'), 'https://x.com/a?b=1&c=2');
assert.strictEqual(unwrapSuspended('chrome-extension://abc/park.html?url=https%3A%2F%2Fy.com%2Fp&title=Y'), 'https://y.com/p');
assert.strictEqual(unwrapSuspended('chrome-extension://abc/options.html'), 'chrome-extension://abc/options.html');
assert.strictEqual(unwrapSuspended('https://z.com/?url=https://q.com'), 'https://z.com/?url=https://q.com');
assert.strictEqual(fromCSV('url\nchrome-extension://abc/suspended.html#uri=https://x.com\n').links[0].url, 'https://x.com');

console.log('ok');
