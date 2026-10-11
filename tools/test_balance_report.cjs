const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {JSDOM}=require(require.resolve('jsdom',{paths:[path.resolve(__dirname,'../client')]}));
const {play,simulateRetries,evaluateChecks,parseOptions,catalog,targets,seedFor,simulateRetryChunk,mergeRetryChunks,finalizeRetries,spawnAssistMechanisms}=require('./simulate_maps.cjs');
const {mapStars}=require('./game-runtime.cjs');
const {renderBalanceReport,renderReportFile}=require('./render_balance_report.cjs');
const {resolveSnapshot}=require('./sync_content_cache.cjs');
const config=require('../content/game-config.json');
const rawMaps=require('../content/game-maps.json');

async function seedCache(directory,project='demo-cache') {
  return resolveSnapshot({project,cacheDir:directory,readers:{
    readConfig:async()=>({contentVersion:config.version,minClientVersion:'1.4.0'}),
    readContent:async()=>config,
    readMaps:async()=>rawMaps
  }});
}

test('retry aggregation stops at the first win and accounts for each support boundary and censored sequence',()=>{
  let sequence=0,attempt=0;
  const winAt=[4,6,Infinity],seen=[];
  const result=simulateRetries(catalog[2],3,(_map,seed,bot,power,assist)=>{
    attempt++;seen.push({seed,bot,power,assist});
    const won=attempt===winAt[sequence],stars=won?(sequence===0?3:2):0;
    if(won||attempt===30){sequence++;attempt=0;}
    return {won,stars};
  });
  assert.equal(result.completed,2);
  assert.equal(result.unfinished,1);
  assert.equal(result.averageAttempts,5);
  assert.equal(result.totalAttempts,40);
  assert.deepEqual(result.attemptsHistogram,{'4':1,'6':1});
  assert.deepEqual(result.byAssist.map(r=>[r.assist,r.samples,r.wins,r.losses]),[[0,9,0,9],[.1,5,1,4],[.2,3,1,2],[.3,23,0,23]]);
  assert.equal(result.byAssist[1].winRate,1/5);
  assert.equal(result.byAssist[1].starRates[3],1/5);
  assert.equal(result.byAssist[2].starRates[2],1/3);
  assert.equal(result.byAttempt[3].samples,3);
  assert.equal(result.byAttempt[3].assist,.1);
  assert.equal(result.byAttempt[3].cumulativeWinRate,1/3);
  assert.equal(result.byAttempt[5].samples,2);
  assert.equal(result.byAttempt[5].assist,.2);
  assert.equal(result.byAttempt[6].assist,.2);
  assert.equal(result.byAttempt[7].assist,.3);
  assert.equal(result.byAttempt[29].cumulativeWinRate,2/3);
  assert.deepEqual(seen[0],{seed:seedFor(0,'retry'),bot:'normal',power:'expected',assist:0});
  assert.equal(seen[4].seed,seedFor(31,'retry'));
  assert.equal(result.hasSpawnPressure,true);
});

test('retry handles unused support tiers and sequences with no wins without misleading averages',()=>{
  const easy=simulateRetries(catalog[0],2,()=>({won:true,stars:1}));
  assert.equal(easy.averageAttempts,1);
  assert.equal(easy.totalAttempts,2);
  assert.equal(easy.hasSpawnPressure,true);
  assert.equal(easy.byAssist[1].samples,0);
  assert.equal(easy.byAssist[1].winRate,null);
  const lost=simulateRetries(catalog[9],2,()=>({won:false,stars:0}));
  assert.equal(lost.averageAttempts,null);
  assert.equal(lost.totalAttempts,60);
  assert.equal(lost.unfinished,2);
  assert.equal(lost.byAttempt[29].cumulativeWinRate,0);
});

