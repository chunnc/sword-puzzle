require('../lib/domain/game').installContent(require('../../content/game-content.json'));
const test=require('node:test');
const assert=require('node:assert/strict');
const {emptyProfile,applyOperation,totalExp,realmForExp}=require('../lib/domain/game');
const {processOperations,parseOperations,profileFromDocument,mergeProfiles}=require('../lib/domain/profile');
const win=(id,levelId,stars)=>({id,kind:'win',levelId,stars,objectiveProgress:{main:require('../lib/domain/game').getLevelData(levelId).objectives[0].target}});
test('first win, replay and star improvement are idempotent by operation ID',()=>{
 let p=emptyProfile(),receipts=new Map();
 for(const op of [win('win_zero_1',1,0),win('win_one__1',1,1),win('win_two__1',1,2),win('win_three1',1,3)]){
  const r=processOperations(p,[op],receipts);p=r.profile;r.newReceipts.forEach((v,k)=>receipts.set(k,v));
  const repeated=processOperations(p,[op],receipts);assert.deepEqual(repeated.profile,p);assert.equal(repeated.newReceipts.size,0);
 }
 assert.equal(p.totalExp,100);assert.equal(p.coins,180);assert.deepEqual(p.levels,[{levelId:1,stars:3}]);
});
test('purchase conflict on two devices is reconciled, and a duplicate item cannot be charged twice',()=>{
 let p=emptyProfile();for(let i=1;i<=3;i++)p=applyOperation(p,win(`win_level_${i}`,i,0)).profile;
 p.coins=200;
 const a={id:'purchase_one',kind:'purchase',category:'sword',itemId:'trong-nhac'},b={id:'purchase_two',kind:'purchase',category:'skill',itemId:'ngu-kiem'};
 const r=processOperations(p,[a,b],new Map());assert.equal(r.profile.coins,0);assert.equal(r.rejected[0].reason,'INSUFFICIENT_COINS');
 const duplicate=processOperations(r.profile,[{...a,id:'purchase_dup'}],new Map());assert.equal(duplicate.rejected[0].reason,'ALREADY_OWNED');assert.equal(duplicate.profile.coins,0);
});
test('reusing an operation ID for different content is rejected',()=>{
 const op=win('same_win_id',1,0),r=processOperations(emptyProfile(),[op],new Map());
 const repeated=processOperations(r.profile,[{...op,stars:3}],r.newReceipts);
 assert.equal(repeated.rejected[0].reason,'OPERATION_CONFLICT');assert.equal(repeated.profile.totalExp,30);
});
test('zero stars unlock stages but no missing stages can be submitted',()=>{
 const r=processOperations(emptyProfile(),[win('first_zero',1,0),win('next_zero_',2,0),win('skip_level',4,3)],new Map());
 assert.equal(r.profile.totalExp,60);assert.equal(r.profile.coins,200);assert.equal(r.rejected[0].reason,'LEVEL_LOCKED');
});
test('legacy progress creates the wallet once, subsequent reads use profileV2',()=>{
 const migrated=profileFromDocument({stars:{1:2,2:0}});assert.equal(migrated.coins,225);assert.equal(migrated.totalExp,110);
 const again=profileFromDocument({stars:{1:2,2:0},profileV2:migrated});assert.deepEqual(again,migrated);
 const imported=applyOperation(again,{id:'legacy_import',kind:'importProgress',levels:migrated.levels});assert.equal(imported.profile.coins,225);
});
test('merging guest inventory and balance computes EXP from max stars',()=>{
 const a=applyOperation(emptyProfile(),win('guest_win_1',1,3)).profile,b=applyOperation(emptyProfile(),win('account_win',1,2)).profile;
 const merged=mergeProfiles(a,b);assert.equal(merged.totalExp,100);assert.equal(merged.coins,275);assert.equal(merged.ownedSkills.length,1);
});
test('validates batches, star range, IDs and unsupported operations',()=>{
 assert.throws(()=>parseOperations([win('bad',1,3)]));assert.throws(()=>parseOperations([win('valid_id_1',1,4)]));assert.throws(()=>parseOperations([win('valid_id_1',1,0),win('valid_id_1',1,0)]));assert.throws(()=>parseOperations(Array.from({length:51},(_,i)=>win(`valid_id_${i}`,1,3))));
});
test('all published results yield the expected EXP totals and realm slots',()=>{
 for(const [stars,exp]of[[0,1200],[1,2400],[2,3200],[3,4000]])assert.equal(totalExp(Array.from({length:40},(_,i)=>({levelId:i+1,stars}))),exp);
 assert.equal(realmForExp(1499).skillSlots,1);assert.equal(realmForExp(1500).skillSlots,2);assert.equal(realmForExp(110000).name,'Chân Tiên');
});

test('authoritative win rewards reflect existing server best stars and survive retries',()=>{
 const p=applyOperation(emptyProfile(),win('existing_best_win',1,3)).profile;
 const op=win('offline_zero_win',1,0),r=processOperations(p,[op],new Map());
 assert.equal(r.rewards[0].expGained,0);assert.equal(r.rewards[0].coinsGained,10);assert.equal(r.rewards[0].bestStars,3);
 assert.deepEqual(processOperations(r.profile,[op],r.newReceipts).rewards,r.rewards);
});
