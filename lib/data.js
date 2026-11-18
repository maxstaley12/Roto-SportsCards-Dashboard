const CFG = require('./config');
const { ga4Report, gscQuery } = require('./google');
const { parseDay, isoDay, DAYMS, latestAvailable, defaultRange } = require('./params');
const { toPath, brandOf, isExcluded, LIST } = require('./brands');

const num = (v) => Number(v) || 0;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

// ---------- filters for the whole section ----------
// GA4: any landing page under /sports-cards (query strings allowed), minus the excluded prefixes.
const SECTION_RE = esc(CFG.section) + '(?:[/?].*)?';
const ga4Section = {
  andGroup: {
    expressions: [
      { filter: { fieldName: 'landingPage', stringFilter: { matchType: 'FULL_REGEXP', value: SECTION_RE } } },
      ...CFG.excludePrefixes.map((p) => ({ notExpression: { filter: { fieldName: 'landingPage', stringFilter: { matchType: 'BEGINS_WITH', value: p } } } })),
    ],
  },
};
const SITE_RE = '^https://www\\.rotowire\\.com';
const gscFilters = [{
  filters: [
    { dimension: 'page', operator: 'includingRegex', expression: SITE_RE + SECTION_RE + '$' },
    ...CFG.excludePrefixes.map((p) => ({ dimension: 'page', operator: 'excludingRegex', expression: SITE_RE + esc(p) })),
  ],
}];

const isoFromGa = (s) => (s.indexOf('-') > -1 ? s : s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8));

// ---------- 1. fetch everything for a date range (one call set serves every view) ----------
// Returns plain rows; shapeData() turns them into one view. Cached by the API route per date range.
async function fetchRaw(req) {
  const { current, previous } = req;
  const ranges = [
    { startDate: current.start, endDate: current.end, name: 'current' },
    { startDate: previous.start, endDate: previous.end, name: 'previous' },
  ];
  const gsc = (r, dims) => ({ startDate: r.start, endDate: r.end, dimensions: dims, dimensionFilterGroups: gscFilters, rowLimit: CFG.gscRows });

  const [ga4, gscDayCur, gscDayPrev, gscQCur, gscQPrev] = await Promise.all([
    ga4Report({
      dateRanges: ranges,
      dimensions: [{ name: 'landingPage' }, { name: 'date' }],
      metrics: [{ name: 'sessions' }, { name: 'keyEvents:' + CFG.keyEvent }],
      dimensionFilter: ga4Section,
      limit: '100000',
    }),
    gscQuery(gsc(current, ['date', 'page'])),
    gscQuery(gsc(previous, ['date', 'page'])),
    gscQuery(gsc(current, ['query', 'page'])),
    gscQuery(gsc(previous, ['query', 'page'])),
  ]);

  const ga = [];
  (ga4.rows || []).forEach((r) => {
    const path = toPath(r.dimensionValues[0].value);
    if (isExcluded(path)) return;
    ga.push({ path, date: isoFromGa(r.dimensionValues[1].value), period: r.dimensionValues[2].value, sessions: num(r.metricValues[0].value), exits: num(r.metricValues[1].value) });
  });
  const day = (resp, period) => (resp.rows || []).map((r) => ({ period, date: r.keys[0], path: toPath(r.keys[1]), clicks: num(r.clicks), impressions: num(r.impressions), position: num(r.position) }));
  const qry = (resp, period) => (resp.rows || []).map((r) => ({ period, query: r.keys[0], path: toPath(r.keys[1]), clicks: num(r.clicks), impressions: num(r.impressions), position: num(r.position) }));
  const gscRows = day(gscDayCur, 'current').concat(day(gscDayPrev, 'previous'));
  const qRows = qry(gscQCur, 'current').concat(qry(gscQPrev, 'previous'));
  return {
    ga, gscRows, qRows,
    qTruncated: (gscQCur.rows || []).length >= CFG.gscRows || (gscQPrev.rows || []).length >= CFG.gscRows,
    ga4Truncated: (ga4.rows || []).length >= 100000,
  };
}

// ---------- 2. shape one view ----------
const pct = (c, p) => (p ? r1((c / p - 1) * 100) : null); // null = nothing in the previous period ("new")

function kpiRow(metric, cur, prev, kind) {
  const row = { metric, current: cur, previous: prev };
  if (kind === 'pct') { row.change_pct = pct(cur, prev); row.change_abs = null; } // counts: % change
  else { row.change_abs = prev ? r2(cur - prev) : null; row.change_pct = null; } // no previous value: show "new", not a fake change                // rates and position: change in points
  return row;
}