test('retry chunks merge into the same aggregate as the sequential path',()=>{
  const fake=(_map,seed,_bot,_power,assist)=>((seed+Math.round(assist*100))%7<2?{won:false,stars:0}:{won:true,stars:(seed%3)+1});
  const map=catalog[4];
  const sequential=simulateRetries(map,12,fake);
  const merged=finalizeRetries(map,12,mergeRetryChunks([simulateRetryChunk(map,0,5,fake),simulateRetryChunk(map,5,7,fake)]));
  assert.deepEqual(merged,sequential);
});
test('assist mechanisms reflect real objectives, obstacles and versioned spawn help',()=>{
  assert.deepEqual(spawnAssistMechanisms(catalog[4]),['directMatch','preparedCombo']);
  assert.deepEqual(spawnAssistMechanisms({...catalog[4],contentVersion:5}),[]);
  assert.deepEqual(spawnAssistMechanisms(catalog[10]),[]);
  assert.ok(spawnAssistMechanisms(catalog[7]).includes('obstacleCandidates'));
});

function profile(id=1,bot='normal',power='expected') {
  return {id,bot,power,difficulty:catalog[id-1].difficulty,samples:1000,winRate:.8,starRates:[.2,.2,.28,.32],
    movesHistogram:{10:320,12:280,14:200},averageMoves:11.7,averageProgress:.9,averageFailedProgress:.5,
    averageWaves:20,averageReshuffles:0,maxChain:4,mapHash:'test-map-hash'};
}

test('check assessment retains small-sample tolerance, strict star coverage and strategic comparison',()=>{
  const r=profile();
  assert.equal(evaluateChecks([r],100,true).status,'passed');
  const strict=evaluateChecks([r],1000,true);
  assert.equal(strict.status,'failed');
  assert.equal(strict.failures.length,2);
  const missingStars={...r,winRate:.9,starRates:[.1,0,.5,.4]};
  assert.match(evaluateChecks([missingStars],1000,true).failures[0],/1–2–3/);
  assert.equal(evaluateChecks([r],100,false).status,'not-run');
  assert.equal(evaluateChecks([profile(1,'basic')],100,true).status,'not-applicable');
  const basic={...profile(1,'basic'),winRate:.8},strategic={...profile(1,'strategic'),winRate:.69};
  assert.equal(evaluateChecks([basic,strategic],100,true).status,'failed');
  assert.equal(evaluateChecks([basic,{...strategic,winRate:.7}],100,true).status,'failed');
  assert.equal(evaluateChecks([basic,{...strategic,winRate:.8}],100,true).status,'passed');
});

test('CLI rejects malformed sample counts and selections before simulations start',()=>{
  for(const args of [['--seeds','0'],['--seeds','NaN'],['--retry-seeds','-1'],['--jobs','0'],['--jobs','-1'],['--jobs','abc'],['--jobs'],['--maps','41'],['--maps',''],['--bots','expert'],['--powers',''],['--suite','typo'],['--output'],['--project'],['--unknown']]) {
    assert.throws(()=>parseOptions(args));
  }
  const options=parseOptions(['--maps','1,3,1','--retry-seeds','100','--powers','minimum,expected,strong','--check','--offline','--project','demo','--jobs','3']);
  assert.deepEqual(options.ids,[1,3]);
  assert.equal(options.check,true);
  assert.equal(options.retryCount,100);
  assert.equal(options.offline,true);
  assert.equal(options.project,'demo');
  assert.equal(options.jobs,3);
  assert.ok(parseOptions([]).jobs>=1);
  assert.equal(parseOptions([]).source,'server');
  assert.equal(parseOptions(['--source','local','--assist-seeds','2000']).assistCount,2000);
  for(const args of [['--source','invalid'],['--assist-seeds','-1'],['--source','local','--offline']])assert.throws(()=>parseOptions(args));
});
test('v6 overview exposes paired assistance separately from retry survivor buckets',()=>{
  const report=fixture();report.assistReports=[{id:5,rates:[0,.1,.2,.3].map((assist,i)=>({assist,samples:2000,winRate:.2+i*.1})),passed:true}];
  const dom=new JSDOM(renderBalanceReport(report));
  const section=dom.window.document.getElementById('paired-assist');
  assert.match(section.textContent,/2\.000 seed/);assert.match(section.textContent,/50,0%/);
  dom.window.close();
});
test('simulator uses the shared percent star thresholds and the report explains strict cutoffs',()=>{
  const map={...catalog[0],starThresholds:{mode:'percentage',threeStarBelowPercent:50,twoStarBelowPercent:75}};
  const run=play(map,seedFor(0),'normal','expected');
  assert.equal(run.stars,run.won?mapStars(map,run.movesUsed):0);
  const report=fixture();report.maps=[map];
  const html=renderBalanceReport(report);
  assert.match(html,/3 sao &lt; 50% \(tối đa 3\)/);
  assert.match(html,/2 sao &lt; 75% \(tối đa 5\)/);
});

