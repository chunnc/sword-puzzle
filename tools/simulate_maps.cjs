const fs = require('node:fs');
const path = require('node:path');
const { BoardEngine, installContent, validateMap, mapToLevel, mapStars, tileId, assistForFailures } = require('./game-runtime.cjs');
const {createHash}=require('node:crypto');
const { renderBalanceReport } = require('./render_balance_report.cjs');
const { resolveSnapshot, defaultProject } = require('./sync_content_cache.cjs');
let content = installContent(require('../content/game-config.json'));
let catalog = require('../content/game-maps.json').map(m => validateMap(m, content));
function rng(seed) { let state = seed >>> 0 || 1; return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; }; }
function seedFor(index, suite = 'validation') { return ((index+1)*2654435761 + (suite === 'training' ? 104729 : 13007)) >>> 0 || 1; }
function matched(snapshot, move) {
  const { width:w, height:h } = snapshot.level.board, tiles = snapshot.tiles.slice();
  const a = move[1]*w+move[0], b = move[3]*w+move[2];
  [tiles[a],tiles[b]] = [tiles[b],tiles[a]];
  const result = new Set(), rock = tileId('rock', content);
  for (const [start,step,len] of [...Array.from({length:h},(_,y)=>[y*w,1,w]), ...Array.from({length:w},(_,x)=>[x,w,h])]) {
    for (let i=0;i<len;) {
      const t = tiles[start+i*step]; let end=i+1;
      while (end<len && t && t.kind!==rock && tiles[start+end*step]?.kind===t.kind) end++;
      if (t && t.kind!==rock && end-i>=3) for(let n=i;n<end;n++) result.add(start+n*step);
      i=end;
    }
  }
  return { tiles, cells:[...result] };
}
function clearValue(snapshot, cells, tiles=snapshot.tiles) {
  const { width:w,height:h } = snapshot.level.board;
  let value=0;
  for(const i of cells) {
    const tile=tiles[i]; if(!tile)continue;
    value += .08 + (tile.chargeTier ? tile.chargeTier*.25 : 0);
    for(const o of snapshot.level.objectives) {
      if(snapshot.objectiveProgress[o.id]>=o.target)continue;
      if(o.type==='Collect' && tile.kind===o.tileKind)value+=1;
      if(o.type==='BreakSeals' && tile.locked)value+=1.4;
      if(o.type==='Battle'||o.type==='Boss')value+=(content.tiles.find(t=>t.id===tile.kind)?.damage??0)/10;
      if(o.type==='BreakRocks'||o.type==='BreakSeals')for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]) {
        const x=i%w+dx,y=Math.floor(i/w)+dy;
        if(x<0||x>=w||y<0||y>=h)continue;
        const neighbor=tiles[y*w+x];
        if(o.type==='BreakRocks'&&neighbor?.kind===tileId('rock',content)||o.type==='BreakSeals'&&neighbor?.locked)value+=1.4;
      }
    }
    value+=(content.tiles.find(t=>t.id===tile.kind)?.qi??0)*.08;
  }
  return value;
}
function chooseSwap(engine, bot, random) {
  const snapshot=engine.snapshot(), moves=engine.legalMoves();
  if(!moves.length)return null;
  if(bot==='basic' && random()<.65)return moves[Math.floor(random()*moves.length)];
  const ranked=moves.map(move=>{
    const {tiles,cells}=matched(snapshot,move);
    return {move,score:clearValue(snapshot,cells,tiles)+(cells.length>=4 ? .8*cells.length : 0)+random()*.25};
  }).sort((a,b)=>b.score-a.score);
  if(bot==='strategic') {
    // Independent samples prevent the bot from peeking at the actual run's future RNG.
    const sampleSeed=(random()*4294967295)>>>0||1;
    for(const candidate of ranked.slice(0,3)) {
      const sample={...snapshot,randomState:sampleSeed};
      const next=new BoardEngine(snapshot.level,sample);
      next.trySwap(...candidate.move);
      const after=next.snapshot();
      const delta=after.level.objectives.reduce((sum,o)=>sum+(after.objectiveProgress[o.id]-snapshot.objectiveProgress[o.id])/o.target,0);
      const future=next.legalMoves().map(m=>{const p=matched(after,m);return clearValue(after,p.cells,p.tiles);});
      candidate.score+=delta*5+Math.max(0,...future)*.25;
    }
    ranked.sort((a,b)=>b.score-a.score);
  }
  return ranked[0].move;
}
function cast(engine,bot,random) {
  if(!engine.availableSkills().includes('nhat-kiem') || bot==='basic'&&random()<.55)return false;
  const snapshot=engine.snapshot(),{width:w,height:h}=snapshot.level.board;
  const rows=Array.from({length:h},(_,y)=>({y,cells:Array.from({length:w},(_,x)=>y*w+x)}));
  rows.sort((a,b)=>clearValue(snapshot,b.cells)-clearValue(snapshot,a.cells));
  const row=rows[0];const x=row.cells.find(i=>snapshot.level.board.activeCells[i])%w;
  return engine.trySkill('nhat-kiem',[{x,y:row.y}]);
}
function play(map, seed, bot='normal', power='expected', assist=0) {
  const random=rng(seed^0x5a17c9e3), totalExp=power==='minimum'?0:power==='strong'?(map.id-1)*100+1500:(map.id-1)*60;
  const level=mapToLevel(map,seed,assist,content);
  const engine=new BoardEngine(level,null,{loadout:{sword:'thanh-phong',skills:['nhat-kiem']},totalExp});
  let waves=0,maxChain=0;
  for(let action=0;action<map.moves*3+10&&!engine.won&&!engine.lost;action++) {
    if(!cast(engine,bot,random)) {
      const move=chooseSwap(engine,bot,random);
      if(!move||!engine.trySwap(...move))break;
    }
    waves+=engine.animation?.steps.length??0;
    maxChain=Math.max(maxChain,...(engine.animation?.steps.map(s=>s.chain)??[0]));
  }
  const snapshot=engine.snapshot();
  return {won:engine.won,stars:engine.won?mapStars(map,engine.movesUsed):0,movesUsed:engine.movesUsed,waves,maxChain,reshuffles:snapshot.reshuffles??0,
    progress:map.objectives.reduce((sum,o)=>sum+snapshot.objectiveProgress[o.id]/o.target,0)/map.objectives.length};
}
function summarize(map, results) {
  const won=results.filter(r=>r.won),lost=results.filter(r=>!r.won),histogram=[0,0,0,0];results.forEach(r=>histogram[r.stars]++);
  return {mapHash:createHash('sha256').update(JSON.stringify(map)).digest('hex'),id:map.id,difficulty:map.difficulty,samples:results.length,winRate:won.length/results.length,starRates:histogram.map(n=>n/results.length),
    movesHistogram:Object.fromEntries(Array.from({length:map.moves+1},(_,n)=>[n,won.filter(r=>r.movesUsed===n).length]).filter(([,n])=>n)),
    averageMoves:won.length?won.reduce((s,r)=>s+r.movesUsed,0)/won.length:null,averageProgress:results.reduce((s,r)=>s+r.progress,0)/results.length,
    averageFailedProgress:lost.length?lost.reduce((s,r)=>s+r.progress,0)/lost.length:null,
    averageReshuffles:results.reduce((s,r)=>s+r.reshuffles,0)/results.length,averageWaves:results.reduce((s,r)=>s+r.waves,0)/results.length,maxChain:Math.max(...results.map(r=>r.maxChain))};
}
const targets={easy:{win:[.85,.95],three:[.35,.60]},medium:{win:[.50,.70],three:[.15,.30]},hard:{win:[.15,.30],three:[.03,.10]},'very-hard':{win:[.05,.15],three:[.01,.05]}};

