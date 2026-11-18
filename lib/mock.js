// Fake Google responses, used only when MOCK=1 (layout testing). Same shapes as the real APIs.
const DAY = 86400000;
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
const days = (a, b) => { const out = []; for (let t = Date.parse(a + 'T00:00:00Z'); t <= Date.parse(b + 'T00:00:00Z'); t += DAY) out.push(t); return out; };
const wobble = (i, k) => 0.75 + 0.5 * Math.abs(Math.sin(i * 1.7 + k));
// rounds a small expected value to a whole number without always rounding to zero
const pick = (v, i, k) => { const r = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return Math.floor(v + (r - Math.floor(r))); };

// page, sessions per day, exit-click share, search clicks per day, impressions per day, first live date
const PAGES = [
  ['/sports-cards/apps', 60, 0.22, 48, 1250, '2000-01-01'],
  ['/sports-cards/underdog-rips', 4, 0.29, 2.4, 130, '2000-01-01'],
  ['/sports-cards/rips-by-triumph', 3.6, 0.16, 2.6, 430, '2000-01-01'],
  ['/sports-cards/prizepicks-packs', 2.2, 0.02, 1.4, 210, '2000-01-01'],
  ['/sports-cards/trove', 1.4, 0.06, 1, 40, '2000-01-01'],
  ['/sports-cards/', 0.3, 0, 0.05, 1, '2000-01-01'],
  ['/sports-cards/arena-club', 0.05, 0, 0, 1, '2026-09-20'],
  ['/sports-cards/courtyard', 0.02, 0, 0, 0.2, '2026-10-30'],
  ['/sports-cards/tilt-rips', 0.02, 0, 0, 0.2, '2026-11-01'],
  ['/sports-cards/packz', 0.5, 0.1, 0.2, 5, '2026-11-17'],
  ['/sports-cards/templates/general.php', 0.01, 0, 0, 0, '2026-10-01'],
];
const QUERIES = ['card ripping apps', 'best card rip apps', 'underdog rips', 'rips by triumph', 'prizepicks packs', 'trove cards', 'is courtyard legit', 'arena club', 'digital card pack apps', 'sports card rips', 'packz io review', 'tilt rips'];

function ga4Report(body) {
  const rows = [];
  body.dateRanges.forEach((rg, k) => {
    days(rg.startDate, rg.endDate).forEach((t, i) => {
      PAGES.forEach(([path, s, x, , , live], pi) => {
        if (ymd(t) < live) return;
        const sessions = pick(s * wobble(i, pi) * (k === 0 ? 1 : 0.55), i, pi + k);
        if (!sessions) return;
        rows.push({ dimensionValues: [{ value: path }, { value: ymd(t).replace(/-/g, '') }, { value: rg.name }], metricValues: [{ value: String(sessions) }, { value: String(pick(sessions * x * wobble(i, pi + 3), i, pi + 9)) }] });
      });
    });
  });
  return { rows };
}

function gscQuery(body) {
  const dims = body.dimensions || [];
  const k = body.startDate >= '2026-08-19' ? 0 : 1;
  const rows = [];
  if (dims[0] === 'date') {
    days(body.startDate, body.endDate).forEach((t, i) => {
      PAGES.forEach(([path, , , c, im, live], pi) => {
        if (ymd(t) < live || path.indexOf('templates') > -1 || !im) return;
        const clicks = pick(c * wobble(i, pi) * (k === 0 ? 1 : 0.6), i, pi + 5);
        rows.push({ keys: [ymd(t), 'https://www.rotowire.com' + path], clicks, impressions: Math.round(im * wobble(i, pi + 1) * (k === 0 ? 1 : 0.7)), position: 5 + pi * 0.4 });
      });
    });
  } else {
    PAGES.forEach(([path, , , c, im, live], pi) => {
      if (path.indexOf('templates') > -1 || !im || live > body.endDate) return;
      QUERIES.forEach((q, qi) => {
        if ((qi + pi) % 3 === 0) return;
        const share = 1 / (qi + 2);
        rows.push({ keys: [q, 'https://www.rotowire.com' + path], clicks: Math.round(c * 90 * share * (k === 0 ? 1 : 0.6)), impressions: Math.round(im * 90 * share * 1.5), position: 3 + ((qi * 7 + pi) % 20) / 2 });
      });
    });
  }
  return { rows };
}

module.exports = { ga4Report, gscQuery };
