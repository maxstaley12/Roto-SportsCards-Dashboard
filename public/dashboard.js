(function () {
'use strict';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const DAYMS = 86400000;
const NUM = {
  cmp: (v) => (v >= 1e6 ? d3.format('.3~s')(v).replace('G', 'B') : d3.format(',.0f')(v)),
  int: d3.format(',.0f'), dec1: d3.format('.1f'), dec2: d3.format('.2f'),
  pct: (v) => d3.format('.2f')(v) + '%',
};
const signed = (v) => (v > 0 ? '+' : '') + v;
const pctText = (v) => (v == null || isNaN(v) ? 'n/a' : signed(v) + '%');
let DATA = null;
let META = null; // defaults, latest, earliestStart, brandList (kept from the last good response)

const q = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const el = (id) => document.getElementById(id);
const setText = (id, t) => { const e = el(id); if (e) e.textContent = t; };
const kpiRow = (metric) => (DATA.kpi || []).find((r) => r.metric === metric) || {};

// ---------- date helpers ----------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ms = (s) => Date.parse(s + 'T00:00:00Z');
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const md = (s) => MON[+s.slice(5, 7) - 1] + ' ' + +s.slice(8, 10);
const mdy = (s) => md(s) + ', ' + s.slice(0, 4);
const rangeText = (a, b) => (a.slice(0, 4) === b.slice(0, 4) ? md(a) + ' to ' + mdy(b) : mdy(a) + ' to ' + mdy(b));
const plusDays = (s, n) => iso(ms(s) + n * DAYMS);

// ---------- state (kept in the page address so a link reopens the same view) ----------
const state = { scope: 'all', start: null, end: null };
(function readUrl() {
  const p = new URLSearchParams(location.search);
  if (/^[a-z0-9-]+$/.test(p.get('scope') || '')) state.scope = p.get('scope');
  if (/^\d{4}-\d{2}-\d{2}$/.test(p.get('start') || '')) state.start = p.get('start');
  if (/^\d{4}-\d{2}-\d{2}$/.test(p.get('end') || '')) state.end = p.get('end');
})();

const isDefaultRange = () => !!(META && DATA && META.defaults.start === DATA.window.current.start && META.defaults.end === DATA.window.current.end);

function syncUrl() {
  const p = new URLSearchParams();
  if (state.scope !== 'all') p.set('scope', state.scope);
  const d = META && META.defaults;
  // A range equal to the default is left out of the link so the link keeps following the default (launch to latest).
  if (state.start && state.end && !(d && d.start === state.start && d.end === state.end)) { p.set('start', state.start); p.set('end', state.end); }
  const qs = p.toString();
  try { history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '')); } catch (e) { /* ignore */ }
}

// ---------- tiles ----------
// better: which direction is good. kind: how the change is shown (pct = % change, abs = points).
const TILES = [
  { metric: 'Sessions', label: 'Sessions', fmt: 'int', better: 'up', kind: 'pct', lead: true },
  { metric: 'Exit-click sessions', label: 'Exit-click sessions', fmt: 'int', better: 'up', kind: 'pct' },
  { metric: 'Exit-click rate', label: 'Exit-click rate', fmt: 'pct', better: 'up', kind: 'abs', unit: 'pts vs previous period' },
  { metric: 'Search clicks', label: 'Search clicks', fmt: 'int', better: 'up', kind: 'pct' },
  { metric: 'Search impressions', label: 'Search impressions', fmt: 'cmp', better: 'up', kind: 'pct' },
  { metric: 'Average position', label: 'Avg position (lower is better)', fmt: 'dec2', better: 'down', kind: 'abs', unit: 'positions vs previous period' },
  { metric: 'Search click-through rate', label: 'Click-through rate', fmt: 'pct', better: 'up', kind: 'abs', unit: 'pts vs previous period' },
];

