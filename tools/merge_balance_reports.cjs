const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const runtime=require('./game-runtime.cjs');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2);
if(!args.length)throw new Error('Pass validation report JSON files.');
const config=require('../content/game-config.json'),content=runtime.validateContent(config);
const maps=require('../content/game-maps.json').map(raw=>runtime.mapFromDocument(runtime.mapToDocument(runtime.validateMap(raw,content)),content));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const engineHash=createHash('sha256').update(fs.readFileSync(path.join(root,'client/src/game/BoardEngine.ts'))).digest('hex');
const selected=new Map(),retryResults=new Map(),assists=new Map(),sources=new Set();let targets;
for(const filename of args){
 const file=JSON.parse(fs.readFileSync(filename,'utf8'));
 if(file.contentVersion!==config.version||file.suite!=='validation')throw new Error('Only current-version validation reports can be merged');
 if(config.version>=6&&file.engineHash!==engineHash)throw new Error('Stale engine validation report');
 if(config.version>=6&&file.configHash!==hash(content))throw new Error('Stale config validation report');
 targets=file.targets;sources.add(file.source?.kind??'unknown');
 for(const r of file.reports){
  if(r.mapHash!==hash(maps[r.id-1]))throw new Error(`Stale report for map ${r.id}`);
  const key=`${r.id}:${r.bot}:${r.power}`;
  if(!selected.has(key)||selected.get(key).samples<r.samples)selected.set(key,r);
 }
 for(const r of file.retries??[])retryResults.set(r.id,r);
 for(const r of file.assistReports??[])assists.set(r.id,r);
}
const reports=[...selected.values()].sort((a,b)=>a.id-b.id||a.bot.localeCompare(b.bot)||a.power.localeCompare(b.power)),failures=[];
for(let id=1;id<=10;id++){
 const n=selected.get(`${id}:normal:expected`),b=selected.get(`${id}:basic:expected`),s=selected.get(`${id}:strategic:expected`);
 if(!n||!b||!s){failures.push(`Map ${id}: missing bot coverage`);continue;}
 const t=targets[n.difficulty];
 if(n.winRate<t.win[0]||n.winRate>t.win[1]||n.starRates[3]<t.three[0]||n.starRates[3]>t.three[1]||n.starRates.some(rate=>rate===0))failures.push(`Map ${id}: difficulty/star gate failed`);
 if(s.winRate<b.winRate||s.starRates[3]<b.starRates[3])failures.push(`Map ${id}: strategic advantage gate failed`);
 if(config.version>=6&&maps[id-1].objectives.every(o=>o.type==='Collect')&&(n.medianMoves<6||n.medianMoves>10))failures.push(`Map ${id}: Collect median outside 6–10`);
 for(const bot of ['basic','normal','strategic'])for(const power of ['minimum','expected','strong']){
  const r=selected.get(`${id}:${bot}:${power}`);
  if(!r||r.samples<1000)failures.push(`Map ${id}: missing 1000-seed ${bot}/${power} coverage`);
  if(config.version>=6&&r?.maxChain>4)failures.push(`Map ${id}: exceeded four-wave cap`);
 }
 if((retryResults.get(id)?.samples??0)<100)failures.push(`Map ${id}: missing 100 retry sequences`);
}
if(config.version>=6)for(const id of [5,7,10]){
 const r=assists.get(id);
 if(!r||r.rates.some(rate=>rate.samples<2000))failures.push(`Map ${id}: missing 2000 paired assist seeds`);
 else failures.push(...r.failures);
}
const directory=path.join(root,'content/balance');fs.mkdirSync(directory,{recursive:true});
const pilot=path.join(directory,`pilot-v${config.version}`);
const result={contentVersion:config.version,validationDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),configHash:hash(content),sourceConfigHash:hash(config),engineHash,sources:[...sources],firstAttemptSamples:reports.reduce((sum,r)=>sum+r.samples,0),targets,gatesPassed:!failures.length,failures,reports,retries:[...retryResults.values()].sort((a,b)=>a.id-b.id),assistReports:[...assists.values()].sort((a,b)=>a.id-b.id)};
fs.writeFileSync(`${pilot}.json`,JSON.stringify(result,null,2)+'\n');
const percent=n=>(n*100).toFixed(1)+'%',lines=[`# Pilot v${config.version} balance validation`,'',`Status: **${result.gatesPassed?'PASSED':'FAILED — not ready to publish'}**. Source: ${[...sources].join(', ')}.`, '',`${result.firstAttemptSamples.toLocaleString('en-US')} first-attempt simulations on validation seeds disjoint from training; 100 retry sequences per map.`, '',
'Rates are unconditional first-attempt percentages at expected progression strength. Skill casts do not count as paid swaps.','',
'| Map | Difficulty | Moves | Median win moves | Win | 1 star | 2 stars | 3 stars | Basic win | Strategic win | Strong normal win | Max waves/action |',
'|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|'];
for(let id=1;id<=10;id++){
 const n=selected.get(`${id}:normal:expected`),b=selected.get(`${id}:basic:expected`),s=selected.get(`${id}:strategic:expected`),strong=selected.get(`${id}:normal:strong`);if(!n||!b||!s||!strong)continue;
 lines.push(`| ${id} | ${n.difficulty} | ${maps[id-1].moves} | ${n.medianMoves} | ${percent(n.winRate)} | ${percent(n.starRates[1])} | ${percent(n.starRates[2])} | ${percent(n.starRates[3])} | ${percent(b.winRate)} | ${percent(s.winRate)} | ${percent(strong.winRate)} | ${n.maxChain} |`);
}
lines.push('','Paired assist comparison uses the same 2,000 seeds at each support level.','', '| Map | No assist | 10% | 20% | 30% | Gate |','|---|---:|---:|---:|---:|---|');
for(const r of result.assistReports)lines.push(`| ${r.id} | ${r.rates.map(rate=>percent(rate.winRate)).join(' | ')} | ${r.passed?'pass':'fail'} |`);
lines.push('','Retry averages exclude sequences censored after 30 attempts.','', '| Map | Average attempts to win | Unfinished / 100 |','|---|---:|---:|');
for(const r of result.retries)lines.push(`| ${r.id} | ${r.averageAttempts===null?'—':r.averageAttempts.toFixed(2)} | ${r.unfinished} |`);
if(failures.length)lines.push('','Failed acceptance gates:',...failures.map(f=>`- ${f}`));
lines.push('','This is local simulation evidence, not a device playtest or production deployment. Historical v3/v5 runs and legacy maps retain their compatibility paths.', '',`See [pilot-v${config.version}.json](pilot-v${config.version}.json) for hashes, wave histograms, settlement rate, prepared-combo use, charge metrics and retries.`, '');
fs.writeFileSync(`${pilot}.md`,lines.join('\n'));
console.log(`${result.gatesPassed?'PASSED':'FAILED'}: merged ${result.firstAttemptSamples} simulations across ${reports.length} profiles.`);
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
