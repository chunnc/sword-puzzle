const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {JSDOM}=require(require.resolve('jsdom',{paths:[path.resolve(__dirname,'../client')]}));
const {simulateRetries,evaluateChecks,parseOptions,catalog,targets,seedFor}=require('./simulate_maps.cjs');
const {renderBalanceReport}=require('./render_balance_report.cjs');

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
  assert.equal(easy.hasSpawnPressure,false);
  assert.equal(easy.byAssist[1].samples,0);
  assert.equal(easy.byAssist[1].winRate,null);
  const lost=simulateRetries(catalog[9],2,()=>({won:false,stars:0}));
  assert.equal(lost.averageAttempts,null);
  assert.equal(lost.totalAttempts,60);
  assert.equal(lost.unfinished,2);
  assert.equal(lost.byAttempt[29].cumulativeWinRate,0);
});

function profile(id=1,bot='normal',power='expected') {
  return {id,bot,power,difficulty:catalog[id-1].difficulty,samples:1000,winRate:.8,starRates:[.2,.2,.28,.32],
    movesHistogram:{10:320,12:280,14:200},averageMoves:11.7,averageProgress:.9,averageFailedProgress:.5,
    averageWaves:20,averageReshuffles:0,maxChain:8,mapHash:'test-map-hash'};
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
  assert.equal(evaluateChecks([basic,{...strategic,winRate:.7}],100,true).status,'passed');
});

test('CLI rejects malformed sample counts and selections before simulations start',()=>{
  for(const args of [['--seeds','0'],['--seeds','NaN'],['--retry-seeds','-1'],['--maps','41'],['--maps',''],['--bots','expert'],['--powers',''],['--suite','typo'],['--output'],['--unknown']]) {
    assert.throws(()=>parseOptions(args));
  }
  const options=parseOptions(['--maps','1,3,1','--retry-seeds','100','--powers','minimum,expected,strong','--check']);
  assert.deepEqual(options.ids,[1,3]);
  assert.equal(options.check,true);
  assert.equal(options.retryCount,100);
});

function fixture() {
  const reports=[profile(),profile(3,'basic','strong')];
  return {contentVersion:4,suite:'validation',seeds:1000,targets,reports,
    retries:[simulateRetries(catalog[0],2,()=>({won:true,stars:3}))],checks:evaluateChecks(reports,1000,true),
    run:{id:'test-run',startedAt:'2026-10-10T08:00:00Z',durationSeconds:1.25,command:'node tools/simulate_maps.cjs',maps:[1,3],status:'completed'},
    maps:[catalog[0],catalog[2]],configHash:'test-config-hash'};
}

test('standalone HTML filters profiles, retains map-only retry filtering, opens details and resets',async t=>{
  const report=fixture(),html=renderBalanceReport(report);
  const dom=new JSDOM(html,{runScripts:'dangerously'}),{document,Event}=dom.window;
  t.after(()=>dom.window.close());
  assert.deepEqual(JSON.parse(document.getElementById('report-data').textContent),report);
  assert.equal(document.querySelectorAll('script[src],link[rel="stylesheet"]').length,0);
  assert.equal(document.getElementById('filter-count').textContent,'2 / 2 profile');
  const map=document.getElementById('filter-map'),bot=document.getElementById('filter-bot'),power=document.getElementById('filter-power');
  power.value='strong';power.dispatchEvent(new Event('change',{bubbles:true}));
  assert.equal(document.getElementById('filter-count').textContent,'1 / 2 profile');
  map.value='1';map.dispatchEvent(new Event('change',{bubbles:true}));
  assert.equal(document.getElementById('filter-count').textContent,'0 / 2 profile');
  assert.equal(document.querySelector('#profiles-table').closest('[data-filter-group]').querySelector('[data-empty]').hidden,false);
  assert.equal(document.querySelector('tr[data-retry]').hidden,false);
  bot.value='basic';bot.dispatchEvent(new Event('change',{bubbles:true}));
  assert.equal(document.querySelector('tr[data-retry]').hidden,false);
  document.getElementById('filters').reset();
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(document.getElementById('filter-count').textContent,'2 / 2 profile');
  document.querySelector('#profiles-table a').click();
  assert.equal(document.getElementById('profile-1-normal-expected').open,true);
  document.querySelector('a[href="#retry-1"]').click();
  assert.equal(document.getElementById('retry-1').open,true);
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

test('CLI exports HTML and JSON even when a check fails, preserving default HTML history',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'balance-report-test-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const jsonPath=path.join(directory,'result.json');
  const args=[path.join(__dirname,'simulate_maps.cjs'),'--maps','1','--bots','normal','--seeds','1','--retry-seeds','2','--check','--output',jsonPath];
  for(let i=0;i<2;i++) {
    const child=spawnSync(process.execPath,args,{encoding:'utf8'});
    assert.equal(child.status,1,child.stderr);
    assert.match(child.stdout,/HTML report:/);
    assert.match(child.stderr,/ngoài khoảng kiểm tra/);
    const report=JSON.parse(fs.readFileSync(jsonPath,'utf8'));
    assert.equal(report.checks.status,'failed');
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