function fillTiles() {
  const box = el('tiles');
  box.replaceChildren();
  TILES.forEach((t) => {
    const r = kpiRow(t.metric);
    const tile = document.createElement('div'); tile.className = 'tile' + (t.lead ? ' lead' : '');
    const lab = document.createElement('div'); lab.className = 'tile-label'; lab.textContent = t.label;
    const val = document.createElement('div'); val.className = 'tile-value';
    val.textContent = r.current != null && !isNaN(r.current) ? NUM[t.fmt](r.current) : '—';
    const chips = document.createElement('div'); chips.className = 'chips';
    const row1 = document.createElement('span'); row1.className = 'chiprow';
    const chip = document.createElement('span'); chip.className = 'chip';
    const v = t.kind === 'pct' ? r.change_pct : r.change_abs;
    if (v == null || isNaN(v)) { chip.textContent = r.current > 0 && !r.previous ? 'new' : '—'; chip.classList.add('flat'); }
    else {
      chip.textContent = t.kind === 'pct' ? signed(v) + '%' : signed(v);
      if (v === 0) chip.classList.add('flat'); else chip.classList.add((t.better === 'up' ? v > 0 : v < 0) ? 'good' : 'bad');
    }
    const vs = document.createElement('span'); vs.className = 'vs'; vs.textContent = ' ' + (chip.textContent === 'new' || chip.textContent === '—' ? 'vs previous period' : (t.unit || 'vs previous period'));
    row1.append(chip, vs);
    const row2 = document.createElement('span'); row2.className = 'chiprow';
    const l2 = document.createElement('span'); l2.className = 'vs'; l2.textContent = 'Previous: ';
    const ly = document.createElement('span'); ly.className = 'ly'; ly.textContent = r.previous != null && !isNaN(r.previous) ? NUM[t.fmt](r.previous) : '—';
    row2.append(l2, ly);
    chips.append(row1, row2);
    tile.append(lab, val, chips);
    box.appendChild(tile);
  });
}

function scopeLabel() {
  if (DATA.scope === 'all') return { name: 'all pages under /sports-cards', path: '/sports-cards/' };
  const b = (META.brandList || []).find((x) => x.slug === DATA.scope) || { label: DATA.scope, path: '' };
  return { name: b.label, path: b.path };
}

function fillLede() {
  const e = el('lede');
  e.replaceChildren();
  const S = scopeLabel();
  const s = kpiRow('Sessions'), x = kpiRow(CFG_EXIT), c = kpiRow('Search clicks');
  const b = (t) => { const n = document.createElement('b'); n.textContent = t; return n; };
  const cur = DATA.window.current;
  const isDefault = META && META.defaults.start === cur.start && META.defaults.end === cur.end;
  if (!s.current && !s.previous) {
    e.append((isDefault ? (META.defaults.sinceLaunch ? 'Since launch (' : 'Latest ' + DATA.days + ' days (') : 'For ') + rangeText(cur.start, cur.end) + (isDefault ? ')' : '') + ': no sessions to ' + S.name + ' in this range or the previous ' + DATA.days + ' days. A page that went live recently will show zeros until it has data.');
    return;
  }
  const pre = (isDefault ? (META.defaults.sinceLaunch ? 'Since launch (' : 'Latest ' + DATA.days + ' days (') : 'For ') + rangeText(cur.start, cur.end) + (isDefault ? ')' : '');
  if (!s.previous) {
    e.append(pre + ', ' + S.name + ' had ', b(NUM.int(s.current) + ' sessions'), ', ', b(NUM.int(x.current || 0)) , ' of them with an exit click, and ', b(NUM.int(c.current || 0) + ' search clicks'), '. There is no data in the previous ' + DATA.days + ' days, so no comparison yet.');
    return;
  }
  e.append((isDefault ? (META.defaults.sinceLaunch ? 'Since launch (' : 'Latest ' + DATA.days + ' days (') : 'For ') + rangeText(cur.start, cur.end) + (isDefault ? ')' : '') + ', sessions to ' + S.name + ' are ', b(pctText(s.change_pct)),
    ' and search clicks are ', b(pctText(c.change_pct)), ' vs the previous ' + DATA.days + ' days. Sessions with an exit click: ',
    b(NUM.int(x.current || 0)), ' vs ', b(NUM.int(x.previous || 0)), ' (' + (x.change_pct == null ? 'new' : pctText(x.change_pct)) + ').');
}
const CFG_EXIT = 'Exit-click sessions';