function simulateRetries(map, count, playAttempt=play) {
  const maxAttempts=30, attempts=[], levels=[...new Set([0,...map.retryAssistPolicy.reductions])].sort((a,b)=>a-b);
  const byAssist=new Map(levels.map(assist=>[assist,{assist,samples:0,wins:0,losses:0,starCounts:[0,0,0,0]}]));
  const byAttempt=Array.from({length:maxAttempts},(_,i)=>({attempt:i+1,assist:assistForFailures(map,i),samples:0,wins:0,losses:0}));
  let unfinished=0;
  for(let i=0;i<count;i++) {
    let done=false;
    for(let attempt=0;attempt<maxAttempts;attempt++) {
      const assist=assistForFailures(map,attempt);
      const result=playAttempt(map,seedFor(i*31+attempt,'retry'),'normal','expected',assist);
      const bucket=byAssist.get(assist), step=byAttempt[attempt];
      bucket.samples++;step.samples++;
      bucket.starCounts[result.won?result.stars:0]++;
      if(result.won) { bucket.wins++;step.wins++;attempts.push(attempt+1);done=true;break; }
      bucket.losses++;step.losses++;
    }
    if(!done)unfinished++;
  }
  let cumulativeWins=0;
  const policy=map.spawnPolicy;
  return {id:map.id,bot:'normal',power:'expected',samples:count,completed:attempts.length,unfinished,maxAttempts,
    averageAttempts:attempts.length?attempts.reduce((a,b)=>a+b,0)/attempts.length:null,
    totalAttempts:byAttempt.reduce((sum,r)=>sum+r.samples,0),
    hasSpawnPressure:!map.legacy&&(map.objectives.some(o=>o.type==='Collect')&&policy.collectionPressure>0||policy.candidates>1&&(policy.comboPressure>0||policy.obstaclePressure>0)),
    attemptsHistogram:Object.fromEntries(Array.from({length:maxAttempts},(_,n)=>[n+1,attempts.filter(a=>a===n+1).length]).filter(([,n])=>n)),
    byAssist:[...byAssist.values()].map(({starCounts,...r})=>({...r,winRate:r.samples?r.wins/r.samples:null,starRates:r.samples?starCounts.map(n=>n/r.samples):[0,0,0,0]})),
    byAttempt:byAttempt.map(r=>{cumulativeWins+=r.wins;return {...r,winRate:r.samples?r.wins/r.samples:null,cumulativeWinRate:count?cumulativeWins/count:null};})};
}