function buildKpi(g, s) {
  const rate = (a, b) => (b ? (a / b) * 100 : 0);
  const gs = (p) => g[p];
  const pos = (p) => (s[p].impressions ? s[p].posImpr / s[p].impressions : 0);
  return [
    kpiRow('Sessions', gs('current').sessions, gs('previous').sessions, 'pct'),
    kpiRow(CFG.keyEventLabel, gs('current').exits, gs('previous').exits, 'pct'),
    kpiRow('Exit-click rate', r2(rate(gs('current').exits, gs('current').sessions)), r2(rate(gs('previous').exits, gs('previous').sessions)), 'abs'),
    kpiRow('Search clicks', s.current.clicks, s.previous.clicks, 'pct'),
    kpiRow('Search impressions', s.current.impressions, s.previous.impressions, 'pct'),
    kpiRow('Average position', r2(pos('current')), r2(pos('previous')), 'abs'),
    kpiRow('Search click-through rate', r2(rate(s.current.clicks, s.current.impressions)), r2(rate(s.previous.clicks, s.previous.impressions)), 'abs'),
  ];
}

// Short ranges (21 days or fewer) are charted by day, longer ones by week (7 days from the start date).
const bucketDays = (days) => (days <= 21 ? 1 : 7);

function buildWeekly(gaRows, gscRows, win, days) {
  const len = bucketDays(days);
  const count = Math.ceil(days / len);
  const starts = { current: parseDay(win.current.start), previous: parseDay(win.previous.start) };
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.push({ n: i + 1, week: isoDay(starts.current + i * len * DAYMS), days: Math.min(len, days - i * len),
      sessions: 0, sessions_prev: 0, exits: 0, exits_prev: 0, clicks: 0, clicks_prev: 0 });
  }
  const idx = (r) => Math.floor((parseDay(r.date) - starts[r.period]) / (len * DAYMS));
  const sfx = (r) => (r.period === 'current' ? '' : '_prev');
  gaRows.forEach((r) => { const i = idx(r); if (i < 0 || i >= count) return; rows[i]['sessions' + sfx(r)] += r.sessions; rows[i]['exits' + sfx(r)] += r.exits; });
  gscRows.forEach((r) => { const i = idx(r); if (i < 0 || i >= count) return; rows[i]['clicks' + sfx(r)] += r.clicks; });
  return { rows, unit: len === 1 ? 'day' : 'week' };
}

// One bucket per brand (or per page / query) with current and previous numbers side by side.
function blank() { return { sessions: 0, sessions_prev: 0, exits: 0, exits_prev: 0, clicks: 0, clicks_prev: 0, impressions: 0, impressions_prev: 0, posImpr: 0 }; }

