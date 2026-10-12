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
  const botModel=report.botModel??null;
  const source=report.source??null;
  const sourceLabels={server:['Server (vừa đồng bộ)','good'],cache:['Cache local','neutral'],local:['Authoring local (chưa publish)','quiet'],authoring:['Dữ liệu authoring','quiet']};
  const [sourceLabel,sourceKind]=source?[...(sourceLabels[source.kind]??[source.kind??'—','neutral'])]:[null,null];
  const maps=new Map((report.maps??[]).map(m=>[m.id,m]));
  const profiles=report.reports??[],retries=report.retries??[];
  const mapIds=[...new Set([...maps.keys(),...profiles.map(r=>r.id),...retries.map(r=>r.id),...(run.maps??[])])].sort((a,b)=>a-b);
  const defaultProfile=profiles.find(r=>r.bot==='normal'&&r.power==='expected')??profiles.find(r=>r.power==='expected')??profiles[0];
  const defaultBot=defaultProfile?.bot??'normal',defaultPower=defaultProfile?.power??'expected';
  const assistLevels=[...new Set([0,...retries.flatMap(r=>(r.byAssist??[]).map(b=>b.assist)),...(report.maps??[]).flatMap(m=>m.retryAssistPolicy?.reductions??[])])].sort((a,b)=>a-b);
  const firstSamples=profiles.reduce((sum,r)=>sum+r.samples,0),retrySamples=retries.reduce((sum,r)=>sum+r.samples,0);
  const retryAttempts=retries.reduce((sum,r)=>sum+(r.totalAttempts??0),0);
  const status=run.status==='error'?'error':checks.status;
  const statuses={passed:['Đạt kiểm tra','good'],failed:['Không đạt kiểm tra','bad'],'not-run':['Chưa bật --check','neutral'],'not-applicable':['Chưa có profile để kiểm tra','neutral'],error:['Lần chạy bị gián đoạn','bad']};
  const [statusText,statusKind]=statuses[status]??statuses['not-run'];
  const gateFor=r=>checks.results.find(c=>c.id===r.id&&c.bot===r.bot&&c.power===r.power);
  const attributes=r=>`data-profile data-map="${escape(r.id)}" data-bot="${escape(r.bot)}" data-power="${escape(r.power)}"`;
  const mapLabel=id=>`Map ${id} · ${maps.get(id)?.name??`Màn ${id}`}`;
  const options=(entries,label=null,selected=null)=>`${label?`<option value="">${label}</option>`:''}${entries.map(([value,name])=>`<option value="${escape(value)}"${value===selected?' selected':''}>${escape(name)}</option>`).join('')}`;
  const time=run.startedAt?new Date(run.startedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'—';
  const formatTime=value=>value?new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'—';
  const serialize=JSON.stringify(report).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const comparisonRow=r=>{
    const gate=gateFor(r),standard=r.bot==='normal'&&r.power==='expected',target=standard?report.targets[r.difficulty]:null;
    const label=gate?(gate.passed?'Đạt':'Không đạt'):'Tham khảo';
    return `<tr ${attributes(r)}><th scope="row"><a data-detail-link href="#profile-${escape(r.id)}-${escape(r.bot)}-${escape(r.power)}">${escape(r.bot)}</a></th>
      <td>${escape(powerNames[r.power]??r.power)}</td><td class="numeric">${number(r.samples)}</td>
      <td class="numeric">${percent(r.winRate)}</td><td class="numeric">${percent(r.starRates[0])}</td><td class="numeric">${percent(r.starRates[1])}</td><td class="numeric">${percent(r.starRates[2])}</td>
      <td class="rate-cell">${band(r.starRates[3],target?.three,checks.tolerance)}</td><td class="numeric">${number(r.averageMoves,2)}</td>
      <td class="numeric">${number(r.suboptimalChoices)}<small>${percent(r.suboptimalChoiceRate)}</small></td>
      <td>${badge(label,gate?(gate.passed?'good':'bad'):'neutral')}</td></tr>`;
  };
  const profileDetail=r=>{
    const m=maps.get(r.id),gate=gateFor(r);
    const starRules=!m?'':`Ngân sách gốc ${m.moves} lượt · 3 sao &lt; ${m.starThresholds.threeStarBelowPercent}% (tối đa ${Math.ceil(m.moves*m.starThresholds.threeStarBelowPercent/100)-1}) · 2 sao &lt; ${m.starThresholds.twoStarBelowPercent}% (tối đa ${Math.ceil(m.moves*m.starThresholds.twoStarBelowPercent/100)-1}).`;
    return `<details class="profile-detail" id="profile-${r.id}-${escape(r.bot)}-${escape(r.power)}" ${attributes(r)}>
      <summary><span>${escape(mapLabel(r.id))}</span><span class="muted">${escape(r.bot)} / ${escape(powerNames[r.power]??r.power)}</span></summary>
      <div class="detail-body"><div><h3>Số lượt đổi ô khi thắng</h3>${histogram(r.movesHistogram,'Số ván thắng theo số lượt đổi ô')}
      <p class="muted">${starRules} Kỹ năng không tính vào lượt đổi ô.</p></div>
      <div><h3>Diễn biến ván chơi</h3><dl class="metrics"><dt>Median lượt đổi ô khi thắng</dt><dd>${number(r.medianMoves,1)}</dd><dt>Settlement / hành động</dt><dd>${percent(r.settlementRate)}</dd>
      <dt>Thế chuẩn bị tạo / dùng</dt><dd>${number(r.metrics?.setups)} / ${number(r.metrics?.setupUsed)}</dd><dt>Charge tạo / kích hoạt</dt><dd>${number(r.metrics?.chargesCreated)} / ${number(r.metrics?.chargesActivated)}</dd>
      <dt>Tiến độ nhiệm vụ trung bình</dt><dd>${percent(r.averageProgress)}</dd>
      <dt>Tiến độ khi thua</dt><dd>${percent(r.averageFailedProgress)}</dd><dt>Chọn nước kém tối ưu</dt><dd>${number(r.suboptimalChoices)} (${percent(r.suboptimalChoiceRate)})</dd><dt>Đợt giải quyết trung bình / ván</dt><dd>${number(r.averageWaves,2)}</dd>
      <dt>Chain lớn nhất</dt><dd>${number(r.maxChain)}</dd><dt>Xáo bàn trung bình / ván</dt><dd>${number(r.averageReshuffles,2)}</dd></dl>
      <p class="muted">Các đợt giải quyết bao gồm cả đổi ô và kỹ năng.</p>
      ${r.waveCounts?`<h3>Wave / hành động</h3>${histogram(r.waveCounts,'Phân bố wave trên mỗi hành động')}`:''}
      ${m?`<h3>Mục tiêu map</h3><ul>${m.objectives.map(o=>`<li>${escape(o.type)}${o.type==='Collect'?` · loại ô ${escape(o.tileKind)}`:''}: ${number(o.target)}</li>`).join('')}</ul>`:''}
      ${gate?.failures.length?`<ul class="failure-list">${gate.failures.map(f=>`<li>${escape(f)}</li>`).join('')}</ul>`:''}
      <small class="hash">Map hash: ${escape(r.mapHash)}</small></div></div></details>`;
  };
  const retryDetail=r=>`<details class="profile-detail" id="retry-${escape(r.id)}">
    <summary><span>${escape(mapLabel(r.id))} · hỗ trợ sau chuỗi thua</span>${badge(r.hasSpawnPressure?'Có áp lực sinh ô':'Không có áp lực sinh ô',r.hasSpawnPressure?'neutral':'quiet')}</summary>
    <div class="retry-body"><p>Bot <strong>${escape(r.bot)}</strong> / sức mạnh <strong>${escape(powerNames[r.power]??r.power)}</strong>. Mỗi chuỗi dừng khi thắng hoặc sau ${r.maxAttempts} lần chơi. Có ${number(r.suboptimalChoices)} lựa chọn kém tối ưu trên ${number(r.totalAttempts)} lần chơi.</p>
    ${!r.hasSpawnPressure?'<p class="notice">Map này không có áp lực sinh ô đang được hỗ trợ. Retry thay đổi seed; giảm áp lực không làm thay đổi luật sinh ô.</p>':''}
    <h3>Tỷ lệ thắng theo mức hỗ trợ</h3><div class="table-wrap"><table><thead><tr><th>Giảm áp lực</th><th>Số lần chơi</th><th>Thắng</th><th>Thua</th><th>Tỷ lệ thắng</th><th>3 sao</th><th>Nước kém tối ưu</th></tr></thead><tbody>
    ${(r.byAssist??[]).map(b=>`<tr><th scope="row">${percent(b.assist)}</th><td class="numeric">${number(b.samples)}</td><td class="numeric">${number(b.wins)}</td><td class="numeric">${number(b.losses)}</td>
    <td class="numeric">${percent(b.winRate)}</td><td class="numeric">${b.samples?percent(b.starRates[3]):'—'}</td><td class="numeric">${number(b.suboptimalChoices)} (${percent(b.suboptimalChoiceRate)})</td></tr>`).join('')}</tbody></table></div>
    <p class="muted">Tính trên những lần chơi thực sự đến mức hỗ trợ này. Mức 0% gồm cả lần chơi đầu. Giảm áp lực 30% không có nghĩa là tăng tỷ lệ thắng 30 điểm phần trăm; đây chưa phải so sánh bật/tắt hỗ trợ trên cùng bộ seed.</p>
    <div class="detail-body"><div><h3>Thắng ở lần chơi thứ mấy?</h3>${histogram(r.attemptsHistogram,'Số chuỗi thắng theo lần chơi')}
    <p class="muted">Trung bình tính trên ${number(r.completed)} chuỗi đã thắng; ${number(r.unfinished)} chuỗi còn lại dừng ở ${r.maxAttempts} lần.</p></div>
    <div><h3>Diễn biến từng lần chơi</h3><div class="table-wrap attempt-table"><table><thead><tr><th>Lần</th><th>Hỗ trợ</th><th>Đã chơi</th><th>Thắng</th><th>Tỷ lệ thắng</th><th>Nước kém tối ưu</th><th>Đã vượt màn¹</th></tr></thead><tbody>
    ${(r.byAttempt??[]).filter(b=>b.samples).map(b=>`<tr><th scope="row">${b.attempt}</th><td>${percent(b.assist)}</td><td class="numeric">${number(b.samples)}</td><td class="numeric">${number(b.wins)}</td><td class="numeric">${percent(b.winRate)}</td><td class="numeric">${number(b.suboptimalChoices)} (${percent(b.suboptimalChoiceRate)})</td><td class="numeric">${percent(b.cumulativeWinRate)}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted">¹ Tỷ lệ tích lũy trên toàn bộ ${number(r.samples)} chuỗi của map.</p></div></div></div></details>`;
  const profileValues=(entries,render,missing='—')=>entries.map(r=>`<div data-profile-value data-bot="${escape(r.bot)}" data-power="${escape(r.power)}"${r.bot===defaultBot&&r.power===defaultPower?'':' hidden'}>${render(r)}</div>`).join('')+
    `<div data-missing-value${entries.some(r=>r.bot===defaultBot&&r.power===defaultPower)?' hidden':''}>${missing}</div>`;
  const overviewRows=mapIds.map(id=>{
    const entries=profiles.filter(r=>r.id===id),m=maps.get(id),retry=retries.find(r=>r.id===id);
    const difficulty=m?.difficulty??entries[0]?.difficulty;
    const targetFor=r=>r.bot==='normal'&&r.power==='expected'?report.targets[r.difficulty]:null;
    const completed=retry?.completed??(retry?retry.samples-retry.unfinished:null);
    const support=assistLevels.map(assist=>{
      const b=retry?.byAssist?.find(b=>b.assist===assist);
      return `<span title="${escape(`${percent(assist)} hỗ trợ · ${number(b?.samples)} lần chơi · ${number(b?.wins)} thắng`)}">${b?.samples?percent(b.winRate):'—'}</span>`;
    }).join('');
    return `<tr data-overview data-map="${escape(id)}"><th scope="row"><a data-detail-link href="#map-${escape(id)}">Map ${escape(id)}</a><small>${escape(m?.name??`Màn ${id}`)}</small></th>
      <td>${escape(difficultyNames[difficulty]??difficulty??'—')}<small>${number(m?.moves)} lượt</small></td>
      <td class="numeric" data-field="samples">${profileValues(entries,r=>number(r.samples))}</td>
      <td class="numeric" data-field="win">${profileValues(entries,r=>percent(r.winRate))}</td>
      <td class="numeric" data-field="stars">${profileValues(entries,r=>`${percent(r.starRates[1])} / ${percent(r.starRates[2])}`)}</td>
      <td class="rate-cell" data-field="three">${profileValues(entries,r=>band(r.starRates[3],targetFor(r)?.three,checks.tolerance))}</td>
      <td class="numeric" data-field="retry">${retry?`<a data-detail-link href="#retry-${escape(id)}"><strong>${percent(completed/retry.samples)}</strong></a><small>${number(completed)} / ${number(retry.samples)} chuỗi</small>`:'<span class="muted">Chưa chạy</span>'}</td>
      <td class="numeric" data-field="retry-average">${number(completed?retry?.averageAttempts:null,2)}</td>
      <td class="support-cell" data-field="assist"><div class="assist-grid">${support}</div>${retry?.hasSpawnPressure===false?'<small class="no-pressure">Không có áp lực sinh ô</small>':''}</td>
      <td data-field="assessment">${profileValues(entries,r=>{const gate=gateFor(r);return badge(gate?(gate.passed?'Đạt':'Không đạt'):'Tham khảo',gate?(gate.passed?'good':'bad'):'neutral');},badge('Chưa chạy profile','quiet'))}</td></tr>`;
  }).join('');
  const mapDetails=mapIds.map(id=>{
    const entries=profiles.filter(r=>r.id===id),retry=retries.find(r=>r.id===id);
    return `<details class="profile-detail map-detail" id="map-${escape(id)}" data-map-detail data-map="${escape(id)}"><summary><span>${escape(mapLabel(id))}</span><span class="muted">${number(entries.length)} profile${retry?' · có retry':''}</span></summary>
      <div class="map-body"><h3>So sánh bot và sức mạnh</h3>${entries.length?`<div class="table-wrap"><table class="comparison-table"><thead><tr><th>Bot</th><th>Sức mạnh</th><th>Số mẫu</th><th>Thắng / mục tiêu</th><th>Thua</th><th>1 sao</th><th>2 sao</th><th>3 sao / mục tiêu</th><th>Lượt TB khi thắng</th><th>Nước kém tối ưu</th><th>Đánh giá</th></tr></thead><tbody>${entries.map(comparisonRow).join('')}</tbody></table></div>
      <h3 class="detail-heading">Phân bố lượt và diễn biến</h3>${entries.map(profileDetail).join('')}`:'<p class="muted">Chưa có dữ liệu lần chơi đầu cho map này.</p>'}
      <h3 class="detail-heading">Retry và hỗ trợ sau chuỗi thua</h3>${retry?retryDetail(retry):'<p class="muted">Chưa chạy retry cho map này.</p>'}</div></details>`;
  }).join('');
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Overview độ khó map · ${escape(run.id??report.contentVersion)}</title>
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
.overview-table{font-size:12px;--assist-count:${assistLevels.length}}.overview-table th,.overview-table td{padding:12px 10px}.overview-table .rate-cell{min-width:145px}.overview-table small{display:block;font-size:10px;color:var(--muted);font-weight:400}.overview-table [data-field="stars"]{font-variant-numeric:tabular-nums}.overview-table .support-cell{min-width:${assistLevels.length*52+20}px}.assist-grid{display:grid;grid-template-columns:repeat(var(--assist-count),minmax(42px,1fr));gap:6px;text-align:right;font-variant-numeric:tabular-nums}.assist-grid span{white-space:nowrap}.assist-labels{font-size:10px;margin-top:5px;color:var(--muted)}.overview-table .no-pressure{color:var(--amber);margin-top:4px}.missing-profile{color:var(--muted)}.map-body{padding:20px}.detail-heading{margin-top:24px}.map-body>.profile-detail{background:#f9fbfd}.comparison-table tr.is-selected>*{background:#e3f2ed}.profile-detail.is-selected>summary{border-left:3px solid var(--jade)}footer code{overflow-wrap:anywhere}
@media(max-width:720px){main{padding:22px 14px 36px}.header-top,.section-heading{align-items:start;flex-direction:column;gap:8px}.filters{position:static}.filters label{flex:1 1 calc(50% - 6px);min-width:0}.filters label:first-child{flex-basis:100%}.filters select{min-width:0;width:100%}.filters .filter-count{flex:1;width:auto;margin:auto 0;text-align:right}.detail-body{grid-template-columns:1fr;gap:20px}.summary-strip{gap:16px 24px}th,td{padding:10px}.retry-body{padding:14px}}@media print{.filters,button{display:none}body{background:#fff}main{padding:0}.table-wrap{overflow:visible}.profile-detail{break-inside:avoid}.command{white-space:pre-wrap}}
</style></head><body><main>
<header><div class="header-top"><span class="eyebrow">SWORD PUZZLE / BALANCE RUN / v${escape(report.contentVersion)}</span><button type="button" id="download-json">Tải dữ liệu JSON</button></div>
<h1>Tổng quan độ khó map</h1><div class="run-meta"><span><strong>${escape(time)}</strong> · UTC+7</span><span>Thời lượng <strong>${number(run.durationSeconds,1)} giây</strong></span><span>Seed suite <strong>${escape(report.suite)}</strong></span><span><strong>${number(report.seeds)}</strong> seed / profile</span>${source?`<span>Nguồn <strong>${escape(sourceLabel)}</strong> ${badge('v'+source.version,sourceKind)}</span><span>Project <strong>${escape(source.project)}</strong></span><span>Đồng bộ <strong>${escape(formatTime(source.syncedAt))}</strong></span><span>Kiểm tra version <strong>${escape(formatTime(source.checkedAt))}</strong></span>`:''}</div>
<div class="summary-strip"><div><span>Map đã chọn</span><strong>${number(mapIds.length)}</strong></div><div><span>Lượt chơi đầu</span><strong>${number(firstSamples)}</strong></div><div><span>Chuỗi retry</span><strong>${number(retrySamples)}</strong></div><div><span>Lần chơi trong các chuỗi</span><strong>${number(retryAttempts)}</strong></div><div><span>Kết quả kiểm tra</span>${badge(statusText,statusKind)}</div></div>
<div class="command">${escape(run.command??'')}</div></header>
${run.error?`<div class="error-panel"><strong>Lần chạy bị gián đoạn</strong><p>${escape(run.error)}</p><p class="muted">Các bảng dưới đây chứa những profile đã hoàn tất trước khi lỗi xảy ra.</p></div>`:''}
${checks.failures.length?`<div class="error-panel"><strong>${checks.enabled?'Các kiểm tra không đạt':'Các kết quả cần xem lại'}</strong><ul class="failure-list">${checks.failures.map(f=>`<li>${escape(f)}</li>`).join('')}</ul></div>`:''}
<form class="filters" id="filters"><label>Map<select id="filter-map">${options(mapIds.map(id=>[id,mapLabel(id)]),'Tất cả map')}</select></label>
<label>Bot<select id="filter-bot"${profiles.length?'':' disabled'}>${options([...new Set(profiles.length?profiles.map(r=>r.bot):[defaultBot])].map(b=>[b,b]),null,defaultBot)}</select></label>
<label>Sức mạnh<select id="filter-power"${profiles.length?'':' disabled'}>${options([...new Set(profiles.length?profiles.map(r=>r.power):[defaultPower])].map(p=>[p,powerNames[p]??p]),null,defaultPower)}</select></label>
<button type="reset">Đặt lại bộ lọc</button><span class="muted filter-count" id="filter-count" aria-live="polite"></span></form>
<section><div class="section-heading"><h2>Overview · mỗi map một dòng</h2><p id="overview-selection" aria-live="polite"></p></div>
<div class="panel"><div class="table-wrap"><table id="overview-table" class="overview-table"><thead><tr><th>Map</th><th>Độ khó / Lượt</th><th>Số mẫu</th><th>Thắng / mục tiêu</th><th>1 sao / 2 sao</th><th>3 sao / mục tiêu</th><th>Retry vượt màn<small>Trong ≤30 lần</small></th><th>Lần TB<small>Khi retry thắng</small></th><th>Thắng theo mức hỗ trợ<div class="assist-grid assist-labels">${assistLevels.map(level=>`<span>${number(level*100)}%</span>`).join('')}</div></th><th>Đánh giá</th></tr></thead><tbody>${overviewRows}</tbody></table></div><p class="empty" id="overview-empty"${mapIds.length?' hidden':''}>Chưa có map trong report.</p></div>
<div class="legend"><span><i></i>Khoảng mục tiêu</span><span><i class="tolerance"></i>Khoảng kiểm tra sau dung sai</span><span><i class="marker"></i>Kết quả thực tế</span></div>
<p class="muted">Thắng và sao là kết quả lần chơi đầu của bot / sức mạnh đang chọn; tỷ lệ sao tính trên toàn bộ lượt chơi. Retry luôn dùng normal / dự kiến. Tỷ lệ theo mức hỗ trợ tính trên các lần chơi đã đến mức đó; mức chưa có mẫu hiển thị “—”. Bấm tên map để xem chi tiết.</p>
<p class="muted">Khoảng mục tiêu áp dụng cho normal / sức mạnh dự kiến. Dung sai kiểm tra: ${number(checks.tolerance*100)} điểm phần trăm${checks.tolerance?' do mẫu dưới 1.000 seed':''}. Strategic / dự kiến được đối chiếu với basic cùng sức mạnh khi có dữ liệu; các profile khác dùng để tham khảo.</p>
${!retries.length?'<p class="notice"><strong>Chưa chạy retry.</strong> Thêm <code>--retry-seeds 100</code> hoặc chạy <code>npm run maps:release</code> để quan sát hỗ trợ sau chuỗi thua.</p>':''}
</section>
${report.assistReports?.length?`<section id="paired-assist"><div class="section-heading"><h2>Assist trên cùng bộ seed</h2><p>Normal / dự kiến · ${number(report.assistReports[0].rates[0].samples)} seed mỗi mức</p></div><div class="panel table-wrap"><table><thead><tr><th>Map</th><th>Không assist</th><th>10%</th><th>20%</th><th>30%</th><th>Gate</th></tr></thead><tbody>${report.assistReports.map(r=>`<tr><th>${escape(r.id)}</th>${r.rates.map(rate=>`<td>${percent(rate.winRate)}</td>`).join('')}<td>${badge(r.passed?'Đạt':'Không đạt',r.passed?'good':'bad')}</td></tr>`).join('')}</tbody></table></div></section>`:''}
<section><div class="section-heading"><h2>Chi tiết từng map</h2><p>Mở map để so sánh tất cả bot, sức mạnh và retry.</p></div>${mapDetails}</section>
<section><div class="section-heading"><h2>Khoảng mục tiêu độ khó</h2><p>Tỷ lệ thắng là số liệu tham khảo; kiểm tra cân bằng dựa trên tỷ lệ 3 sao.</p></div><div class="panel target-table"><table><thead><tr><th>Độ khó</th><th>Thắng (tham khảo)</th><th>3 sao (điều kiện)</th></tr></thead><tbody>${Object.entries(report.targets).map(([name,t])=>`<tr><th scope="row">${escape(difficultyNames[name]??name)}</th><td>${percent(t.win[0])}–${percent(t.win[1])}</td><td>${percent(t.three[0])}–${percent(t.three[1])}</td></tr>`).join('')}</tbody></table></div></section>
<footer><p>Report tự chứa, xem được offline. Bot dùng engine thật với loadout trống${botModel?` (mô hình v${escape(botModel.version)}; chọn nước kém tối ưu basic / normal / strategic: ${Object.values(botModel.mistakeRates).map(rate=>percent(rate)).join(' / ')}; mỗi lần chọn sai rút đều tối đa ${number(botModel.mistakeCandidateLimit)} nước điểm thấp hơn gần nhất)`:''}. Thống kê mô phỏng dùng để đối chiếu cân bằng map.</p>${source?`<p>Nguồn dữ liệu: ${escape(sourceLabel)} · project <code>${escape(source.project)}</code> · content v${escape(source.version)} · snapshot <code>${escape(source.hashes?.snapshot??'—')}</code>${source.cacheFile?` · cache <code>${escape(source.cacheFile)}</code>`:''}</p>`:''}<p>Run ${escape(run.id??'—')} · Config hash <code>${escape(report.configHash??'—')}</code></p></footer>
</main><script id="report-data" type="application/json">${serialize}</script>
<script>
const mapFilter=document.getElementById('filter-map'),botFilter=document.getElementById('filter-bot'),powerFilter=document.getElementById('filter-power');
function applyFilters(){
  let visible=0,withData=0;
  const selected=el=>el.dataset.bot===botFilter.value&&el.dataset.power===powerFilter.value;
  const rows=document.querySelectorAll('[data-overview]');
  rows.forEach(row=>{
    row.hidden=!!(mapFilter.value&&row.dataset.map!==mapFilter.value);
    let hasData=false;
    row.querySelectorAll('[data-profile-value]').forEach(value=>{value.hidden=!selected(value);if(!value.hidden)hasData=true;});
    row.querySelectorAll('[data-missing-value]').forEach(value=>{value.hidden=hasData;});
    row.classList.toggle('missing-profile',!hasData);
    if(!row.hidden){visible++;if(hasData)withData++;}
  });
  document.querySelectorAll('[data-map-detail]').forEach(el=>{el.hidden=!!(mapFilter.value&&el.dataset.map!==mapFilter.value);});
  document.querySelectorAll('[data-profile]').forEach(el=>el.classList.toggle('is-selected',selected(el)));
  document.getElementById('overview-empty').hidden=visible>0;
  document.getElementById('filter-count').textContent=visible+' / '+rows.length+' map';
  document.getElementById('overview-selection').textContent=botFilter.value+' / '+(powerFilter.selectedOptions[0]?.textContent||powerFilter.value)+' · '+withData+' / '+visible+' map có dữ liệu';
}
document.getElementById('filters').addEventListener('change',applyFilters);
document.getElementById('filters').addEventListener('submit',event=>event.preventDefault());
document.getElementById('filters').addEventListener('reset',()=>setTimeout(applyFilters,0));
document.getElementById('download-json').addEventListener('click',()=>{const data=document.getElementById('report-data').textContent;const report=JSON.parse(data);const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='maps-'+(report.run?.id||'report')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
applyFilters();
document.querySelectorAll('[data-detail-link]').forEach(link=>link.addEventListener('click',()=>{for(let detail=document.getElementById(link.getAttribute('href').slice(1));detail;detail=detail.parentElement){if(detail.tagName==='DETAILS')detail.open=true;}}));
</script></body></html>`;
}

function renderReportFile(input,output) {
  const fs=require('node:fs'),path=require('node:path');
  const inputPath=path.resolve(input);
  const outputPath=path.resolve(output??path.join(path.dirname(inputPath),path.basename(inputPath,path.extname(inputPath))+'.overview.html'));
  if(inputPath===outputPath)throw new Error('Input JSON and output HTML must point to different files');
  const report=JSON.parse(fs.readFileSync(inputPath,'utf8'));
  if(!Array.isArray(report.reports)||!report.targets)throw new Error('Input must be a map simulation JSON report');
  const html=renderBalanceReport(report);
  fs.mkdirSync(path.dirname(outputPath),{recursive:true});fs.writeFileSync(outputPath,html);
  return outputPath;
}

if(require.main===module) {
  try {
    const args=process.argv.slice(2),options={};
    for(let i=0;i<args.length;i++) {
      if(!['--input','--output'].includes(args[i]))throw new Error(`Unknown option: ${args[i]}`);
      if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Missing value for ${args[i]}`);
      options[args[i]]=args[++i];
    }
    if(!options['--input'])throw new Error('Usage: node tools/render_balance_report.cjs --input report.json [--output overview.html]');
    console.log(`HTML report: ${renderReportFile(options['--input'],options['--output'])}`);
  } catch(error) { console.error(error.message);process.exitCode=1; }
}

module.exports={renderBalanceReport,renderReportFile};