function fillText() {
  const w = DATA.window, cur = w.current, pv = w.previous, days = DATA.days;
  const S = scopeLabel();
  const unit = DATA.weeklyUnit === 'day' ? 'day' : 'week';
  const per = unit === 'day' ? 'by day' : 'by week';
  const title = DATA.scope === 'all' ? 'Sports Cards Tracker' : S.name + ': Sports Cards Tracker';
  document.title = title;
  setText('title-text', title);
  setText('scope', rangeText(cur.start, cur.end) + ' vs the previous ' + days + ' days (' + rangeText(pv.start, pv.end) + ') · ' + (DATA.scope === 'all' ? 'every page under /sports-cards/' : S.name + ' (' + S.path + ')') + ' · GA4 + Search Console');
  setText('rangebox', days + (days === 1 ? ' day' : ' days'));
  setText('h-sessions', 'Sessions ' + per);
  setText('h-exits', 'Exit-click sessions ' + per);
  setText('h-clicks', 'Search clicks ' + per);
  const last = (DATA.weekly || []).slice(-1)[0];
  const partial = unit === 'week' && last && last.days < 7 ? ' The last point covers only ' + last.days + (last.days === 1 ? ' day' : ' days') + ', so it will look low.' : '';
  const shared = unit === 'day'
    ? 'Each point is one day, starting ' + md(cur.start) + '. The dashed line is the previous period, lined up day for day.'
    : 'Each point is one week of seven days, labeled by its start date. The dashed line is the previous period, lined up week for week.' + partial;
  setText('n-sessions', 'GA4 sessions to ' + S.path + '. ' + shared);
  setText('n-exits', 'Sessions that included an exit click (the exit_click_goal key event), credited to the landing page. Counts are small on the smaller pages, so expect noise.');
  setText('n-clicks', 'Google web search clicks to ' + S.path + ', same ' + (unit === 'day' ? 'daily' : 'weekly') + ' buckets.');
  setText('def-scope', DATA.scope === 'all' ? 'anywhere under /sports-cards/' : S.name + ' (' + S.path + ')');
  setText('def-prev', rangeText(pv.start, pv.end));
  setText('def-window', days + ' days, ' + rangeText(cur.start, cur.end) + '.');
  setText('asof-tag', 'AS OF ' + md(cur.end).toUpperCase());
  setText('asof-text', 'Search Console data lags about two days, so ranges end no later than ' + md(META.latest) + '. Dates move forward on their own: the default view runs from launch (' + md(META.defaults.start) + ') to the latest day.');
  // explain empty comparisons: the section only started getting traffic on a certain date
  const n = DATA.notes || {}, ln = el('launchnote');
  const nearStart = n.firstDate && n.firstDate > cur.start;
  if (ln) {
    if (META.defaults.sinceLaunch && isDefaultRange() && n.previousEmpty) {
      ln.replaceChildren();
      const b = document.createElement('b'); b.textContent = 'Since launch. ';
      ln.append(b, 'This is everything since the section\'s first traffic on ' + mdy(n.firstDate || cur.start) + '. There is no earlier period to compare against, so changes show as "new". Pick "Last 28 days" for a like-for-like comparison once there are 56 days of data, around ' + md(plusDays(n.firstDate || cur.start, 57)) + '.');
      ln.classList.remove('hide');
    } else if (n.previousEmpty || nearStart) {
      const bits = [];
      if (n.firstDate) bits.push('The first traffic in this range is on ' + mdy(n.firstDate) + ', so earlier days are empty.');
      if (n.previousEmpty) bits.push('The previous period (' + rangeText(pv.start, pv.end) + ') has no data at all, so every change shows as "new".');
      else if (n.firstDate && n.firstDate > pv.start) bits.push('The previous period only has data from ' + mdy(n.firstDate) + ', so changes are inflated.');
      bits.push('A full comparison needs data back to ' + mdy(pv.start) + '. A shorter range such as the last 28 days gets there sooner.');
      ln.replaceChildren();
      const b = document.createElement('b'); b.textContent = 'New section. ';
      ln.append(b, bits.join(' '));
      ln.classList.remove('hide');
    } else ln.classList.add('hide');
  }
  // the brand comparison only makes sense for the All view
  const all = DATA.scope === 'all';
  el('brands').classList.toggle('hide', !all);
  el('nav-brands').classList.toggle('hide', !all);
  setText('h-pages', all ? 'Landing pages by sessions' : 'Landing pages by sessions: ' + S.name);
  setText('n-top', 'Google web search clicks per page in this range.' + (all ? '' : ' Most pages are a single URL, so this is often one row.') + ' Scroll inside the table to see more.');
  setText('n-queries', 'Each row is one query and the page it sent people to, for ' + S.path + ' in this range. A query that landed on two pages appears twice, so read the Landing page column before comparing rows. Scroll inside the table to see more.' + (DATA.notes && DATA.notes.queriesTruncated ? ' Google returned more rows than this dashboard can read, so very small queries are missing.' : ''));
}

