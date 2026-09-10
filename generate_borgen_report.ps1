param(
    [string]$SourceCsv = "Borgen’s Camps - Borgen’s Camp.csv",
    [string]$OutputHtml = "Borgen_price_analysis.html"
)

$sourcePath = Join-Path $PSScriptRoot $SourceCsv
$outputPath = Join-Path $PSScriptRoot $OutputHtml

if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Source CSV not found: $sourcePath"
}

$encodedCsv = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($sourcePath))

$html = @'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Borgen Camp Price Analysis</title>
  <style>
    :root { --ink:#1d2630; --muted:#66727f; --line:#d8dee5; --panel:#ffffff; --page:#f4f6f8; --teal:#0c7c7b; --navy:#17324d; --gold:#c99326; --red:#c14b3f; }
    * { box-sizing:border-box; }
    body { margin:0; color:var(--ink); background:var(--page); font:14px/1.45 Arial, Helvetica, sans-serif; }
    .topbar { background:var(--navy); color:#fff; border-bottom:4px solid var(--gold); }
    .topbar-inner { max-width:1600px; margin:0 auto; padding:22px 28px 18px; display:flex; align-items:end; justify-content:space-between; gap:24px; }
    h1 { margin:0; font-size:25px; font-weight:700; letter-spacing:0; }
    .subtitle { margin:5px 0 0; color:#ccd8e3; }
    .period { color:#fff; text-align:right; white-space:nowrap; font-weight:700; }
    main { max-width:1600px; margin:0 auto; padding:24px 28px 48px; }
    .stats { display:grid; grid-template-columns:repeat(5, minmax(140px, 1fr)); gap:12px; margin-bottom:24px; }
    .stat { background:var(--panel); border:1px solid var(--line); border-top:3px solid var(--teal); padding:14px 16px; min-height:91px; }
    .stat.gold { border-top-color:var(--gold); } .stat.red { border-top-color:var(--red); }
    .stat-label { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.7px; }
    .stat-value { margin-top:6px; font-size:25px; font-weight:700; font-variant-numeric:tabular-nums; }
    section { background:var(--panel); border:1px solid var(--line); margin-top:20px; }
    .section-head { padding:15px 18px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:baseline; gap:18px; }
    h2 { margin:0; font-size:17px; letter-spacing:0; }
    .note { color:var(--muted); font-size:12px; text-align:right; }
    .heat-scroll { overflow:auto; max-height:720px; }
    .heatmap { display:grid; align-items:center; width:max-content; min-width:100%; padding:0 10px 12px; }
    .heat-label { position:sticky; left:0; z-index:3; width:215px; height:18px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; background:#fff; padding:2px 8px; font-size:12px; border-bottom:1px solid #eef1f4; }
    .date-label { width:13px; height:76px; position:relative; border-left:1px solid #eef1f4; }
    .date-label span { position:absolute; bottom:4px; left:2px; transform:rotate(-58deg); transform-origin:left bottom; width:66px; color:var(--muted); font-size:10px; white-space:nowrap; }
    .heat-cell { width:13px; height:18px; border-left:1px solid rgba(255,255,255,.55); border-bottom:1px solid rgba(255,255,255,.4); }
    .heat-cell.empty { background:#f5f7f8; }
    .legend { display:flex; align-items:center; gap:9px; padding:0 18px 16px; color:var(--muted); font-size:12px; }
    .legend-scale { height:10px; width:180px; background:linear-gradient(90deg,#e7f1ef,#72bfa8,#e5b75c,#c14b3f); border:1px solid #cbd4da; }
    .filters { display:flex; align-items:center; gap:12px; padding:14px 18px; border-bottom:1px solid var(--line); }
    input { border:1px solid #b9c4cd; border-radius:3px; padding:8px 10px; min-width:260px; font:inherit; color:var(--ink); }
    .count { color:var(--muted); font-size:12px; }
    .table-wrap { overflow:auto; max-height:720px; }
    table { border-collapse:collapse; width:100%; font-size:12px; }
    th { position:sticky; top:0; z-index:2; background:#edf2f5; color:#354552; text-align:left; text-transform:uppercase; letter-spacing:.5px; font-size:10px; white-space:nowrap; }
    th, td { padding:9px 10px; border-bottom:1px solid #e4e9ed; }
    td { white-space:nowrap; font-variant-numeric:tabular-nums; }
    td.item { white-space:normal; min-width:185px; font-weight:700; }
    td.pos { color:#08775c; font-weight:700; } td.neg { color:#ad3c33; font-weight:700; } td.neutral { color:var(--muted); }
    tr:hover td { background:#f7fafb; }
    .method { padding:15px 18px; color:var(--muted); font-size:12px; border-top:1px solid var(--line); }
    @media (max-width:800px) { .topbar-inner { padding:18px; display:block; } .period { text-align:left; margin-top:8px; } main { padding:16px; } .stats { grid-template-columns:repeat(2, minmax(0,1fr)); } .stat:last-child { grid-column:span 2; } .section-head { display:block; } .note { text-align:left; margin-top:5px; } input { min-width:0; width:100%; } }
  </style>
</head>
<body>
  <header class="topbar"><div class="topbar-inner"><div><h1>Borgen Camp Price Analysis</h1><p class="subtitle">Weekly camp history: item recurrence, AC prices, and price movement</p></div><div class="period" id="period"></div></div></header>
  <main>
    <div class="stats" id="stats"></div>
    <section>
      <div class="section-head"><h2>Price Heat Map</h2><div class="note">Top 50 recurring items. Each colored square is one weekly appearance; hover for the item, date, and price.</div></div>
      <div class="heat-scroll"><div class="heatmap" id="heatmap"></div></div>
      <div class="legend"><span>Lower AC price</span><div class="legend-scale"></div><span>Higher AC price</span></div>
    </section>
    <section>
      <div class="section-head"><h2>Item Recurrence and Price Changes</h2><div class="note">Repeated exact item names are treated as similar items. Dates use the weekly camp date.</div></div>
      <div class="filters"><input id="search" type="search" placeholder="Filter items"><span id="tableCount" class="count"></span></div>
      <div class="table-wrap"><table><thead><tr><th>Item</th><th>Appearances</th><th>First seen</th><th>Last seen</th><th>Avg gap</th><th>Avg price</th><th>Min</th><th>Max</th><th>First price</th><th>Last price</th><th>Net change</th><th>Price changes</th></tr></thead><tbody id="summaryBody"></tbody></table></div>
      <div class="method">Gap = average number of calendar days between consecutive appearances of the same exact item. Net change = last listed price minus first listed price. Price changes counts consecutive appearances with a different price. Prices are AC.</div>
    </section>
  </main>
  <script>
  const csvBase64 = '__CSV_BASE64__';
  const MONTHS = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
  const DAY = 86400000;
  function decodeBase64Utf8(base64) { const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0)); return new TextDecoder('utf-8').decode(bytes); }
  function parseCsv(text) { const rows=[]; let row=[], field='', quoted=false; for (let i=0;i<text.length;i++) { const ch=text[i], next=text[i+1]; if (ch==='"') { if (quoted && next==='"') { field+='"'; i++; } else quoted=!quoted; } else if (ch===',' && !quoted) { row.push(field.trim()); field=''; } else if ((ch==='\n' || ch==='\r') && !quoted) { if (ch==='\r' && next==='\n') i++; row.push(field.trim()); if (row.some(v=>v!=='')) rows.push(row); row=[]; field=''; } else field+=ch; } if (field || row.length) { row.push(field.trim()); rows.push(row); } return rows; }
  function priceOf(value) { const match=String(value).replace(/,/g,'').match(/-?\d+(?:\.\d+)?/); return match ? Number(match[0]) : null; }
  function buildRecords(rows) { const result=[]; for (let i=0;i<rows.length-1;i++) { const r=rows[i]; const year=Number(r[0]); const month=MONTHS[r[1]]; const date=Number(r[2]); if (!Number.isInteger(year) || month===undefined || !Number.isInteger(date)) continue; const priceRow=rows[i+1]; const stamp=new Date(Date.UTC(year,month,date)); for (let c=3;c<r.length;c++) { const item=r[c]; const price=priceOf(priceRow[c]); if (item && price!==null) result.push({item:item.replace(/\s+/g,' ').trim(), key:item.replace(/\s+/g,' ').trim().toLowerCase(), price, stamp:stamp.getTime()}); } i++; } return result.sort((a,b)=>a.stamp-b.stamp || a.item.localeCompare(b.item)); }
  function fmtDate(stamp) { return new Intl.DateTimeFormat('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(stamp)); }
  function fmtAc(n) { return Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US',{maximumFractionDigits:2}); }
  function gapText(days) { if (days===null) return '—'; return days.toLocaleString('en-US',{maximumFractionDigits:1})+' days'; }
  function color(price,min,max) { if (min===max) return '#72bfa8'; const t=Math.max(0,Math.min(1,(Math.log1p(price)-Math.log1p(min))/(Math.log1p(max)-Math.log1p(min)))); const stops=[[231,241,239],[114,191,168],[229,183,92],[193,75,63]]; const scaled=t*(stops.length-1), ix=Math.min(stops.length-2,Math.floor(scaled)), f=scaled-ix; const rgb=stops[ix].map((v,j)=>Math.round(v+(stops[ix+1][j]-v)*f)); return `rgb(${rgb.join(',')})`; }
  const records=buildRecords(parseCsv(decodeBase64Utf8(csvBase64)));
  const grouped=new Map(); for (const rec of records) { if (!grouped.has(rec.key)) grouped.set(rec.key,{item:rec.item,records:[]}); grouped.get(rec.key).records.push(rec); }
  const summaries=[...grouped.values()].map(group=>{ const r=group.records.sort((a,b)=>a.stamp-b.stamp); const prices=r.map(x=>x.price), gaps=[]; let changes=0; for(let i=1;i<r.length;i++){ gaps.push((r[i].stamp-r[i-1].stamp)/DAY); if(r[i].price!==r[i-1].price) changes++; } return { item:group.item, records:r, count:r.length, first:r[0], last:r[r.length-1], avgGap:gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:null, avgPrice:prices.reduce((a,b)=>a+b,0)/prices.length, min:Math.min(...prices), max:Math.max(...prices), net:r[r.length-1].price-r[0].price, changes }; }).sort((a,b)=>b.count-a.count || a.item.localeCompare(b.item));
  const recurring=summaries.filter(x=>x.count>1), allPrices=records.map(x=>x.price), minPrice=Math.min(...allPrices), maxPrice=Math.max(...allPrices);
  const avgGap=recurring.reduce((sum,x)=>sum+x.avgGap,0)/recurring.length, changed=recurring.filter(x=>x.changes>0).length;
  document.getElementById('period').textContent=`${fmtDate(records[0].stamp)} – ${fmtDate(records.at(-1).stamp)}`;
  const statData=[['Camp listings',records.length,''],['Distinct items',summaries.length,''],['Recurring items',recurring.length,''],['Average recurrence gap',gapText(avgGap),'gold'],['Items with price movement',changed,'red']];
  document.getElementById('stats').innerHTML=statData.map(([label,value,cls])=>`<div class="stat ${cls}"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`).join('');
  const dates=[...new Set(records.map(x=>x.stamp))]; const top=recurring.slice(0,50); const lookup=new Map(records.map(x=>[`${x.key}|${x.stamp}`,x])); const heat=document.getElementById('heatmap'); heat.style.gridTemplateColumns=`215px repeat(${dates.length},13px)`;
  heat.insertAdjacentHTML('beforeend','<div class="heat-label"><strong>Item</strong></div>'+dates.map(d=>`<div class="date-label"><span>${fmtDate(d)}</span></div>`).join(''));
  for(const item of top){ heat.insertAdjacentHTML('beforeend',`<div class="heat-label" title="${item.item}">${item.item}</div>`); for(const d of dates){ const rec=lookup.get(`${item.records[0].key}|${d}`); heat.insertAdjacentHTML('beforeend',rec?`<div class="heat-cell" style="background:${color(rec.price,minPrice,maxPrice)}" title="${item.item}\n${fmtDate(d)}\n${fmtAc(rec.price)} AC"></div>`:'<div class="heat-cell empty"></div>'); } }
  function renderTable(filter='') { const term=filter.toLowerCase(); const filtered=recurring.filter(x=>x.item.toLowerCase().includes(term)); document.getElementById('tableCount').textContent=`${filtered.length} of ${recurring.length} recurring items`; document.getElementById('summaryBody').innerHTML=filtered.map(x=>{ const changeClass=x.net>0?'pos':x.net<0?'neg':'neutral'; const changeText=x.net>0?`+${fmtAc(x.net)}`:fmtAc(x.net); return `<tr><td class="item">${x.item}</td><td>${x.count}</td><td>${fmtDate(x.first.stamp)}</td><td>${fmtDate(x.last.stamp)}</td><td>${gapText(x.avgGap)}</td><td>${fmtAc(x.avgPrice)}</td><td>${fmtAc(x.min)}</td><td>${fmtAc(x.max)}</td><td>${fmtAc(x.first.price)}</td><td>${fmtAc(x.last.price)}</td><td class="${changeClass}">${changeText}</td><td>${x.changes}</td></tr>`; }).join(''); }
  renderTable(); document.getElementById('search').addEventListener('input',e=>renderTable(e.target.value));
  </script>
</body>
</html>
'@

$html = $html.Replace('__CSV_BASE64__', $encodedCsv)
[System.IO.File]::WriteAllText($outputPath, $html, [System.Text.UTF8Encoding]::new($false))
Write-Output "Created $outputPath"