function shapeData(raw, req) {
  const { scope, current, previous, days } = req;
  const inScope = (path) => scope === 'all' || brandOf(path).slug === scope;
  const ga = raw.ga.filter((r) => inScope(r.path));
  const gscRows = raw.gscRows.filter((r) => inScope(r.path));
  const qRows = raw.qRows.filter((r) => inScope(r.path));

  // totals
  const g = { current: { sessions: 0, exits: 0 }, previous: { sessions: 0, exits: 0 } };
  ga.forEach((r) => { g[r.period].sessions += r.sessions; g[r.period].exits += r.exits; });
  const s = { current: { clicks: 0, impressions: 0, posImpr: 0 }, previous: { clicks: 0, impressions: 0, posImpr: 0 } };
  gscRows.forEach((r) => { const t = s[r.period]; t.clicks += r.clicks; t.impressions += r.impressions; t.posImpr += r.position * r.impressions; });

  const kpi = buildKpi(g, s);
  const weekly = buildWeekly(ga, gscRows, { current, previous }, days);

  // brands (all brands, including ones with no traffic yet, so every page in the section is accounted for)
  const bm = new Map(LIST.map((b) => [b.slug, { slug: b.slug, label: b.label, ...blank() }]));
  raw.ga.forEach((r) => {
    const o = bm.get(brandOf(r.path).slug); const k = r.period === 'current' ? '' : '_prev';
    o['sessions' + k] += r.sessions; o['exits' + k] += r.exits;
  });
  raw.gscRows.forEach((r) => {
    const o = bm.get(brandOf(r.path).slug); const k = r.period === 'current' ? '' : '_prev';
    o['clicks' + k] += r.clicks; o['impressions' + k] += r.impressions;
  });
  const brands = [...bm.values()].map((o) => ({
    ...o,
    rate: o.sessions ? r1((o.exits / o.sessions) * 100) : null,
    rate_prev: o.sessions_prev ? r1((o.exits_prev / o.sessions_prev) * 100) : null,
    sessions_change_pct: pct(o.sessions, o.sessions_prev),
    exits_change_pct: pct(o.exits, o.exits_prev),
    clicks_change_pct: pct(o.clicks, o.clicks_prev),
  })).sort((a, b) => b.sessions - a.sessions || b.clicks - a.clicks);
  // the "Other" row only matters when something landed there
  const brandRows = brands.filter((b) => b.slug !== 'other' || b.sessions || b.sessions_prev || b.clicks || b.clicks_prev);

  // landing pages (GA4): sessions and exit-click sessions with the previous period
  const pm = new Map();
  ga.forEach((r) => {
    const o = pm.get(r.path) || { label: r.path, ...blank() }; const k = r.period === 'current' ? '' : '_prev';
    o['sessions' + k] += r.sessions; o['exits' + k] += r.exits; pm.set(r.path, o);
  });
  const pages = [...pm.values()].filter((o) => o.sessions || o.sessions_prev).sort((a, b) => b.sessions - a.sessions || b.sessions_prev - a.sessions_prev).slice(0, CFG.topPages)
    .map((o) => ({
      label: o.label, sessions: o.sessions, sessions_prev: o.sessions_prev, sessions_change_pct: pct(o.sessions, o.sessions_prev),
      exits: o.exits, exits_prev: o.exits_prev, exits_change_pct: pct(o.exits, o.exits_prev),
      rate: o.sessions ? r1((o.exits / o.sessions) * 100) : null,
    }));

  // top pages by search clicks (GSC)
  const gm = new Map();
  gscRows.forEach((r) => {
    const o = gm.get(r.path) || { label: r.path, ...blank() }; const k = r.period === 'current' ? '' : '_prev';
    o['clicks' + k] += r.clicks; o['impressions' + k] += r.impressions; if (k === '') o.posImpr += r.position * r.impressions; gm.set(r.path, o);
  });
  const topPages = [...gm.values()].filter((o) => o.clicks || o.clicks_prev || o.impressions).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, CFG.topPages)
    .map((o) => ({
      label: o.label, clicks: o.clicks, clicks_prev: o.clicks_prev, change_pct: pct(o.clicks, o.clicks_prev),
      impressions: o.impressions, position: o.impressions ? r1(o.posImpr / o.impressions) : 0,
    }));

  // top search queries (GSC), combined across pages
  const qm = new Map();
  qRows.forEach((r) => {
    const o = qm.get(r.query) || { label: r.query, ...blank() }; const k = r.period === 'current' ? '' : '_prev';
    o['clicks' + k] += r.clicks; o['impressions' + k] += r.impressions; if (k === '') o.posImpr += r.position * r.impressions; qm.set(r.query, o);
  });
  const queries = [...qm.values()].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, CFG.topQueries)
    .map((o) => ({
      label: o.label, clicks: o.clicks, clicks_prev: o.clicks_prev, change_pct: pct(o.clicks, o.clicks_prev),
      impressions: o.impressions, position: o.impressions ? r1(o.posImpr / o.impressions) : 0,
    }));

  const slice = (key) => brandRows.filter((b) => b[key] > 0).map((b) => ({ slug: b.slug, name: b.label, value: b[key] }));
  const pies = { sessions: slice('sessions'), exits: slice('exits'), order: LIST.map((b) => b.label) };

  return {
    scope, scopeInfo: scope === 'all' ? { slug: 'all', label: 'All /sports-cards' } : (LIST.find((b) => b.slug === scope)),
    keyEvent: CFG.keyEvent, keyEventLabel: CFG.keyEventLabel,
    kpi, weekly: weekly.rows, weeklyUnit: weekly.unit, days,
    brands: brandRows, pages, topPages, queries, pies,
    notes: { queriesTruncated: raw.qTruncated, ga4Truncated: raw.ga4Truncated, ...launchInfo(raw, scope, previous) },
    brandList: LIST.map((b) => ({ slug: b.slug, label: b.label, path: b.slug === 'hub' ? CFG.section + '/' : b.slug === 'other' ? 'other pages under ' + CFG.section + '/' : CFG.section + '/' + b.slug })),
    generatedAt: new Date().toISOString(),
    window: { current, previous },
    defaults: defaultRange(), latest: latestAvailable(), earliestStart: CFG.earliestStart,
  };
}


// When the section's data begins, so the page can explain empty "previous period" numbers.
// Looks at the whole section (not just the chosen brand) across the fetched range.
function launchInfo(raw, scope, previous) {
  let first = null;
  raw.ga.forEach((r) => { if (r.sessions > 0 && (first == null || r.date < first)) first = r.date; });
  raw.gscRows.forEach((r) => { if (r.clicks + r.impressions > 0 && (first == null || r.date < first)) first = r.date; });
  const prevHasData = raw.ga.some((r) => r.period === 'previous' && r.sessions > 0) || raw.gscRows.some((r) => r.period === 'previous' && r.clicks + r.impressions > 0);
  return { firstDate: first, previousEmpty: !prevHasData, previousStart: previous.start };
}

module.exports = { fetchRaw, shapeData };