function fixture() {
  const reports=[profile(),profile(3,'basic','strong'),
    {...profile(1,'basic'),winRate:.2,starRates:[.8,.05,.1,.05],movesHistogram:{10:50,12:100,14:50}},
    {...profile(1,'normal','strong'),winRate:.95,starRates:[.05,.05,.1,.8],movesHistogram:{10:800,12:100,14:50}}];
  return {contentVersion:4,suite:'validation',seeds:1000,targets,reports,
    retries:[simulateRetries(catalog[0],2,()=>({won:true,stars:3}))],checks:evaluateChecks(reports,1000,true),
    run:{id:'test-run',startedAt:'2026-10-10T08:00:00Z',durationSeconds:1.25,command:'node tools/simulate_maps.cjs',maps:[1,3],status:'completed'},
    source:{kind:'cache',project:'sword-puzzle',version:4,syncedAt:'2026-10-10T07:00:00Z',checkedAt:'2026-10-10T08:00:00Z',
      cacheFile:'.balance-reports/content-cache/sword-puzzle/v4.json',hashes:{config:'test-config-hash',maps:{1:'test-map-hash'},snapshot:'test-snapshot-hash'}},
    maps:[catalog[0],catalog[2]],configHash:'test-config-hash'};
}

test('overview keeps one row per map while changing profile values, retaining retries, opening details and resetting',async t=>{
  const report=fixture(),html=renderBalanceReport(report);
  const dom=new JSDOM(html,{runScripts:'dangerously'}),{document,Event}=dom.window;
  t.after(()=>dom.window.close());
  assert.deepEqual(JSON.parse(document.getElementById('report-data').textContent),report);
  assert.equal(document.querySelectorAll('script[src],link[rel="stylesheet"]').length,0);
  assert.match(document.body.textContent,/sword-puzzle/);
  assert.match(document.body.textContent,/Cache local/);
  assert.match(document.body.textContent,/test-snapshot-hash/);
  const map=document.getElementById('filter-map'),bot=document.getElementById('filter-bot'),power=document.getElementById('filter-power');
  const rows=()=>document.querySelectorAll('#overview-table tbody tr');
  const row=id=>document.querySelector(`[data-overview][data-map="${id}"]`);
  const value=(id,field)=>[...row(id).querySelector(`[data-field="${field}"]`).children].find(el=>!el.hidden)?.textContent;
  assert.equal(rows().length,2);
  assert.equal(document.getElementById('filter-count').textContent,'2 / 2 map');
  assert.equal(bot.value,'normal');
  assert.equal(power.value,'expected');
  assert.match(value(1,'win'),/80,0%/);
  assert.equal(value(3,'win'),'—');
  assert.match(document.getElementById('overview-selection').textContent,/1 \/ 2 map có dữ liệu/);
  assert.equal(document.querySelectorAll('[data-map-detail][open]').length,0);
  assert.match(row(1).querySelector('[data-field="retry"]').textContent,/100,0%/);
  assert.deepEqual([...row(1).querySelectorAll('[data-field="assist"] .assist-grid span')].map(el=>el.textContent),['100,0%','—','—','—']);
  power.value='strong';power.dispatchEvent(new Event('change',{bubbles:true}));
  assert.equal(rows().length,2);
  assert.equal(document.getElementById('filter-count').textContent,'2 / 2 map');
  assert.match(value(1,'win'),/95,0%/);
  map.value='1';map.dispatchEvent(new Event('change',{bubbles:true}));
  assert.equal(document.getElementById('filter-count').textContent,'1 / 2 map');
  assert.equal(row(1).hidden,false);
  assert.equal(row(3).hidden,true);
  assert.equal(document.getElementById('map-3').hidden,true);
  bot.value='basic';bot.dispatchEvent(new Event('change',{bubbles:true}));
  assert.equal(row(1).hidden,false);
  assert.equal(value(1,'win'),'—');
  assert.match(value(1,'assessment'),/Chưa chạy profile/);
  assert.equal(document.getElementById('overview-empty').hidden,true);
  assert.match(row(1).querySelector('[data-field="retry"]').textContent,/100,0%/);
  power.value='expected';power.dispatchEvent(new Event('change',{bubbles:true}));
  assert.match(value(1,'win'),/20,0%/);
  document.getElementById('filters').reset();
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(document.getElementById('filter-count').textContent,'2 / 2 map');
  assert.equal(bot.value,'normal');
  assert.equal(power.value,'expected');
  assert.match(value(1,'win'),/80,0%/);
  document.querySelector('#overview-table a').click();
  assert.equal(document.getElementById('map-1').open,true);
  assert.equal(document.querySelectorAll('#map-1 .comparison-table tbody tr').length,3);
  document.getElementById('map-1').open=false;
  document.querySelector('.comparison-table a[href="#profile-1-basic-expected"]').click();
  assert.equal(document.getElementById('map-1').open,true);
  assert.equal(document.getElementById('profile-1-basic-expected').open,true);
  document.getElementById('map-1').open=false;
  document.querySelector('a[href="#retry-1"]').click();
  assert.equal(document.getElementById('map-1').open,true);
  assert.equal(document.getElementById('retry-1').open,true);
});