function evaluateChecks(reports, count, enabled) {
  const tolerance=count<1000?.12:0, results=[];
  const below=(a,b)=>a<b-1e-12;
  for(const r of reports.filter(r=>r.bot==='normal'&&r.power==='expected')) {
    const t=targets[r.difficulty], failures=[];
    if(count>=1000&&r.starRates.slice(1).some(rate=>rate===0))failures.push(`Map ${r.id}: chưa quan sát đủ các mức 1–2–3 sao.`);
    if(below(r.winRate,t.win[0]-tolerance)||below(t.win[1]+tolerance,r.winRate))failures.push(`Map ${r.id}: tỷ lệ thắng nằm ngoài khoảng kiểm tra.`);
    if(below(r.starRates[3],t.three[0]-tolerance)||below(t.three[1]+tolerance,r.starRates[3]))failures.push(`Map ${r.id}: tỷ lệ 3 sao nằm ngoài khoảng kiểm tra.`);
    results.push({id:r.id,bot:r.bot,power:r.power,gate:'difficulty',passed:!failures.length,failures});
  }
  for(const r of reports.filter(r=>r.bot==='strategic'&&r.power==='expected')) {
    const basic=reports.find(b=>b.id===r.id&&b.bot==='basic'&&b.power===r.power);
    if(basic) {
      const failures=below(r.winRate+.1,basic.winRate)?[`Map ${r.id}: bot strategic có tỷ lệ thắng thấp hơn basic quá 10 điểm phần trăm.`]:[];
      results.push({id:r.id,bot:r.bot,power:r.power,gate:'strategy',passed:!failures.length,failures});
    }
  }
  const failures=results.flatMap(r=>r.failures);
  return {enabled,tolerance,results,failures,status:!enabled?'not-run':!results.length?'not-applicable':failures.length?'failed':'passed'};
}