// ---------- chart ----------
function periodChart(box, cur, prev, label) {
  box.replaceChildren();
  const rows = (DATA && DATA.weekly) || [];
  if (!rows.length) { box.textContent = 'No data'; return; }
  const W = Math.max(280, box.clientWidth), H = 240;
  const fmtT = d3.format(',.0f');
  const maxV = Math.max(4, d3.max(rows, (r) => Math.max(r[cur], r[prev])) || 0);
  const y = d3.scaleLinear().domain([0, maxV]).nice().range([H - 28, 30]);
  const yt = y.ticks(4).filter((t) => Number.isInteger(t));
  const left = Math.max(...yt.map((t) => fmtT(t).length)) * 7 + 14;
  const x = d3.scalePoint().domain(rows.map((r) => r.n)).range([left + 10, W - 34]);
  const dayFmt = d3.utcFormat('%b %-d');
  const wk = (r) => dayFmt(new Date(r.week + 'T00:00:00Z'));
  const unit = DATA.weeklyUnit === 'day' ? 'day' : 'week';
  const svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', '0 0 ' + W + ' ' + H).attr('role', 'img').attr('aria-label', label);
  svg.append('g').selectAll('line').data(yt).join('line').attr('x1', left).attr('x2', W - 8).attr('y1', (d) => y(d)).attr('y2', (d) => y(d)).style('stroke', '#e6eaf2');
  svg.append('g').selectAll('text').data(yt).join('text').attr('x', left - 6).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text(fmtT).style('fill', '#6b7690').style('font-size', '11px').style('font-family', MONO);
  const line = (key) => d3.line().x((r) => x(r.n)).y((r) => y(r[key]))(rows);
  svg.append('path').attr('d', d3.area().x((r) => x(r.n)).y0(y(0)).y1((r) => y(r[cur]))(rows)).style('fill', '#2c5aa8').style('fill-opacity', 0.08);
  svg.append('path').attr('d', line(prev)).style('fill', 'none').style('stroke', '#6b7690').style('stroke-width', 2).style('stroke-dasharray', '5 3');
  svg.append('path').attr('d', line(cur)).style('fill', 'none').style('stroke', '#2c5aa8').style('stroke-width', 2.5);
  svg.append('g').selectAll('circle').data(rows.slice(-1)).join('circle').attr('cx', (r) => x(r.n)).attr('cy', (r) => y(r[cur])).attr('r', 3).style('fill', '#2c5aa8');
  const lg = svg.append('g').attr('transform', 'translate(' + (left + 10) + ',12)');
  lg.append('line').attr('x1', 0).attr('x2', 22).attr('y1', 0).attr('y2', 0).style('stroke', '#2c5aa8').style('stroke-width', 2.5);
  lg.append('text').attr('x', 28).attr('y', 4).text('This period').style('fill', '#6b7690').style('font-size', '11px').style('font-family', MONO);
  lg.append('line').attr('x1', 130).attr('x2', 152).attr('y1', 0).attr('y2', 0).style('stroke', '#6b7690').style('stroke-width', 2).style('stroke-dasharray', '5 3');
  lg.append('text').attr('x', 158).attr('y', 4).text('Previous period').style('fill', '#6b7690').style('font-size', '11px').style('font-family', MONO);
  const tip = d3.select(box).append('div').attr('class', 'tip').style('display', 'none');
  svg.append('rect').attr('x', left).attr('y', 24).attr('width', W - left).attr('height', H - 52).style('fill', 'transparent')
    .on('mousemove', (ev) => {
      const p = d3.pointer(ev, box);
      const r = rows.reduce((best, d) => (Math.abs(x(d.n) - p[0]) < Math.abs(x(best.n) - p[0]) ? d : best), rows[0]);
      const head = (unit === 'day' ? '' : 'Week of ') + wk(r) + (unit === 'week' && r.days < 7 ? ' (' + r.days + '-day partial week)' : '');
      tip.style('display', 'block').style('left', Math.max(0, Math.min(p[0] + 12, W - 250)) + 'px').style('top', Math.max(p[1] - 40, 0) + 'px')
        .text(head + ': ' + fmtT(r[cur]) + ' vs ' + fmtT(r[prev]) + ' previous');
    })
    .on('mouseleave', () => tip.style('display', 'none'));
  const step = Math.ceil(rows.length / Math.max(2, Math.floor((W - left) / 60)));
  svg.append('g').selectAll('text').data(rows.filter((r, i) => i % step === 0)).join('text')
    .attr('x', (r) => x(r.n)).attr('y', H - 10).attr('text-anchor', 'middle')
    .text(wk).style('fill', '#6b7690').style('font-size', '11px').style('font-family', MONO);
}