test('overview handles an unplayed map, nonstandard assist levels and a report without the default profile',t=>{
  const report=fixture();
  report.reports=[profile(3,'basic','strong')];
  report.run.maps.push(10);report.maps.push(catalog[9]);
  report.retries=[{...simulateRetries(catalog[9],2,()=>({won:false,stars:0})),
    byAssist:[{assist:0,samples:2,wins:0,losses:2,winRate:0,starRates:[1,0,0,0]},
      {assist:.15,samples:2,wins:0,losses:2,winRate:0,starRates:[1,0,0,0]}]}];
  const dom=new JSDOM(renderBalanceReport(report),{runScripts:'dangerously'}),{document}=dom.window;
  t.after(()=>dom.window.close());
  assert.equal(document.querySelectorAll('#overview-table tbody tr').length,3);
  assert.equal(document.getElementById('filter-bot').value,'basic');
  assert.equal(document.getElementById('filter-power').value,'strong');
  const row=document.querySelector('[data-overview][data-map="10"]');
  assert.equal(row.querySelector('[data-field="win"] [data-missing-value]').hidden,false);
  assert.match(row.querySelector('[data-field="retry"]').textContent,/0,0%/);
  assert.equal(row.querySelector('[data-field="retry-average"]').textContent,'—');
  assert.match(document.querySelector('.assist-labels').textContent,/15%/);
  const emptyReport={...report,reports:[],retries:[]};
  const emptyDom=new JSDOM(renderBalanceReport(emptyReport),{runScripts:'dangerously'});
  t.after(()=>emptyDom.window.close());
  assert.equal(emptyDom.window.document.querySelectorAll('#overview-table tbody tr').length,3);
  assert.equal(emptyDom.window.document.getElementById('filter-bot').disabled,true);
  assert.match(emptyDom.window.document.getElementById('overview-selection').textContent,/0 \/ 3 map có dữ liệu/);
});

test('HTML safely embeds run text and raw JSON and explains missing retry/error results',t=>{
  const report=fixture();
  report.run.command='</script><img src=x onerror="window.injection=true">';
  report.run.status='error';report.run.error='<script>window.injection=true</script>';
  report.retries=[];
  const dom=new JSDOM(renderBalanceReport(report),{runScripts:'dangerously'}),{document}=dom.window;
  t.after(()=>dom.window.close());
  assert.equal(dom.window.injection,undefined);
  assert.equal(document.querySelectorAll('img').length,0);
  assert.deepEqual(JSON.parse(document.getElementById('report-data').textContent),report);
  assert.match(document.body.textContent,/Chưa chạy retry/);
  assert.match(document.body.textContent,/Lần chạy bị gián đoạn/);
  assert.match(document.body.textContent,/Không đạt|Lần chạy bị gián đoạn/);
});

