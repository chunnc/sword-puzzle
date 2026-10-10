const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2);
if(!args.length)throw new Error('Pass validation report JSON files.');
const maps=require('../content/game-maps.json'),config=require('../content/game-config.json');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const selected=new Map(),retryResults=new Map();let targets;
for(const filename of args){
 const file=JSON.parse(fs.readFileSync(filename,'utf8'));
 if(file.contentVersion!==config.version||file.suite!=='validation')throw new Error('Only current-version validation reports can be merged');
 targets=file.targets;
 for(const r of file.reports){
  if(r.mapHash!==hash(maps[r.id-1]))throw new Error(`Stale report for map ${r.id}`);
  const key=`${r.id}:${r.bot}:${r.power}`;
  if(!selected.has(key)||selected.get(key).samples<r.samples)selected.set(key,{...r,mapHash:hash(maps[r.id-1])});
 }
 for(const r of file.retries??[])retryResults.set(r.id,r);
}
const reports=[...selected.values()].sort((a,b)=>a.id-b.id||a.bot.localeCompare(b.bot)||a.power.localeCompare(b.power));
for(let id=1;id<=10;id++){
 const normal=selected.get(`${id}:normal:expected`),basic=selected.get(`${id}:basic:expected`),strategic=selected.get(`${id}:strategic:expected`);
 if(!normal||!basic||!strategic||[normal,basic,strategic].some(r=>r.samples<1000))throw new Error(`Missing 1000-seed bot coverage for map ${id}`);
 const t=targets[normal.difficulty];
 if(normal.winRate<t.win[0]||normal.winRate>t.win[1]||normal.starRates[3]<t.three[0]||normal.starRates[3]>t.three[1]||normal.starRates.slice(1).some(n=>n===0))throw new Error(`Difficulty/star gate failed for map ${id}`);
 if(strategic.winRate<basic.winRate||strategic.starRates[3]<basic.starRates[3])throw new Error(`Strategic advantage gate failed for map ${id}`);
 if(!selected.get(`${id}:normal:minimum`)||!selected.get(`${id}:normal:strong`)||!retryResults.has(id))throw new Error(`Missing power/retry coverage for map ${id}`);
}
const directory=path.join(root,'content/balance');fs.mkdirSync(directory,{recursive:true});
const result={contentVersion:config.version,validationDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),configHash:hash(config),firstAttemptSamples:reports.reduce((sum,r)=>sum+r.samples,0),targets,gatesPassed:true,reports,retries:[...retryResults.values()].sort((a,b)=>a.id-b.id)};
fs.writeFileSync(path.join(directory,'pilot-v4.json'),JSON.stringify(result,null,2)+'\n');
const percent=n=>(n*100).toFixed(1)+'%';
const lines=['# Pilot v4 balance validation','',`Validated ${result.firstAttemptSamples.toLocaleString('en-US')} first-attempt simulations on disjoint validation seeds, plus 100 retry sequences per map.`,
 'All 10 maps meet the normal-bot win and three-star target bands. Every earned star tier was observed, and strategic bots outperform basic bots.','',
 'Rates below are unconditional percentages of all first attempts at expected progression strength; failures are excluded from earned star tiers.','',
 '| Map | Difficulty | Moves | Win | 1 star | 2 stars | 3 stars | Basic win | Strategic win | Stronger normal win |',
 '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|'];
for(let id=1;id<=10;id++){
 const n=selected.get(`${id}:normal:expected`),b=selected.get(`${id}:basic:expected`),s=selected.get(`${id}:strategic:expected`),strong=selected.get(`${id}:normal:strong`);
 lines.push(`| ${id} | ${n.difficulty} | ${maps[id-1].moves} | ${percent(n.winRate)} | ${percent(n.starRates[1])} | ${percent(n.starRates[2])} | ${percent(n.starRates[3])} | ${percent(b.winRate)} | ${percent(s.winRate)} | ${percent(strong.winRate)} |`);
}
lines.push('','Retry means are calculated among completed sequences; unfinished sequences are censored after 30 attempts.','', '| Map | Average attempts to win | Unfinished / 100 |','|---|---:|---:|');
for(const r of result.retries)lines.push(`| ${r.id} | ${r.averageAttempts.toFixed(2)} | ${r.unfinished} |`);
lines.push('','This is simulation evidence, not a human playtest. Basic bots intentionally select weaker moves; normal bots optimize visible objectives. Stronger profiles use higher realm EXP with the same default sword/skill, so collection/obstacle rates can remain identical.','',
 'Full move histograms, cascade/reshuffle metrics, seed suite, per-map hashes and target bands are in [pilot-v4.json](pilot-v4.json). Re-run `npm run maps:release` after changing gameplay or authoring data. Maps 11–40 retain legacy generation rules and are covered by compatibility tests.','');
fs.writeFileSync(path.join(directory,'pilot-v4.md'),lines.join('\n'));
console.log(`Validated and merged ${result.firstAttemptSamples} simulations across ${reports.length} profiles.`);
