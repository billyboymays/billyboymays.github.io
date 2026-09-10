const fs = require('fs');
const path = require('path');

const root = __dirname;
const source = path.join(root, 'Borgen’s Camps - Borgen’s Camp.csv');
const excludeOutlierDates = process.argv.includes('--exclude-outlier-dates');
const output = path.join(root, excludeOutlierDates ? 'Borgen_price_analysis.html' : 'Borgen_price_analysis_with_outlier_dates.html');
const alternateReport = excludeOutlierDates ? 'Borgen_price_analysis_with_outlier_dates.html' : 'Borgen_price_analysis.html';
const modeLabel = excludeOutlierDates ? 'Outliers excluded: Jan 26, 2022; Sep 14, 2022; Mar 12, 2025' : 'Outliers included: Jan 26, 2022; Sep 14, 2022; Mar 12, 2025';
const switchLabel = excludeOutlierDates ? 'Include all three outlier dates' : 'Remove all three outlier dates';
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const DAY = 86400000;

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"') {
      if (quoted && next === '"') { field += '"'; i++; } else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(field.trim()); field = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i++;
      row.push(field.trim());
      if (row.some(value => value !== '')) rows.push(row);
      row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field.trim()); rows.push(row); }
  return rows;
}

function priceOf(value) {
  const match = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function buildRecords(rows) {
  const records = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const row = rows[i];
    const year = Number(row[0]), month = MONTHS[row[1]], day = Number(row[2]);
    if (!Number.isInteger(year) || month === undefined || !Number.isInteger(day)) continue;
    const priceRow = rows[i + 1], stamp = Date.UTC(year, month, day);
    for (let column = 3; column < row.length; column++) {
      const item = row[column] && row[column].replace(/\s+/g, ' ').trim();
      const price = priceOf(priceRow[column]);
      if (item && price !== null) records.push({ item, key: item.toLowerCase(), price, stamp });
    }
    i++;
  }
  return records.sort((a, b) => a.stamp - b.stamp || a.item.localeCompare(b.item));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function fmtDate(stamp) {
  const date = new Date(stamp);
  return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function fmtAc(value) {
  return Number.isInteger(value) ? value.toLocaleString('en-US') : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function gapText(days) {
  return days === null ? '—' : `${days.toLocaleString('en-US', { maximumFractionDigits: 1 })} days`;
}

function color(price, min, max) {
  if (min === max) return '#72bfa8';
  const t = Math.max(0, Math.min(1, (Math.log1p(price) - Math.log1p(min)) / (Math.log1p(max) - Math.log1p(min))));
  const stops = [[231,241,239], [114,191,168], [229,183,92], [193,75,63]];
  const scaled = t * (stops.length - 1), index = Math.min(stops.length - 2, Math.floor(scaled)), fraction = scaled - index;
  const rgb = stops[index].map((value, i) => Math.round(value + (stops[index + 1][i] - value) * fraction));
  return `rgb(${rgb.join(',')})`;
}

const rawRecords = buildRecords(parseCsv(fs.readFileSync(source, 'utf8')));
const outlierStamps = new Set([Date.UTC(2022, 0, 26), Date.UTC(2022, 8, 14), Date.UTC(2025, 2, 12)]);
const records = excludeOutlierDates ? rawRecords.filter(item => !outlierStamps.has(item.stamp)) : rawRecords;
const groups = new Map();
for (const record of records) {
  if (!groups.has(record.key)) groups.set(record.key, { item: record.item, records: [] });
  groups.get(record.key).records.push(record);
}

const summaries = [...groups.values()].map(group => {
  const observations = group.records.sort((a, b) => a.stamp - b.stamp);
  const prices = observations.map(item => item.price), gaps = [];
  let changes = 0;
  for (let i = 1; i < observations.length; i++) {
    gaps.push((observations[i].stamp - observations[i - 1].stamp) / DAY);
    if (observations[i].price !== observations[i - 1].price) changes++;
  }
  return {
    item: group.item, key: observations[0].key, records: observations, count: observations.length,
    first: observations[0], last: observations.at(-1),
    avgGap: gaps.length ? gaps.reduce((sum, value) => sum + value, 0) / gaps.length : null,
    avgPrice: prices.reduce((sum, value) => sum + value, 0) / prices.length,
    min: Math.min(...prices), max: Math.max(...prices), net: observations.at(-1).price - observations[0].price, changes
  };
}).sort((a, b) => b.count - a.count || a.item.localeCompare(b.item));

const recurring = summaries.filter(item => item.count > 1);
const prices = records.map(item => item.price), minPrice = Math.min(...prices), maxPrice = Math.max(...prices);
const avgGap = recurring.reduce((sum, item) => sum + item.avgGap, 0) / recurring.length;
const movers = recurring.filter(item => item.changes > 0).length;
const dates = [...new Set(records.map(item => item.stamp))];
const top = recurring.slice(0, 50);
const lookup = new Map(records.map(item => [`${item.key}|${item.stamp}`, item]));

function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

const camps = dates.map(stamp => {
  const listings = records.filter(item => item.stamp === stamp);
  return { stamp, listings, count: listings.length, total: listings.reduce((sum, item) => sum + item.price, 0) };
});
const latestCamp = camps.at(-1);
const averageCampCost = camps.reduce((sum, camp) => sum + camp.total, 0) / camps.length;
const medianCampCost = median(camps.map(camp => camp.total));
const averageListingsPerCamp = records.length / camps.length;
let priceUp = 0, priceDown = 0, priceStable = 0;
for (const item of recurring) {
  for (let i = 1; i < item.records.length; i++) {
    const delta = item.records[i].price - item.records[i - 1].price;
    if (delta > 0) priceUp++;
    else if (delta < 0) priceDown++;
    else priceStable++;
  }
}
const cadence = [
  ['Frequent (90 days or less)', recurring.filter(item => item.avgGap <= 90).length],
  ['Regular (91–180 days)', recurring.filter(item => item.avgGap > 90 && item.avgGap <= 180).length],
  ['Seasonal (181–365 days)', recurring.filter(item => item.avgGap > 180 && item.avgGap <= 365).length],
  ['Rare (over 365 days)', recurring.filter(item => item.avgGap > 365).length]
];
const priceTiers = [
  ['Under 25 AC', summaries.filter(item => item.avgPrice < 25).length],
  ['25–99 AC', summaries.filter(item => item.avgPrice >= 25 && item.avgPrice < 100).length],
  ['100–199 AC', summaries.filter(item => item.avgPrice >= 100 && item.avgPrice < 200).length],
  ['200–499 AC', summaries.filter(item => item.avgPrice >= 200 && item.avgPrice < 500).length],
  ['500+ AC', summaries.filter(item => item.avgPrice >= 500).length]
];
const percentMovers = recurring
  .filter(item => item.first.price > 0 && item.net !== 0)
  .map(item => ({ ...item, percent: (item.net / item.first.price) * 100 }))
  .sort((a, b) => b.percent - a.percent);
const volatileItems = recurring
  .filter(item => item.avgPrice > 0 && item.max > item.min)
  .map(item => ({ ...item, rangePct: ((item.max - item.min) / item.avgPrice) * 100 }))
  .sort((a, b) => b.rangePct - a.rangePct);
const expensiveItems = [...summaries].sort((a, b) => b.avgPrice - a.avgPrice).slice(0, 10);
const fastestReturns = [...recurring].sort((a, b) => a.avgGap - b.avgGap || b.count - a.count).slice(0, 10);

const heatHeader = `<div class="heat-label heading">Item</div>${dates.map(date => `<div class="date-label"><span>${fmtDate(date)}</span></div>`).join('')}`;
const heatRows = top.map(item => {
  const label = `<div class="heat-label" title="${escapeHtml(item.item)}">${escapeHtml(item.item)}</div>`;
  const cells = dates.map(date => {
    const observation = lookup.get(`${item.key}|${date}`);
    return observation
      ? `<div class="heat-cell" style="background:${color(observation.price, minPrice, maxPrice)}" title="${escapeHtml(item.item)} | ${fmtDate(date)} | ${fmtAc(observation.price)} AC"></div>`
      : '<div class="heat-cell empty"></div>';
  }).join('');
  return label + cells;
}).join('');

const tableRows = recurring.map(item => {
  const changeClass = item.net > 0 ? 'pos' : item.net < 0 ? 'neg' : 'neutral';
  const change = item.net > 0 ? `+${fmtAc(item.net)}` : fmtAc(item.net);
  return `<tr><td class="item">${escapeHtml(item.item)}</td><td>${item.count}</td><td>${fmtDate(item.first.stamp)}</td><td>${fmtDate(item.last.stamp)}</td><td>${gapText(item.avgGap)}</td><td>${fmtAc(item.avgPrice)}</td><td>${fmtAc(item.min)}</td><td>${fmtAc(item.max)}</td><td>${fmtAc(item.first.price)}</td><td>${fmtAc(item.last.price)}</td><td class="${changeClass}">${change}</td><td>${item.changes}</td></tr>`;
}).join('');

function miniTable(title, headers, rows) {
  return `<article class="mini"><h3>${title}</h3><div class="mini-scroll"><table><thead><tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div></article>`;
}

const latestRows = [...latestCamp.listings].sort((a, b) => a.price - b.price).map(item =>
  `<tr><td class="item">${escapeHtml(item.item)}</td><td>${fmtAc(item.price)} AC</td></tr>`
);
const expensiveRows = expensiveItems.map(item =>
  `<tr><td class="item">${escapeHtml(item.item)}</td><td>${fmtAc(item.avgPrice)}</td><td>${fmtAc(item.min)}–${fmtAc(item.max)}</td><td>${item.count}</td></tr>`
);
const fastRows = fastestReturns.map(item =>
  `<tr><td class="item">${escapeHtml(item.item)}</td><td>${gapText(item.avgGap)}</td><td>${item.count}</td><td>${fmtDate(item.last.stamp)}</td></tr>`
);
const riseRows = percentMovers.slice(0, 10).map(item =>
  `<tr><td class="item">${escapeHtml(item.item)}</td><td class="pos">+${item.percent.toFixed(1)}%</td><td>${fmtAc(item.first.price)} → ${fmtAc(item.last.price)}</td><td>${item.count}</td></tr>`
);
const fallRows = percentMovers.slice(-10).reverse().map(item =>
  `<tr><td class="item">${escapeHtml(item.item)}</td><td class="neg">${item.percent.toFixed(1)}%</td><td>${fmtAc(item.first.price)} → ${fmtAc(item.last.price)}</td><td>${item.count}</td></tr>`
);
const volatilityRows = volatileItems.slice(0, 10).map(item =>
  `<tr><td class="item">${escapeHtml(item.item)}</td><td>${item.rangePct.toFixed(1)}%</td><td>${fmtAc(item.min)}–${fmtAc(item.max)}</td><td>${item.count}</td></tr>`
);
const cadenceRows = cadence.map(([label, count]) => `<tr><td class="item">${label}</td><td>${count}</td><td>${(count / recurring.length * 100).toFixed(1)}%</td></tr>`);
const priceTierRows = priceTiers.map(([label, count]) => `<tr><td class="item">${label}</td><td>${count}</td><td>${(count / summaries.length * 100).toFixed(1)}%</td></tr>`);
const marketPanels = [
  miniTable(`Latest camp — ${fmtDate(latestCamp.stamp)}`, ['Item', 'Price'], latestRows),
  miniTable('Most expensive by average price', ['Item', 'Avg AC', 'Range', 'Appearances'], expensiveRows),
  miniTable('Fastest return cadence', ['Item', 'Avg gap', 'Times', 'Last seen'], fastRows),
  miniTable('Largest price increases', ['Item', 'Change', 'First → last', 'Times'], riseRows),
  miniTable('Largest price decreases', ['Item', 'Change', 'First → last', 'Times'], fallRows),
  miniTable('Highest price volatility', ['Item', 'Range / avg', 'Price range', 'Times'], volatilityRows),
  miniTable('Supply cadence distribution', ['Cadence', 'Items', 'Share'], cadenceRows),
  miniTable('Average-price distribution', ['Price tier', 'Items', 'Share'], priceTierRows)
].join('');

const oneOffItems = summaries.filter(item => item.count === 1);
const recurringRecords = recurring.flatMap(item => item.records);
const averageListingPrice = records.reduce((sum, item) => sum + item.price, 0) / records.length;
const recurringAverageListingPrice = recurringRecords.reduce((sum, item) => sum + item.price, 0) / recurringRecords.length;
const recurringMedianListingPrice = median(recurringRecords.map(item => item.price));
const recurringMaxListingPrice = Math.max(...recurringRecords.map(item => item.price));
const maxCampCost = Math.max(...camps.map(camp => camp.total));
const dateOptions = [...camps].reverse().map(camp => `<option value="${camp.stamp}"${camp.stamp === latestCamp.stamp ? ' selected' : ''}>${fmtDate(camp.stamp)} — ${camp.count} items, ${fmtAc(camp.total)} AC</option>`).join('');
const allCampRows = [...camps].reverse().map(camp => `<tr><td>${fmtDate(camp.stamp)}</td><td>${camp.count}</td><td>${fmtAc(camp.total)} AC</td><td>${camp.listings.map(item => `${escapeHtml(item.item)} (${fmtAc(item.price)})`).join(', ')}</td></tr>`).join('');
const allCampHtml = `<div class="day-summary"><strong>All ${camps.length} tracked camps</strong><span>${records.length} listings</span><span>Average cost: ${fmtAc(averageCampCost)} AC</span><span>Median cost: ${fmtAc(medianCampCost)} AC</span></div><div class="day-table"><table><thead><tr><th>Date</th><th>Items</th><th>Total AC</th><th>Camp contents</th></tr></thead><tbody>${allCampRows}</tbody></table></div>`;
function campDetailHtml(camp) {
  const rows = [...camp.listings].sort((a, b) => a.price - b.price).map(item => `<tr><td class="item">${escapeHtml(item.item)}</td><td>${fmtAc(item.price)} AC</td></tr>`).join('');
  return `<div class="day-summary"><strong>${fmtDate(camp.stamp)}</strong><span>${camp.count} items</span><span>Total: ${fmtAc(camp.total)} AC</span><span>Average: ${fmtAc(camp.total / camp.count)} AC</span></div><div class="day-table"><table><thead><tr><th>Item</th><th>Price</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
const initialDayHtml = campDetailHtml(latestCamp);
const dailyData = camps.map(camp => ({ stamp: camp.stamp, count: camp.count, total: camp.total, listings: camp.listings.map(item => ({ item: item.item, price: item.price })) }));
const timelineBars = camps.map(camp => `<div class="timeline-bar" style="height:${Math.max(3, Math.round(camp.total / maxCampCost * 100))}%" title="${fmtDate(camp.stamp)} | ${fmtAc(camp.total)} AC | ${camp.count} items"></div>`).join('');
function barChart(rows, total) {
  const maximum = Math.max(...rows.map(([, count]) => count));
  return rows.map(([label, count]) => `<div class="bar-row"><div class="bar-label">${label}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, count / maximum * 100)}%"></div></div><div class="bar-value">${count} <span>(${(count / total * 100).toFixed(1)}%)</span></div></div>`).join('');
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Borgen Camp Price Analysis</title>
<style>
:root{--ink:#1d2630;--muted:#66727f;--line:#d8dee5;--panel:#fff;--page:#f4f6f8;--teal:#0c7c7b;--navy:#17324d;--gold:#c99326;--red:#c14b3f}*{box-sizing:border-box}body{margin:0;color:var(--ink);background:var(--page);font:14px/1.45 Arial,Helvetica,sans-serif}.topbar{background:var(--navy);color:#fff;border-bottom:4px solid var(--gold)}.topbar-inner{max-width:1600px;margin:0 auto;padding:22px 28px 18px;display:flex;align-items:end;justify-content:space-between;gap:24px}h1{margin:0;font-size:25px;letter-spacing:0}.subtitle{margin:5px 0 0;color:#ccd8e3}.period{font-weight:700;text-align:right;white-space:nowrap}main{max-width:1600px;margin:0 auto;padding:24px 28px 48px}.stats{display:grid;grid-template-columns:repeat(5,minmax(140px,1fr));gap:12px;margin-bottom:24px}.stat{background:var(--panel);border:1px solid var(--line);border-top:3px solid var(--teal);padding:14px 16px;min-height:91px}.stat.gold{border-top-color:var(--gold)}.stat.red{border-top-color:var(--red)}.stat-label{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.7px}.stat-value{margin-top:6px;font-size:25px;font-weight:700;font-variant-numeric:tabular-nums}section{background:var(--panel);border:1px solid var(--line);margin-top:20px}.section-head{padding:15px 18px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:baseline;gap:18px}h2{margin:0;font-size:17px}.note{color:var(--muted);font-size:12px;text-align:right}.heat-scroll{overflow:auto;max-height:720px}.heatmap{display:grid;align-items:center;width:max-content;min-width:100%;padding:0 10px 12px}.heat-label{position:sticky;left:0;z-index:3;width:215px;height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#fff;padding:2px 8px;font-size:12px;border-bottom:1px solid #eef1f4}.heat-label.heading{z-index:4;font-weight:700}.date-label{width:13px;height:76px;position:relative;border-left:1px solid #eef1f4}.date-label span{position:absolute;bottom:4px;left:2px;transform:rotate(-58deg);transform-origin:left bottom;width:66px;color:var(--muted);font-size:10px;white-space:nowrap}.heat-cell{width:13px;height:18px;border-left:1px solid rgba(255,255,255,.55);border-bottom:1px solid rgba(255,255,255,.4)}.heat-cell.empty{background:#f5f7f8}.legend{display:flex;align-items:center;gap:9px;padding:0 18px 16px;color:var(--muted);font-size:12px}.legend-scale{height:10px;width:180px;background:linear-gradient(90deg,#e7f1ef,#72bfa8,#e5b75c,#c14b3f);border:1px solid #cbd4da}.table-wrap{overflow:auto;max-height:720px}table{border-collapse:collapse;width:100%;font-size:12px}th{position:sticky;top:0;z-index:2;background:#edf2f5;color:#354552;text-align:left;text-transform:uppercase;letter-spacing:.5px;font-size:10px;white-space:nowrap}th,td{padding:9px 10px;border-bottom:1px solid #e4e9ed}td{white-space:nowrap;font-variant-numeric:tabular-nums}td.item{white-space:normal;min-width:185px;font-weight:700}td.pos{color:#08775c;font-weight:700}td.neg{color:#ad3c33;font-weight:700}td.neutral{color:var(--muted)}tr:hover td{background:#f7fafb}.method{padding:15px 18px;color:var(--muted);font-size:12px;border-top:1px solid var(--line)}@media(max-width:800px){.topbar-inner{padding:18px;display:block}.period{text-align:left;margin-top:8px}main{padding:16px}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.stat:last-child{grid-column:span 2}.section-head{display:block}.note{text-align:left;margin-top:5px}}
</style></head><body>
<style>.global-switch{display:inline-block;margin-top:8px;padding:7px 10px;border:1px solid #e4bf70;border-radius:3px;color:#fff;background:#775718;font-size:12px;font-weight:700;text-decoration:none}.global-switch:hover{background:#967123}.mode-note{margin:4px 0 0;color:#dce8ee;font-size:12px}.mini-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0}.mini{border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:15px 0 0;min-width:0}.mini:nth-child(2n){border-right:0}.mini h3{margin:0 16px 10px;font-size:14px}.mini-scroll{overflow:auto;max-height:310px}.mini table{font-size:12px}.mini th,.mini td{padding:7px 10px}.mini td.item{min-width:160px}.visual-grid{display:grid;grid-template-columns:1.35fr 1fr;gap:0}.visual{padding:16px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}.visual:nth-child(2n){border-right:0}.visual h3{margin:0 0 12px;font-size:14px}.timeline{height:170px;display:flex;align-items:end;gap:2px;padding:8px 2px 0;border-bottom:1px solid var(--line);overflow:hidden}.timeline-bar{flex:1 1 0;min-width:2px;background:#0c7c7b}.timeline-bar:nth-child(7n){background:#c99326}.timeline-note{margin-top:8px;color:var(--muted);font-size:12px}.bar-row{display:grid;grid-template-columns:145px minmax(80px,1fr) 82px;gap:9px;align-items:center;margin:9px 0;font-size:12px}.bar-label{color:#354552}.bar-track{height:12px;background:#edf2f5}.bar-fill{height:100%;background:#0c7c7b}.bar-value{font-variant-numeric:tabular-nums;text-align:right}.bar-value span{color:var(--muted)}.day-toolbar{display:flex;align-items:center;gap:12px;padding:15px 18px;border-bottom:1px solid var(--line)}.day-toolbar label{font-weight:700}.day-toolbar select{min-width:310px;max-width:100%;border:1px solid #b9c4cd;border-radius:3px;padding:8px 10px;background:#fff;font:inherit;color:var(--ink)}.day-summary{display:flex;gap:18px;flex-wrap:wrap;padding:14px 18px;background:#f7fafb;border-bottom:1px solid var(--line)}.day-summary strong{min-width:220px}.day-summary span{color:var(--muted)}.day-table{overflow:auto;max-height:500px}.outlier-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0}.outlier-metric{padding:15px 18px;border-right:1px solid var(--line)}.outlier-metric:last-child{border-right:0}.outlier-metric span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.6px}.outlier-metric strong{display:block;margin-top:5px;font-size:21px}@media(max-width:800px){.mini-grid,.visual-grid{grid-template-columns:1fr}.mini,.visual{border-right:0}.mini h3{margin-left:14px}.day-toolbar{display:block}.day-toolbar select{margin-top:8px;width:100%}.outlier-strip{grid-template-columns:repeat(2,minmax(0,1fr))}.outlier-metric:nth-child(2){border-right:0}.bar-row{grid-template-columns:110px minmax(60px,1fr) 72px}}</style>
<header class="topbar"><div class="topbar-inner"><div><h1>Borgen Camp Price Analysis</h1><p class="subtitle">Weekly camp history: item recurrence, AC prices, and price movement</p></div><div class="period">${fmtDate(records[0].stamp)} – ${fmtDate(records.at(-1).stamp)}<div class="mode-note">${modeLabel}</div><a class="global-switch" href="${alternateReport}">${switchLabel}</a></div></div></header>
<main><div class="stats"><div class="stat"><div class="stat-label">Camp listings</div><div class="stat-value">${records.length}</div></div><div class="stat"><div class="stat-label">Distinct items</div><div class="stat-value">${summaries.length}</div></div><div class="stat"><div class="stat-label">Recurring items</div><div class="stat-value">${recurring.length}</div></div><div class="stat gold"><div class="stat-label">Average recurrence gap</div><div class="stat-value">${gapText(avgGap)}</div></div><div class="stat red"><div class="stat-label">Items with price movement</div><div class="stat-value">${movers}</div></div><div class="stat"><div class="stat-label">Camps tracked</div><div class="stat-value">${camps.length}</div></div><div class="stat gold"><div class="stat-label">Average camp cost</div><div class="stat-value">${fmtAc(averageCampCost)} AC</div></div><div class="stat gold"><div class="stat-label">Median camp cost</div><div class="stat-value">${fmtAc(medianCampCost)} AC</div></div><div class="stat"><div class="stat-label">Avg listings per camp</div><div class="stat-value">${averageListingsPerCamp.toFixed(1)}</div></div><div class="stat red"><div class="stat-label">Price movements</div><div class="stat-value">${priceUp} up / ${priceDown} down</div></div></div>
<section><div class="section-head"><h2>Camp Explorer</h2><div class="note">Choose any camp date, or select all camps to browse the full history.</div></div><div class="day-toolbar"><label for="camp-picker">Camp date</label><select id="camp-picker"><option value="all">All tracked camps</option>${dateOptions}</select></div><div id="camp-details">${initialDayHtml}</div></section>
<section><div class="section-head"><h2>Market Visuals</h2><div class="note">Hover bars in the timeline for the date, total camp cost, and item count.</div></div><div class="visual-grid"><article class="visual"><h3>Camp cost over time</h3><div class="timeline">${timelineBars}</div><div class="timeline-note">Each bar represents one weekly camp. Teal bars are regular weeks; gold bars mark every seventh observation for easier scanning.</div></article><article class="visual"><h3>Recurring item supply cadence</h3>${barChart(cadence, recurring.length)}</article><article class="visual"><h3>Average-price distribution</h3>${barChart(priceTiers, summaries.length)}</article><article class="visual"><h3>Price movement direction</h3>${barChart([['Higher on next appearance', priceUp], ['Same price on next appearance', priceStable], ['Lower on next appearance', priceDown]], priceUp + priceStable + priceDown)}</article></div></section>
<section><div class="section-head"><h2>Recurring-Only Market Profile</h2><div class="note">Single-appearance items are excluded here to reduce scarcity-driven outliers and show the repeat market.</div></div><div class="outlier-strip"><div class="outlier-metric"><span>One-off items excluded</span><strong>${oneOffItems.length}</strong></div><div class="outlier-metric"><span>Repeat listings analyzed</span><strong>${recurringRecords.length}</strong></div><div class="outlier-metric"><span>Average repeat-listing price</span><strong>${fmtAc(recurringAverageListingPrice)} AC</strong></div><div class="outlier-metric"><span>Median repeat-listing price</span><strong>${fmtAc(recurringMedianListingPrice)} AC</strong></div></div><div class="method">All-listing average: ${fmtAc(averageListingPrice)} AC. Recurring-only maximum: ${fmtAc(recurringMaxListingPrice)} AC. The heat map, cadence, price movement, and detailed recurrence table already focus on items that appeared at least twice.</div></section>
<section><div class="section-head"><h2>Market Intelligence</h2><div class="note">Price direction compares consecutive appearances. Volatility is the historical range relative to average price.</div></div><div class="mini-grid">${marketPanels}</div><div class="method">Use the rankings as historical signals, not a guarantee of future camp availability or price. High percentage changes on rarely seen items can come from a small number of observations.</div></section>
<section><div class="section-head"><h2>Price Heat Map</h2><div class="note">Top 50 recurring items. Each colored square is one weekly appearance; hover for item, date, and price.</div></div><div class="heat-scroll"><div class="heatmap" style="grid-template-columns:215px repeat(${dates.length},13px)">${heatHeader}${heatRows}</div></div><div class="legend"><span>Lower AC price</span><div class="legend-scale"></div><span>Higher AC price</span></div></section>
<section><div class="section-head"><h2>Item Recurrence and Price Changes</h2><div class="note">Repeated exact item names are treated as similar items.</div></div><div class="table-wrap"><table><thead><tr><th>Item</th><th>Appearances</th><th>First seen</th><th>Last seen</th><th>Avg gap</th><th>Avg price</th><th>Min</th><th>Max</th><th>First price</th><th>Last price</th><th>Net change</th><th>Price changes</th></tr></thead><tbody>${tableRows}</tbody></table></div><div class="method">Gap = average calendar days between consecutive appearances of the same exact item. Net change = last listed price minus first listed price. Price changes counts consecutive appearances with a different price. Prices are AC.</div></section></main><script>const campData=${JSON.stringify(dailyData).replace(/</g, '\\u003c')};const allCampHtml=${JSON.stringify(allCampHtml).replace(/</g, '\\u003c')};const picker=document.getElementById('camp-picker');const detail=document.getElementById('camp-details');const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));const dateText=stamp=>new Intl.DateTimeFormat('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(stamp));const priceText=value=>Number(value).toLocaleString('en-US');function renderCamp(camp){const rows=[...camp.listings].sort((a,b)=>a.price-b.price).map(item=>'<tr><td class="item">'+esc(item.item)+'</td><td>'+priceText(item.price)+' AC</td></tr>').join('');detail.innerHTML='<div class="day-summary"><strong>'+dateText(camp.stamp)+'</strong><span>'+camp.count+' items</span><span>Total: '+priceText(camp.total)+' AC</span><span>Average: '+priceText(camp.total/camp.count)+' AC</span></div><div class="day-table"><table><thead><tr><th>Item</th><th>Price</th></tr></thead><tbody>'+rows+'</tbody></table></div>';}picker.addEventListener('change',()=>{if(picker.value==='all'){detail.innerHTML=allCampHtml;return;}const camp=campData.find(item=>String(item.stamp)===picker.value);if(camp)renderCamp(camp);});</script></body></html>`;

fs.writeFileSync(output, html, 'utf8');
console.log(JSON.stringify({ output, records: records.length, distinctItems: summaries.length, recurringItems: recurring.length, movedItems: movers }));
