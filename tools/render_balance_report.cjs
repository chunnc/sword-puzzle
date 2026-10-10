const difficultyNames={easy:'Dễ',medium:'Trung bình',hard:'Khó','very-hard':'Rất khó'};
const powerNames={minimum:'Tối thiểu',expected:'Dự kiến',strong:'Mạnh'};
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(value,digits=0)=>Number.isFinite(value)?value.toLocaleString('vi-VN',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
const percent=value=>Number.isFinite(value)?number(value*100,1)+'%':'—';
const badge=(label,kind='neutral')=>`<span class="badge ${kind}">${escape(label)}</span>`;
const histogram=(values,label)=>{
  const entries=Object.entries(values??{}),max=Math.max(1,...entries.map(([,n])=>n));
  return entries.length?`<div class="histogram" aria-label="${escape(label)}">${entries.map(([n,count])=>`<div class="histogram-row"><span>${escape(n)}</span><div class="histogram-track"><i style="width:${count/max*100}%"></i></div><span>${number(count)}</span></div>`).join('')}</div>`:'<p class="muted">Chưa có lượt thắng để lập phân bố.</p>';
};
function band(rate,range,tolerance=0) {
  if(!range)return `<strong>${percent(rate)}</strong>`;
  const lo=Math.max(0,range[0]-tolerance),hi=Math.min(1,range[1]+tolerance),inTarget=rate>=range[0]&&rate<=range[1];
  return `<div class="rate-value"><strong>${percent(rate)}</strong><span class="muted">${percent(range[0])}–${percent(range[1])}</span></div>
    <div class="band-track" role="img" aria-label="${escape(`Kết quả ${percent(rate)}; mục tiêu ${percent(range[0])} đến ${percent(range[1])}`)}">
    <span class="band-tolerance" style="left:${lo*100}%;width:${(hi-lo)*100}%"></span>
    <span class="band-goal" style="left:${range[0]*100}%;width:${(range[1]-range[0])*100}%"></span>
    <span class="band-marker ${inTarget?'':'outside'}" style="left:${Math.min(99,Math.max(1,rate*100))}%"></span></div>`;
}

function renderBalanceReport(report) {
  const run=report.run??{},checks=report.checks??{status:'not-run',tolerance:0,results:[],failures:[]};
  const maps=new Map((report.maps??[]).map(m=>[m.id,m]));
  const profiles=report.reports??[],retries=report.retries??[];
  const mapIds=[...new Set([...profiles.map(r=>r.id),...retries.map(r=>r.id),...(run.maps??[])])].sort((a,b)=>a-b);
  const firstSamples=profiles.reduce((sum,r)=>sum+r.samples,0),retrySamples=retries.reduce((sum,r)=>sum+r.samples,0);
  const retryAttempts=retries.reduce((sum,r)=>sum+(r.totalAttempts??0),0);
  const status=run.status==='error'?'error':checks.status;
  const statuses={passed:['Đạt kiểm tra','good'],failed:['Không đạt kiểm tra','bad'],'not-run':['Chưa bật --check','neutral'],'not-applicable':['Chưa có profile để kiểm tra','neutral'],error:['Lần chạy bị gián đoạn','bad']};
  const [statusText,statusKind]=statuses[status]??statuses['not-run'];
  const gateFor=r=>checks.results.find(c=>c.id===r.id&&c.bot===r.bot&&c.power===r.power);
  const attributes=r=>`data-profile data-map="${escape(r.id)}" data-bot="${escape(r.bot)}" data-power="${escape(r.power)}"`;
  const mapLabel=id=>`Map ${id} · ${maps.get(id)?.name??`Màn ${id}`}`;
  const options=(entries,label)=>`<option value="">${label}</option>${entries.map(([value,name])=>`<option value="${escape(value)}">${escape(name)}</option>`).join('')}`;
  const time=run.startedAt?new Date(run.startedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'—';
  const serialize=JSON.stringify(report).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const rows=profiles.map(r=>{
    const gate=gateFor(r),standard=r.bot==='normal'&&r.power==='expected',target=standard?report.targets[r.difficulty]:null;
    const label=gate?(gate.passed?'Đạt':'Không đạt'):'Tham khảo';
    return `<tr ${attributes(r)}><th scope="row"><a href="#profile-${r.id}-${escape(r.bot)}-${escape(r.power)}">Map ${r.id}</a><small>${escape(difficultyNames[r.difficulty]??r.difficulty)}</small></th>
      <td>${escape(r.bot)}</td><td>${escape(powerNames[r.power]??r.power)}</td><td class="numeric">${number(r.samples)}</td>
      <td class="rate-cell">${band(r.winRate,target?.win,checks.tolerance)}</td><td class="numeric">${percent(r.starRates[0])}</td><td class="numeric">${percent(r.starRates[1])}</td><td class="numeric">${percent(r.starRates[2])}</td>
      <td class="rate-cell">${band(r.starRates[3],target?.three,checks.tolerance)}</td><td class="numeric">${number(r.averageMoves,2)}</td>
      <td>${badge(label,gate?(gate.passed?'good':'bad'):'neutral')}</td></tr>`;
  }).join('');
  const details=profiles.map(r=>{
    const m=maps.get(r.id),gate=gateFor(r);
    return `<details class="profile-detail" id="profile-${r.id}-${escape(r.bot)}-${escape(r.power)}" ${attributes(r)}>
      <summary><span>${escape(mapLabel(r.id))}</span><span class="muted">${escape(r.bot)} / ${escape(powerNames[r.power]??r.power)}</span></summary>
      <div class="detail-body"><div><h3>Số lượt đổi ô khi thắng</h3>${histogram(r.movesHistogram,'Số ván thắng theo số lượt đổi ô')}
      <p class="muted">${m?`Ngân sách ${m.moves} lượt · 3 sao ≤ ${m.starThresholds.threeStarMaxMovesUsed} · 2 sao ≤ ${m.starThresholds.twoStarMaxMovesUsed}.`:''} Kỹ năng không tính vào lượt đổi ô.</p></div>
      <div><h3>Diễn biến ván chơi</h3><dl class="metrics"><dt>Tiến độ nhiệm vụ trung bình</dt><dd>${percent(r.averageProgress)}</dd>
      <dt>Tiến độ khi thua</dt><dd>${percent(r.averageFailedProgress)}</dd><dt>Đợt giải quyết trung bình / ván</dt><dd>${number(r.averageWaves,2)}</dd>
      <dt>Chain lớn nhất</dt><dd>${number(r.maxChain)}</dd><dt>Xáo bàn trung bình / ván</dt><dd>${number(r.averageReshuffles,2)}</dd></dl>
      <p class="muted">Các đợt giải quyết bao gồm cả đổi ô và kỹ năng.</p>
      ${m?`<h3>Mục tiêu map</h3><ul>${m.objectives.map(o=>`<li>${escape(o.type)}${o.type==='Collect'?` · loại ô ${escape(o.tileKind)}`:''}: ${number(o.target)}</li>`).join('')}</ul>`:''}
      ${gate?.failures.length?`<ul class="failure-list">${gate.failures.map(f=>`<li>${escape(f)}</li>`).join('')}</ul>`:''}
      <small class="hash">Map hash: ${escape(r.mapHash)}</small></div></div></details>`;
  }).join('');
  const retryRows=retries.map(r=>`<tr data-retry data-map="${r.id}"><th scope="row"><a href="#retry-${r.id}">Map ${r.id}</a></th><td class="numeric">${number(r.samples)}</td>
    <td class="numeric">${number(r.completed)}</td><td class="numeric">${number(r.unfinished)}</td><td class="numeric">${percent(r.completed/r.samples)}</td>
    <td class="numeric">${number(r.averageAttempts,2)}</td><td class="numeric">${number(r.totalAttempts)}</td></tr>`).join('');
  const retryDetails=retries.map(r=>`<details class="profile-detail" id="retry-${r.id}" data-retry data-map="${r.id}">
    <summary><span>${escape(mapLabel(r.id))} · hỗ trợ sau chuỗi thua</span>${badge(r.hasSpawnPressure?'Có áp lực sinh ô':'Không có áp lực sinh ô',r.hasSpawnPressure?'neutral':'quiet')}</summary>
    <div class="retry-body"><p>Bot <strong>${escape(r.bot)}</strong> / sức mạnh <strong>${escape(powerNames[r.power]??r.power)}</strong>. Mỗi chuỗi dừng khi thắng hoặc sau ${r.maxAttempts} lần chơi.</p>
    ${!r.hasSpawnPressure?'<p class="notice">Map này không có áp lực sinh ô đang được hỗ trợ. Retry thay đổi seed; giảm áp lực không làm thay đổi luật sinh ô.</p>':''}
    <h3>Tỷ lệ thắng theo mức hỗ trợ</h3><div class="table-wrap"><table><thead><tr><th>Giảm áp lực</th><th>Số lần chơi</th><th>Thắng</th><th>Thua</th><th>Tỷ lệ thắng</th><th>3 sao</th></tr></thead><tbody>
    ${r.byAssist.map(b=>`<tr><th scope="row">${percent(b.assist)}</th><td class="numeric">${number(b.samples)}</td><td class="numeric">${number(b.wins)}</td><td class="numeric">${number(b.losses)}</td>
    <td class="numeric">${percent(b.winRate)}</td><td class="numeric">${b.samples?percent(b.starRates[3]):'—'}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted">Tính trên những lần chơi thực sự đến mức hỗ trợ này. Mức 0% gồm cả lần chơi đầu. Giảm áp lực 30% không có nghĩa là tăng tỷ lệ thắng 30 điểm phần trăm; đây chưa phải so sánh bật/tắt hỗ trợ trên cùng bộ seed.</p>
    <div class="detail-body"><div><h3>Thắng ở lần chơi thứ mấy?</h3>${histogram(r.attemptsHistogram,'Số chuỗi thắng theo lần chơi')}
    <p class="muted">Trung bình tính trên ${number(r.completed)} chuỗi đã thắng; ${number(r.unfinished)} chuỗi còn lại dừng ở ${r.maxAttempts} lần.</p></div>
    <div><h3>Diễn biến từng lần chơi</h3><div class="table-wrap attempt-table"><table><thead><tr><th>Lần</th><th>Hỗ trợ</th><th>Đã chơi</th><th>Thắng</th><th>Tỷ lệ thắng</th><th>Đã vượt màn¹</th></tr></thead><tbody>
    ${r.byAttempt.filter(b=>b.samples).map(b=>`<tr><th scope="row">${b.attempt}</th><td>${percent(b.assist)}</td><td class="numeric">${number(b.samples)}</td><td class="numeric">${number(b.wins)}</td><td class="numeric">${percent(b.winRate)}</td><td class="numeric">${percent(b.cumulativeWinRate)}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted">¹ Tỷ lệ tích lũy trên toàn bộ ${number(r.samples)} chuỗi của map.</p></div></div></div></details>`).join('');
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Report độ khó map · ${escape(run.id??report.contentVersion)}</title>
<style>
:root{--paper:#edf3f8;--surface:#fff;--ink:#19334a;--muted:#5c7285;--line:#ccdae4;--jade:#147d75;--amber:#a86819;--brick:#b44940}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:1440px;margin:auto;padding:36px 28px 60px}h1{font:600 clamp(26px,3vw,40px)/1.2 Georgia,"Times New Roman",serif;margin:8px 0 16px}h2{font-size:21px;line-height:1.4;margin:0}h3{font-size:15px;margin:0 0 12px}p{margin:8px 0 16px}a{color:var(--jade);text-underline-offset:3px}small{font-size:12px}button,select{font:inherit;color:var(--ink)}button,select{border:1px solid var(--line);background:var(--surface);border-radius:6px;padding:8px 12px}button{cursor:pointer}button:hover{border-color:var(--jade)}:focus-visible{outline:3px solid var(--jade);outline-offset:3px}[hidden]{display:none!important}
.eyebrow{font:12px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.06em;color:var(--muted)}.muted{color:var(--muted);font-size:13px}.header-top,.section-heading{display:flex;align-items:center;justify-content:space-between;gap:20px}.section-heading{margin-bottom:16px}.section-heading p{margin:0}.run-meta{display:flex;gap:10px 24px;flex-wrap:wrap;color:var(--muted);font-size:13px}.run-meta strong{color:var(--ink)}
.summary-strip{display:flex;flex-wrap:wrap;background:var(--ink);color:#fff;border-radius:8px;margin:24px 0;padding:16px 20px;gap:18px 36px}.summary-strip span{font-size:12px;color:#c0d7e5;display:block}.summary-strip strong{font-size:20px;font-variant-numeric:tabular-nums}.command{margin-top:18px;padding:12px 16px;background:#dfeaf2;border-radius:6px;overflow-wrap:anywhere;white-space:pre-wrap;font:12px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace}
.filters{position:sticky;top:0;z-index:2;display:flex;align-items:end;gap:12px;flex-wrap:wrap;padding:16px 0;background:var(--paper);border-bottom:1px solid var(--line);margin-bottom:24px}.filters label{display:grid;gap:4px;font-size:12px;font-weight:600}.filters select{min-width:160px}.filters .filter-count{margin:auto 0 8px auto}
section{margin-top:32px}.panel{background:var(--surface);border:1px solid var(--line);border-radius:8px;overflow:hidden}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px;white-space:nowrap}th,td{padding:13px 14px;text-align:left;border-bottom:1px solid #e1eaf0}thead th{background:#e6eff5;color:var(--muted);font-size:11px;letter-spacing:.03em}tbody tr:last-child>*{border-bottom:0}tbody tr:hover{background:#f5f9fc}th small{display:block;color:var(--muted);font-weight:400}.numeric{font-variant-numeric:tabular-nums;text-align:right}.rate-cell{min-width:180px}.rate-value{display:flex;align-items:baseline;justify-content:space-between;gap:12px;font-variant-numeric:tabular-nums}.rate-value span{font-size:10px}.band-track{position:relative;height:12px;background:#e7eef3;border-radius:3px;margin-top:8px}.band-goal,.band-tolerance{position:absolute;top:0;height:100%;border-radius:2px}.band-tolerance{background:#dce7e5;border:1px solid #a2bfb9}.band-goal{background:#89c6bc}.band-marker{position:absolute;top:-3px;height:18px;width:3px;background:var(--ink);transform:translateX(-50%)}.band-marker.outside{background:var(--amber)}.legend{display:flex;gap:16px;flex-wrap:wrap;margin-top:12px;font-size:12px;color:var(--muted)}.legend i{display:inline-block;width:14px;height:10px;background:#89c6bc;margin-right:5px}.legend i.tolerance{background:#dce7e5;border:1px solid #a2bfb9}.legend i.marker{width:3px;background:var(--ink)}
.badge{display:inline-flex;padding:4px 9px;border-radius:4px;font-size:11px;font-weight:650;line-height:1.4;background:#e6eef4;color:var(--ink);white-space:normal}.badge.good{background:#d9eee8;color:#08675d}.badge.bad{background:#f5dfdb;color:#963b33}.badge.quiet{background:#f2eadb;color:#825918}.failure-list{color:var(--brick);font-size:13px;margin:12px 0;padding-left:20px}.notice{background:#f5eedf;color:#715019;border-left:3px solid var(--amber);padding:10px 14px;font-size:13px}.error-panel{border:1px solid #dcb9b3;background:#fff4f1;padding:16px;border-radius:6px;margin:20px 0}
.profile-detail{background:var(--surface);border:1px solid var(--line);border-radius:6px;margin-top:10px;scroll-margin-top:100px}.profile-detail summary{cursor:pointer;padding:14px 18px;font-size:13px;font-weight:600}.profile-detail summary>span{margin-right:16px}.profile-detail[open] summary{border-bottom:1px solid var(--line)}.detail-body{display:grid;grid-template-columns:1fr 1fr;gap:32px;padding:20px}.retry-body{padding:20px}.retry-body>.detail-body{padding:24px 0 0}.metrics{display:grid;grid-template-columns:1fr auto;gap:8px 20px;font-size:13px;margin:0 0 16px}.metrics dd{margin:0;font-weight:600;font-variant-numeric:tabular-nums}.hash{display:block;overflow-wrap:anywhere;color:var(--muted);font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.histogram-row{display:grid;grid-template-columns:28px 1fr 40px;gap:12px;align-items:center;font:12px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;margin:6px 0}.histogram-row>span:last-child{text-align:right}.histogram-track{height:12px;background:#edf3f7;border-radius:2px}.histogram-track i{display:block;height:100%;background:var(--jade);border-radius:2px}.attempt-table{max-height:500px}.empty{padding:20px;text-align:center;color:var(--muted)}.target-table{max-width:720px}footer{border-top:1px solid var(--line);margin-top:36px;padding-top:16px;color:var(--muted);font-size:12px}
@media(max-width:720px){main{padding:22px 14px 36px}.header-top,.section-heading{align-items:start;flex-direction:column;gap:8px}.filters{position:static}.filters label{flex:1}.filters select{min-width:0;width:100%}.filters .filter-count{width:100%;margin:0}.detail-body{grid-template-columns:1fr;gap:20px}.summary-strip{gap:16px 24px}th,td{padding:10px}.retry-body{padding:14px}}@media print{.filters,button{display:none}body{background:#fff}main{padding:0}.table-wrap{overflow:visible}.profile-detail{break-inside:avoid}.command{white-space:pre-wrap}}
</style></head><body><main>
<header><div class="header-top"><span class="eyebrow">SWORD PUZZLE / BALANCE RUN / v${escape(report.contentVersion)}</span><button type="button" id="download-json">Tải dữ liệu JSON</button></div>
<h1>Kiểm định độ khó map</h1><div class="run-meta"><span><strong>${escape(time)}</strong> · UTC+7</span><span>Thời lượng <strong>${number(run.durationSeconds,1)} giây</strong></span><span>Seed suite <strong>${escape(report.suite)}</strong></span><span><strong>${number(report.seeds)}</strong> seed / profile</span></div>
<div class="summary-strip"><div><span>Map đã chọn</span><strong>${number(mapIds.length)}</strong></div><div><span>Lượt chơi đầu</span><strong>${number(firstSamples)}</strong></div><div><span>Chuỗi retry</span><strong>${number(retrySamples)}</strong></div><div><span>Lần chơi trong các chuỗi</span><strong>${number(retryAttempts)}</strong></div><div><span>Kết quả kiểm tra</span>${badge(statusText,statusKind)}</div></div>
<div class="command">${escape(run.command??'')}</div></header>
${run.error?`<div class="error-panel"><strong>Lần chạy bị gián đoạn</strong><p>${escape(run.error)}</p><p class="muted">Các bảng dưới đây chứa những profile đã hoàn tất trước khi lỗi xảy ra.</p></div>`:''}
${checks.failures.length?`<div class="error-panel"><strong>${checks.enabled?'Các kiểm tra không đạt':'Các kết quả cần xem lại'}</strong><ul class="failure-list">${checks.failures.map(f=>`<li>${escape(f)}</li>`).join('')}</ul></div>`:''}
<form class="filters" id="filters"><label>Map<select id="filter-map">${options(mapIds.map(id=>[id,mapLabel(id)]),'Tất cả map')}</select></label>
<label>Bot<select id="filter-bot">${options([...new Set(profiles.map(r=>r.bot))].map(b=>[b,b]),'Tất cả bot')}</select></label>
<label>Sức mạnh<select id="filter-power">${options([...new Set(profiles.map(r=>r.power))].map(p=>[p,powerNames[p]??p]),'Tất cả sức mạnh')}</select></label>
<button type="reset">Đặt lại bộ lọc</button><span class="muted filter-count" id="filter-count" aria-live="polite"></span></form>
<section><div class="section-heading"><h2>Kết quả lần chơi đầu</h2><p>Tỷ lệ sao tính trên toàn bộ lượt chơi, bao gồm lượt thua.</p></div>
<div class="panel" data-filter-group><div class="table-wrap"><table id="profiles-table"><thead><tr><th>Map / độ khó</th><th>Bot</th><th>Sức mạnh</th><th>Số mẫu</th><th>Thắng / mục tiêu</th><th>Thua</th><th>1 sao</th><th>2 sao</th><th>3 sao / mục tiêu</th><th>Lượt TB khi thắng</th><th>Đánh giá</th></tr></thead><tbody>${rows}</tbody></table></div><p class="empty" data-empty hidden>Không có profile phù hợp với bộ lọc.</p></div>
<div class="legend"><span><i></i>Khoảng mục tiêu</span><span><i class="tolerance"></i>Khoảng kiểm tra sau dung sai</span><span><i class="marker"></i>Kết quả thực tế</span></div>
<p class="muted">Khoảng mục tiêu áp dụng cho normal / sức mạnh dự kiến. Dung sai kiểm tra: ${number(checks.tolerance*100)} điểm phần trăm${checks.tolerance?' do mẫu dưới 1.000 seed':''}. Strategic / dự kiến được đối chiếu với basic cùng sức mạnh khi có dữ liệu; các profile khác dùng để tham khảo.</p>
</section>
<section data-filter-group><div class="section-heading"><h2>Chi tiết từng profile</h2><p>Mở một dòng để xem phân bố lượt và diễn biến.</p></div>${details}<p class="empty" data-empty hidden>Không có profile phù hợp với bộ lọc.</p></section>
<section><div class="section-heading"><h2>Retry và hỗ trợ sau chuỗi thua</h2><p>Bộ lọc map áp dụng cho retry; bot luôn là normal / dự kiến.</p></div>
${retries.length?`<div class="panel" data-filter-group><div class="table-wrap"><table><thead><tr><th>Map</th><th>Số chuỗi</th><th>Đã thắng</th><th>Chưa thắng</th><th>Vượt trong ≤30 lần</th><th>Lần TB để thắng</th><th>Tổng lần chơi</th></tr></thead><tbody>${retryRows}</tbody></table></div><p class="empty" data-empty hidden>Không có retry phù hợp với bộ lọc map.</p></div>
<div data-filter-group>${retryDetails}<p class="empty" data-empty hidden>Không có retry phù hợp với bộ lọc map.</p></div>`:'<div class="panel empty"><strong>Chưa chạy retry.</strong><p>Thêm <code>--retry-seeds 100</code> hoặc chạy <code>npm run maps:release</code> để quan sát hỗ trợ sau chuỗi thua.</p></div>'}
</section>
<section><div class="section-heading"><h2>Khoảng mục tiêu độ khó</h2></div><div class="panel target-table"><table><thead><tr><th>Độ khó</th><th>Thắng</th><th>3 sao</th></tr></thead><tbody>${Object.entries(report.targets).map(([name,t])=>`<tr><th scope="row">${escape(difficultyNames[name]??name)}</th><td>${percent(t.win[0])}–${percent(t.win[1])}</td><td>${percent(t.three[0])}–${percent(t.three[1])}</td></tr>`).join('')}</tbody></table></div></section>
<footer><p>Report tự chứa, xem được offline. Bot dùng engine thật với kiếm thanh-phong và kỹ năng nhat-kiem. Thống kê mô phỏng dùng để đối chiếu cân bằng map.</p><p>Run ${escape(run.id??'—')} · Config hash <code>${escape(report.configHash??'—')}</code></p></footer>
</main><script id="report-data" type="application/json">${serialize}</script>
<script>
const mapFilter=document.getElementById('filter-map'),botFilter=document.getElementById('filter-bot'),powerFilter=document.getElementById('filter-power');
function applyFilters(){
  let visible=0;
  document.querySelectorAll('[data-profile]').forEach(el=>{el.hidden=!!((mapFilter.value&&el.dataset.map!==mapFilter.value)||(botFilter.value&&el.dataset.bot!==botFilter.value)||(powerFilter.value&&el.dataset.power!==powerFilter.value));if(el.tagName==='TR'&&!el.hidden)visible++;});
  document.querySelectorAll('[data-retry]').forEach(el=>{el.hidden=!!(mapFilter.value&&el.dataset.map!==mapFilter.value);});
  document.querySelectorAll('[data-filter-group]').forEach(group=>{const empty=group.querySelector('[data-empty]');empty.hidden=Array.from(group.querySelectorAll('[data-profile],[data-retry]')).some(el=>!el.hidden);});
  document.getElementById('filter-count').textContent=visible+' / '+document.querySelectorAll('#profiles-table tbody tr').length+' profile';
}
document.getElementById('filters').addEventListener('change',applyFilters);
document.getElementById('filters').addEventListener('submit',event=>event.preventDefault());
document.getElementById('filters').addEventListener('reset',()=>setTimeout(applyFilters,0));
document.getElementById('download-json').addEventListener('click',()=>{const data=document.getElementById('report-data').textContent;const report=JSON.parse(data);const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='maps-'+(report.run.id||'report')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
applyFilters();
document.querySelectorAll('#profiles-table a').forEach(link=>link.addEventListener('click',()=>{const detail=document.querySelector(link.getAttribute('href'));if(detail)detail.open=true;}));
document.querySelectorAll('a[href^="#retry-"]').forEach(link=>link.addEventListener('click',()=>{const detail=document.querySelector(link.getAttribute('href'));if(detail)detail.open=true;}));
</script></body></html>`;
}

module.exports={renderBalanceReport};