function parseOptions(args) {
  const values={}, flags=new Set(['--check','--offline']);
  const options=new Set(['--seeds','--suite','--bots','--powers','--maps','--retry-seeds','--output','--html-output','--project']);
  for(let i=0;i<args.length;i++) {
    const key=args[i];
    if(flags.has(key)){values[key]=true;continue;}
    if(!options.has(key))throw new Error(`Unknown option: ${key}`);
    if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Missing value for ${key}`);
    values[key]=args[++i];
  }
  const count=Number(values['--seeds']??100),retryCount=Number(values['--retry-seeds']??0);
  if(!Number.isSafeInteger(count)||count<1)throw new Error('--seeds must be a positive integer');
  if(!Number.isSafeInteger(retryCount)||retryCount<0)throw new Error('--retry-seeds must be a non-negative integer');
  const list=(key, fallback, valid)=>{
    const entries=[...new Set((values[key]??fallback).split(',').map(s=>s.trim()))];
    if(entries.some(s=>!valid(s)))throw new Error(`Invalid value for ${key}`);
    return entries;
  };
  const suite=values['--suite']??'validation';
  if(!['training','validation'].includes(suite))throw new Error('--suite must be training or validation');
  return {count,retryCount,suite,check:values['--check']===true,offline:values['--offline']===true,project:values['--project']??defaultProject(),
    ids:list('--maps','1,2,3,4,5,6,7,8,9,10',s=>/^\d+$/.test(s)&&Number(s)>=1&&Number(s)<=catalog.length).map(Number),
    bots:list('--bots','basic,normal,strategic',s=>['basic','normal','strategic'].includes(s)),
    powers:list('--powers','expected',s=>['minimum','expected','strong'].includes(s)),
    output:values['--output']??null,htmlOutput:values['--html-output']??null};
}

async function main(args) {
  const options=parseOptions(args),startedAt=new Date(),reports=[],retries=[];
  const runId=startedAt.toISOString().replace(/[:.]/g,'-')+`-${process.pid}`;
  const directory=path.resolve(__dirname,'../.balance-reports');
  const jsonPath=path.resolve(options.output??path.join(directory,`maps-${runId}.json`));
  const htmlPath=path.resolve(options.htmlOutput??path.join(path.dirname(jsonPath),`maps-${runId}.html`));
  if(jsonPath===htmlPath)throw new Error('--output and --html-output must point to different files');
  const snapshot=await resolveSnapshot({project:options.project,offline:options.offline});
  content=installContent(snapshot.config);
  catalog=snapshot.maps.map(m=>validateMap(m,content));
  for(const id of options.ids)if(id<1||id>content.levelCount)throw new Error(`Map ${id} is not in published content v${content.version} (${content.levelCount} maps)`);
  console.log(`Content v${content.version} · ${snapshot.source==='server'?'synced from server':'local cache'} · ${snapshot.project}${snapshot.cacheFile?` · ${path.relative(process.cwd(),snapshot.cacheFile)}`:''}`);
  let error=null;
  try {
    for(const id of options.ids)for(const bot of options.bots)for(const power of options.powers) {
      const map=catalog[id-1],results=Array.from({length:options.count},(_,i)=>play(map,seedFor(i,options.suite),bot,power));
      const report={...summarize(map,results),bot,power};reports.push(report);
      console.log(`Map ${id} ${bot}/${power}: win ${(report.winRate*100).toFixed(1)}%, 3★ ${(report.starRates[3]*100).toFixed(1)}%`);
    }
    if(options.retryCount)for(const id of options.ids) {
      const retry=simulateRetries(catalog[id-1],options.retryCount);retries.push(retry);
      console.log(`Map ${id} retry: ${retry.completed}/${retry.samples} completed, average ${retry.averageAttempts?.toFixed(2)??'—'} attempts`);
    }
  } catch(cause) { error=cause.message; }
  const finishedAt=new Date(),checks=evaluateChecks(reports,options.count,options.check);
  const report={contentVersion:content.version,configHash:snapshot.hashes.config,
    source:{kind:snapshot.source,project:snapshot.project,version:snapshot.version,syncedAt:snapshot.syncedAt,checkedAt:snapshot.checkedAt,
      cacheFile:snapshot.cacheFile?path.relative(process.cwd(),snapshot.cacheFile):null,hashes:snapshot.hashes},
    suite:options.suite,seeds:options.count,targets,reports,retries,checks,
    run:{id:runId,startedAt:startedAt.toISOString(),finishedAt:finishedAt.toISOString(),durationSeconds:(finishedAt-startedAt)/1000,
      command:['node','tools/simulate_maps.cjs',...args].map(s=>/^[\w./,=-]+$/.test(s)?s:JSON.stringify(s)).join(' '),
      maps:options.ids,bots:options.bots,powers:options.powers,retrySeeds:options.retryCount,status:error?'error':'completed',error},
    maps:options.ids.map(id=>{const m=catalog[id-1];return {id:m.id,name:m.name,difficulty:m.difficulty,moves:m.moves,objectives:m.objectives,
      starThresholds:m.starThresholds,spawnPolicy:m.spawnPolicy,retryAssistPolicy:m.retryAssistPolicy,legacy:!!m.legacy};})};
  for(const [filename,body]of[[jsonPath,JSON.stringify(report,null,2)+'\n'],[htmlPath,renderBalanceReport(report)]]) {
    fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,body);
  }
  console.log(`HTML report: ${path.relative(process.cwd(),htmlPath)}`);
  console.log(`JSON report: ${path.relative(process.cwd(),jsonPath)}`);
  if(error)console.error(error);
  if(options.check&&checks.failures.length)console.error(checks.failures.join('\n'));
  if(error||options.check&&checks.failures.length)process.exitCode=1;
  return report;
}

if(require.main===module) {
  main(process.argv.slice(2)).catch(error=>{ console.error(error.message);process.exitCode=1; });
}
module.exports={play,summarize,seedFor,targets,catalog,simulateRetries,evaluateChecks,parseOptions,main};