test('CLI exports HTML and JSON even when a check fails, preserving default HTML history',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'balance-report-test-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  await seedCache(directory);
  const jsonPath=path.join(directory,'result.json');
  const args=[path.join(__dirname,'simulate_maps.cjs'),'--maps','1','--bots','normal','--seeds','1','--retry-seeds','2','--check','--offline','--project','demo-cache','--output',jsonPath];
  for(let i=0;i<2;i++) {
    const child=spawnSync(process.execPath,args,{encoding:'utf8',env:{...process.env,BALANCE_CACHE_DIR:directory}});
    assert.equal(child.status,1,child.stderr);
    assert.match(child.stdout,/HTML report:/);
    assert.match(child.stdout,/local cache/);
    assert.match(child.stderr,/ngoài khoảng kiểm tra/);
    const report=JSON.parse(fs.readFileSync(jsonPath,'utf8'));
    assert.equal(report.checks.status,'failed');
    assert.equal(report.source.kind,'cache');
    assert.equal(report.source.project,'demo-cache');
    assert.equal(report.source.version,config.version);
    assert.match(report.source.hashes.snapshot,/^[0-9a-f]{64}$/);
    assert.equal(report.retries[0].samples,2);
    assert.equal(report.reports[0].samples,1);
  }
  const files=fs.readdirSync(directory).filter(name=>name.endsWith('.html'));
  assert.equal(files.length,2);
  const dom=new JSDOM(fs.readFileSync(path.join(directory,files[0]),'utf8'));
  t.after(()=>dom.window.close());
  assert.match(dom.window.document.body.textContent,/Không đạt kiểm tra/);
  assert.equal(JSON.parse(dom.window.document.getElementById('report-data').textContent).checks.status,'failed');
});

test('parallel workers produce the same report as a sequential run',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'balance-parallel-test-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  await seedCache(directory);
  const run=jobs=>{
    const jsonPath=path.join(directory,`jobs-${jobs}.json`);
    const args=[path.join(__dirname,'simulate_maps.cjs'),'--maps','1,10','--bots','basic,normal','--powers','expected','--seeds','3','--retry-seeds','2','--jobs',String(jobs),'--offline','--project','demo-cache','--output',jsonPath];
    const child=spawnSync(process.execPath,args,{encoding:'utf8',env:{...process.env,BALANCE_CACHE_DIR:directory}});
    assert.equal(child.status,0,child.stderr);
    return JSON.parse(fs.readFileSync(jsonPath,'utf8'));
  };
  const sequential=run(1),parallel=run(4);
  assert.equal(sequential.run.jobs,1);
  assert.equal(parallel.run.jobs,4);
  assert.deepEqual(parallel.reports,sequential.reports);
  assert.deepEqual(parallel.retries,sequential.retries);
  assert.deepEqual(parallel.checks,sequential.checks);
  assert.deepEqual(parallel.maps,sequential.maps);
});

test('renderer CLI rebuilds a one-row-per-map overview from saved JSON without altering its source',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'balance-overview-test-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const input=path.join(directory,'report.json'),source=JSON.stringify(fixture());
  fs.writeFileSync(input,source);
  const child=spawnSync(process.execPath,[path.join(__dirname,'render_balance_report.cjs'),'--input',input],{encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);
  const output=path.join(directory,'report.overview.html');
  assert.ok(child.stdout.includes(output));
  assert.equal(fs.readFileSync(input,'utf8'),source);
  const dom=new JSDOM(fs.readFileSync(output,'utf8'),{runScripts:'dangerously'});
  t.after(()=>dom.window.close());
  assert.equal(dom.window.document.querySelectorAll('#overview-table tbody tr').length,2);
  assert.deepEqual(JSON.parse(dom.window.document.getElementById('report-data').textContent),JSON.parse(source));
  assert.throws(()=>renderReportFile(input,input),/different files/);
  const invalid=spawnSync(process.execPath,[path.join(__dirname,'render_balance_report.cjs'),'--input'],{encoding:'utf8'});
  assert.equal(invalid.status,1);
  assert.match(invalid.stderr,/Missing value/);
});