function drawCharts() {
  const S = scopeLabel();
  const per = DATA.weeklyUnit === 'day' ? 'day' : 'week';
  [
    ['chart-sessions', 'sessions', 'sessions_prev', 'Line chart of sessions per ' + per + ' to ' + S.name + ', this period against the previous period'],
    ['chart-exits', 'exits', 'exits_prev', 'Line chart of exit-click sessions per ' + per + ' to ' + S.name + ', this period against the previous period'],
    ['chart-clicks', 'clicks', 'clicks_prev', 'Line chart of search clicks per ' + per + ' to ' + S.name + ', this period against the previous period'],
  ].forEach(([id, cur, prev, label]) => { const e = el(id); if (e) periodChart(e, cur, prev, label); });
}

// ---------- brand pies ----------
const PALETTE = ['#2c5aa8', '#e0303a', '#2f8f7a', '#b4501e', '#7c3aed', '#b8305a', '#0e8aa8', '#a07a00', '#4f7d2a', '#5b6b8c'];
const OTHER_COLOR = '#c3cad8';
function brandColor(name) {
  if (name === 'Other /sports-cards pages') return OTHER_COLOR;
  const i = ((DATA.pies || {}).order || []).indexOf(name);
  return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
}

function drawPie(box, title, rows, total, unit) {
  box.replaceChildren();
  const h = document.createElement('h3'); h.textContent = title; box.appendChild(h);
  const sub = document.createElement('p'); sub.className = 'sub'; sub.textContent = NUM.int(total) + ' ' + unit + ' in this range'; box.appendChild(sub);
  if (!rows.length || !total) { const n = document.createElement('p'); n.className = 'note'; n.textContent = 'No data in this range.'; box.appendChild(n); return; }
  const size = Math.max(200, Math.min(280, (box.clientWidth || 420) - 36));
  const wrap = document.createElement('div'); wrap.className = 'donut'; box.appendChild(wrap);
  const R = size / 2;
  const svg = d3.select(wrap).append('svg').attr('width', size).attr('height', size).attr('viewBox', '0 0 ' + size + ' ' + size).attr('role', 'img')
    .attr('aria-label', title + ': ' + rows.slice(0, 5).map((r) => r.name + ' ' + d3.format('.0%')(r.value / total)).join(', '));
  const g = svg.append('g').attr('transform', 'translate(' + R + ',' + R + ')');
  const arc = d3.arc().innerRadius(R * 0.58).outerRadius(R - 2).padAngle(0.012);
  const arcHover = d3.arc().innerRadius(R * 0.58).outerRadius(R + 2).padAngle(0.012);
  const pie = d3.pie().sort(null).value((r) => r.value)(rows);
  const tip = d3.select(wrap).append('div').attr('class', 'tip').style('display', 'none');
  g.selectAll('path').data(pie).join('path').attr('d', arc).style('fill', (d) => brandColor(d.data.name)).style('stroke', '#fff').style('stroke-width', 1)
    .on('mousemove', function (ev, d) {
      d3.select(this).attr('d', arcHover);
      const p = d3.pointer(ev, wrap);
      tip.style('display', 'block').style('left', Math.max(0, Math.min(p[0] + 12, size - 150)) + 'px').style('top', Math.max(p[1] - 30, 0) + 'px')
        .text(d.data.name + ': ' + NUM.int(d.data.value) + ' (' + d3.format('.1%')(d.data.value / total) + ')');
    })
    .on('mouseleave', function () { d3.select(this).attr('d', arc); tip.style('display', 'none'); });
  const ctr = document.createElement('div'); ctr.className = 'center'; ctr.style.top = (R - 20) + 'px';
  const b = document.createElement('b'); b.textContent = NUM.cmp(total); const sp = document.createElement('span'); sp.textContent = unit;
  ctr.append(b, sp); wrap.appendChild(ctr);
  const ul = document.createElement('ul'); ul.className = 'legend';
  rows.forEach((r) => {
    const li = document.createElement('li');
    const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = brandColor(r.name);
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.name;
    const vl = document.createElement('span'); vl.className = 'vl'; vl.textContent = NUM.int(r.value);
    const pc = document.createElement('span'); pc.className = 'pc'; pc.textContent = d3.format('.1%')(r.value / total);
    li.append(sw, nm, vl, pc); ul.appendChild(li);
  });
  box.appendChild(ul);
}

