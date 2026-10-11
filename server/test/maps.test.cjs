const {test}=require('node:test'),assert=require('node:assert/strict');
const game=require('../lib/domain/game'),runs=require('../lib/domain/runs');
const content=game.validateContent(require('../../content/game-config.json'));
const maps=require('../../content/game-maps.json').map(m=>game.validateMap(m,content));
test('all map documents round trip and config wire payload excludes map data',()=>{
 assert.equal(maps.length,40);assert.equal(game.contentWire(content).levels,undefined);
 for(const map of maps)assert.deepEqual(game.mapFromDocument(game.mapToDocument(map),content),map);
});
test('a multi-Collect win requires complete progress for both objective IDs',()=>{
 const map=maps[2],report={outcome:'won',movesUsed:5,objectiveProgress:{main:30,secondary:30},extraMovesUsed:false};
 assert.equal(runs.parseRunReport(report,map).outcome,'won');
 assert.throws(()=>runs.parseRunReport({...report,objectiveProgress:{main:30,secondary:29}},map));
 assert.throws(()=>runs.parseRunReport({...report,objectiveProgress:{main:30}},map));
});
test('profile migration and normalization do not need map definitions',()=>{
 const p=game.profileFromLegacy([{levelId:1,stars:3},{levelId:2,stars:0}],content);
 assert.equal(p.totalExp,130);assert.equal(game.highestUnlocked(p.levels,content),3);
 assert.deepEqual(game.normalizeProfile(p,content),p);assert.deepEqual(content.levels,[]);
});
test('starts count retries, abandoning leaves failure streak intact, and assistance is capped',()=>{
 let stats=runs.emptyMapStats();stats=runs.startedStats(stats);assert.equal(stats.retryCount,0);
 stats.consecutiveFailures=3;stats=runs.abandonedStats(stats);stats=runs.startedStats(stats);
 assert.equal(stats.retryCount,1);assert.equal(stats.abandoned,1);assert.equal(stats.consecutiveFailures,3);
 assert.equal(runs.assistForFailures(maps[0],3),.1);assert.equal(runs.assistForFailures(maps[0],100),.3);
});
test('server grades results from moves used, retains best stars, and handles final failure after extra moves',()=>{
 const map=maps[0],run={runId:'run_test_0001',seed:1,map,assistReduction:.3,attempt:1,loadout:game.emptyProfile().loadout,totalExp:0};
 const report=runs.parseRunReport({outcome:'won',movesUsed:map.starThresholds.threeStarMaxMovesUsed,objectiveProgress:{main:map.objectives[0].target},extraMovesUsed:false},map);
 const result=runs.completeRun(run,report,runs.startedStats(runs.emptyMapStats()),game.emptyProfile(),content,content,100);
 assert.equal(result.receipt.stars,3);assert.equal(result.stats.firstWinAt,100);assert.equal(result.stats.consecutiveFailures,0);assert.equal(result.profile.levels[0].stars,3);
 const failed=runs.parseRunReport({outcome:'lost',movesUsed:map.moves+3,objectiveProgress:{main:0},extraMovesUsed:true},map);
 assert.equal(runs.completeRun(run,failed,result.stats,result.profile,content,content,200).stats.consecutiveFailures,1);
 assert.throws(()=>runs.parseRunReport({...failed,movesUsed:map.moves},map));
 assert.throws(()=>runs.parseRunReport({...report,objectiveProgress:{main:0}},map));
 const zero=runs.completeRun(run,{...report,movesUsed:map.moves},result.stats,result.profile,content,content,300);
 assert.equal(zero.receipt.stars,1);assert.equal(zero.profile.levels[0].stars,3);
});