function drawPies() {
  const p = DATA.pies;
  if (!p || DATA.scope !== 'all') return;
  const tot = (rows) => rows.reduce((a, r) => a + r.value, 0);
  drawPie(el('pie-sessions'), 'Sessions by page', p.sessions || [], tot(p.sessions || []), 'sessions');
  drawPie(el('pie-exits'), 'Exit-click sessions by page', p.exits || [], tot(p.exits || []), 'exit-click sessions');
}

// ---------- tables ----------
const goodBad = (v) => (v > 0 ? 'good' : v < 0 ? 'bad' : 'flat');
// % change: null means nothing in the previous period; show "new" when there is something now, a dash when both are empty
const chg = (pctv, cur) => (pctv == null ? (cur > 0 ? 'new' : '—') : signed(pctv) + '%');
const chgTone = (pctv) => (pctv == null ? 'flat' : goodBad(pctv));

// Every column header is clickable. A column sorts by its `sort` function, or by r[key] when it has a key.
// Empty values always go last; "new" (nothing in the previous period) counts as the biggest change.
const SORT = {}; // table body id -> { i: column index, dir: 1 or -1 }
const LAST = {}; // table body id -> { rows, cols } from the latest draw, so a header click can redraw
const chgSort = (pctv, cur) => (pctv == null ? (cur > 0 ? Infinity : null) : pctv);
const sortVal = (c, r) => (c.sort ? c.sort(r) : c.key ? r[c.key] : null);

function sortedRows(bodyId, rows, cols) {
  const st = SORT[bodyId];
  if (!st || !cols[st.i]) return rows;
  const c = cols[st.i];
  const empty = (v) => v == null || (typeof v === 'number' && isNaN(v));
  return rows.map((r, i) => ({ r, i, v: sortVal(c, r) })).sort((x, y) => {
    const ex = empty(x.v), ey = empty(y.v);
    if (ex || ey) return ex === ey ? x.i - y.i : ex ? 1 : -1;
    const d = typeof x.v === 'string' || typeof y.v === 'string' ? String(x.v).localeCompare(String(y.v), undefined, { sensitivity: 'base' }) : (x.v === y.v ? 0 : x.v < y.v ? -1 : 1);
    return d ? d * st.dir : x.i - y.i;
  }).map((o) => o.r);
}

function bindSort(bodyId, cols) {
  const table = el(bodyId).closest('table');
  const ths = table ? Array.from(table.querySelectorAll('thead th')) : [];
  ths.forEach((th, i) => {
    if (!th.dataset.sortBound) {
      th.dataset.sortBound = '1'; th.tabIndex = 0; th.setAttribute('role', 'button'); th.classList.add('sortable');
      const go = () => {
        const cur = SORT[bodyId];
        const first = (LAST[bodyId].cols[i].num ? -1 : 1); // numbers start high to low, text starts A to Z
        SORT[bodyId] = cur && cur.i === i ? { i, dir: -cur.dir } : { i, dir: first };
        fillTable(bodyId, LAST[bodyId].rows, LAST[bodyId].cols);
      };
      th.addEventListener('click', go);
      th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    }
    const st = SORT[bodyId];
    if (st && st.i === i) { th.dataset.dir = st.dir === 1 ? 'asc' : 'desc'; th.setAttribute('aria-sort', st.dir === 1 ? 'ascending' : 'descending'); }
    else { th.removeAttribute('data-dir'); th.removeAttribute('aria-sort'); }
  });
}

function fillTable(bodyId, rows, cols) {
  const tb = el(bodyId);
  if (!tb) return;
  LAST[bodyId] = { rows, cols };
  bindSort(bodyId, cols);
  rows = sortedRows(bodyId, rows, cols);
  tb.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement('tr'); const td = document.createElement('td');
    td.colSpan = cols.length; td.textContent = 'No data in this range.'; tr.appendChild(td); tb.appendChild(tr);
    return;
  }
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    cols.forEach((c) => {
      const td = document.createElement('td');
      const cls = [];
      if (c.num) cls.push('num');
      if (c.tone) { const t = c.tone(r); if (t) cls.push(t); }
      if (cls.length) td.className = cls.join(' ');
      if (c.link) {
        const target = c.link(r);
        if (target) {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'lnk'; b.textContent = r[c.key];
          b.addEventListener('click', () => { state.scope = target; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
          td.appendChild(b);
        } else td.textContent = r[c.key];
      } else {
        const v = c.text ? c.text(r) : r[c.key];
        td.textContent = v == null ? '' : (c.text ? v : c.fmt(v));
      }
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
}

const rateText = (v) => (v == null ? '—' : v.toFixed(1) + '%');

function drawTables() {
  fillTable('brand-rows', DATA.brands || [], [
    { key: 'label', link: (r) => (r.slug === 'other' ? null : r.slug) },
    { key: 'sessions', num: true, fmt: NUM.int }, { key: 'sessions_prev', num: true, fmt: NUM.int },
    { num: true, sort: (r) => chgSort(r.sessions_change_pct, r.sessions), text: (r) => chg(r.sessions_change_pct, r.sessions), tone: (r) => chgTone(r.sessions_change_pct) },
    { key: 'exits', num: true, fmt: NUM.int }, { key: 'exits_prev', num: true, fmt: NUM.int },
    { num: true, sort: (r) => chgSort(r.exits_change_pct, r.exits), text: (r) => chg(r.exits_change_pct, r.exits), tone: (r) => chgTone(r.exits_change_pct) },
    { num: true, sort: (r) => r.rate, text: (r) => rateText(r.rate) },
    { key: 'clicks', num: true, fmt: NUM.int }, { key: 'clicks_prev', num: true, fmt: NUM.int },
    { num: true, sort: (r) => chgSort(r.clicks_change_pct, r.clicks), text: (r) => chg(r.clicks_change_pct, r.clicks), tone: (r) => chgTone(r.clicks_change_pct) },
  ]);
  fillTable('page-rows', DATA.pages || [], [
    { key: 'label', fmt: String },
    { key: 'sessions', num: true, fmt: NUM.int }, { key: 'sessions_prev', num: true, fmt: NUM.int },
    { num: true, sort: (r) => chgSort(r.sessions_change_pct, r.sessions), text: (r) => chg(r.sessions_change_pct, r.sessions), tone: (r) => chgTone(r.sessions_change_pct) },
    { key: 'exits', num: true, fmt: NUM.int }, { key: 'exits_prev', num: true, fmt: NUM.int },
    { num: true, sort: (r) => chgSort(r.exits_change_pct, r.exits), text: (r) => chg(r.exits_change_pct, r.exits), tone: (r) => chgTone(r.exits_change_pct) },
    { num: true, sort: (r) => r.rate, text: (r) => rateText(r.rate) },
  ]);
  const searchCols = [
    { key: 'label', fmt: String }, { key: 'clicks', num: true, fmt: NUM.int }, { key: 'clicks_prev', num: true, fmt: NUM.int },
    { num: true, sort: (r) => chgSort(r.change_pct, r.clicks), text: (r) => chg(r.change_pct, r.clicks), tone: (r) => chgTone(r.change_pct) },
    { key: 'impressions', num: true, fmt: NUM.int }, { key: 'position', num: true, fmt: NUM.dec1 },
  ];
  fillTable('top-rows', DATA.topPages || [], searchCols);
  fillTable('query-rows', DATA.queries || [], [{ key: 'label', fmt: String }, { sort: (r) => r.page, text: (r) => r.page }].concat(searchCols.slice(1)));
  document.querySelectorAll('.tablewrap').forEach((t) => { t.scrollTop = 0; });
}

function render() {
  fillText();
  fillTiles();
  fillLede();
  drawCharts();
  drawPies();
  drawTables();
}

// ---------- controls ----------
function buildScopeButtons() {
  const seg = el('scope-seg');
  if (!META || seg.dataset.built === '1') return;
  seg.replaceChildren();
  [{ slug: 'all', label: 'All /sports-cards' }].concat((META.brandList || []).filter((b) => b.slug !== 'other')).forEach((b) => {
    const btn = document.createElement('button'); btn.type = 'button'; btn.dataset.scope = b.slug; btn.textContent = b.label;
    btn.addEventListener('click', () => { if (state.scope === b.slug) return; state.scope = b.slug; load(); });
    seg.appendChild(btn);
  });
  seg.dataset.built = '1';
}

function presetRanges() {
  if (!META) return {};
  const end = META.latest;
  const back = (n) => ({ start: plusDays(end, -(n - 1)), end });
  return { launch: { start: META.defaults.start, end: META.defaults.end }, l28: back(28), l3m: back(90), l6m: back(180), l12m: back(365) };
}

function syncControls() {
  buildScopeButtons();
  q('#scope-seg button').forEach((b) => b.classList.toggle('on', b.dataset.scope === state.scope));
  const s = el('d-start'), e = el('d-end');
  if (META) { s.min = META.earliestStart; s.max = META.latest; e.min = META.earliestStart; e.max = META.latest; }
  if (state.start) s.value = state.start;
  if (state.end) e.value = state.end;
  const presets = presetRanges();
  q('#presets button').forEach((b) => {
    const r = presets[b.dataset.preset];
    b.classList.toggle('on', !!(r && r.start === state.start && r.end === state.end));
  });
}

const setMsg = (t) => setText('ctl-msg', t || '');

function validate(start, end) {
  if (!start || !end) return 'Pick both a start and an end date.';
  if (start > end) return 'The start date is after the end date.';
  if (META) {
    if (start < META.earliestStart) return 'The earliest start date is ' + mdy(META.earliestStart) + '.';
    if (end > META.latest) return 'Search Console data lags about two days, so the latest end date is ' + mdy(META.latest) + '.';
  }
  if ((ms(end) - ms(start)) / DAYMS + 1 > 366) return 'Please pick a range of 366 days or fewer.';
  return '';
}

function wireControls() {
  el('d-apply').addEventListener('click', () => {
    const start = el('d-start').value, end = el('d-end').value;
    const msg = validate(start, end);
    if (msg) { setMsg(msg); return; }
    state.start = start; state.end = end; load();
  });
  q('#presets button').forEach((b) => b.addEventListener('click', () => {
    const r = presetRanges()[b.dataset.preset];
    if (!r) return;
    const msg = validate(r.start, r.end);
    if (msg) { setMsg(msg); return; }
    state.start = r.start; state.end = r.end; load();
  }));
}

// ---------- loading ----------
function showError(msg) {
  let box = el('errbox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'errbox';
    box.className = 'errbox';
    document.querySelector('.sc').insertBefore(box, el('kpis'));
  }
  box.style.display = 'block';
  box.textContent = 'Could not load the data: ' + msg;
}
const hideError = () => { const b = el('errbox'); if (b) b.style.display = 'none'; };

let seq = 0;
function load() {
  const my = ++seq;
  const root = document.querySelector('.sc');
  root.classList.add('loading');
  setMsg('Loading…');
  syncControls();
  const p = new URLSearchParams({ scope: state.scope });
  if (state.start && state.end) { p.set('start', state.start); p.set('end', state.end); }
  fetch('/api/data?' + p.toString(), { credentials: 'same-origin' })
    .then((r) => {
      if (r.status === 401) { location.href = '/login.html'; return null; }
      return r.json().then((j) => { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; });
    })
    .then((d) => {
      if (!d || my !== seq) return;
      DATA = d;
      META = { defaults: d.defaults, latest: d.latest, earliestStart: d.earliestStart, brandList: d.brandList };
      state.scope = d.scope; state.start = d.window.current.start; state.end = d.window.current.end;
      hideError(); setMsg(''); render(); syncControls(); syncUrl();
    })
    .catch((e) => {
      if (my !== seq) return;
      setMsg('');
      showError(e.message);
    })
    .finally(() => { if (my === seq) root.classList.remove('loading'); });
}

wireControls();
load();

let t = null;
window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (DATA) { drawCharts(); drawPies(); } }, 150); });
})();
