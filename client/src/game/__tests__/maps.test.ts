jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import { BoardEngine } from '../BoardEngine';
import { assistForFailures, chapterForLevel, contentWire, getContentVersion, installContent, mapFromDocument, mapStars, mapToDocument, mapToLevel, semanticTileKind, tileId, validateContent, validateMap, type GameContent, type MapDefinition } from '../domain';
import { normalizeSnapshot } from '../save';
const config = require('../../../../content/game-config.json');
const sources = require('../../../../content/game-maps.json');
const legacy = require('../../../../content/game-content.json');
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
let content: GameContent;
beforeEach(() => { content = installContent(config); });
afterEach(() => { installContent(legacy); });
const map = (id = 1) => validateMap(sources[id-1], content);
it('round trips top-first matrices through Firestore row maps without nested arrays', () => {
  const m = map(); m.layout[0][0] = 0;
  const stored = mapToDocument(m);
  expect('layout' in stored).toBe(false);
  expect(stored.layoutRows[0].cells[0]).toBe(0);
  expect(mapFromDocument(stored, content)).toEqual(m);
  const board = new BoardEngine(mapToLevel(m, 123, 0, content));
  expect(board.get(0, 6)).toBeNull();
});
it('preserves explicit starting tiles and seals across seeds and resumes RNG/director exactly', () => {
  const m = map(6);
  for (const seed of [1, 4321, 987654]) {
    const engine = new BoardEngine(mapToLevel(m, seed, .2, content));
    m.layout.forEach((row,y) => row.forEach((id,x) => { if (id > 0) expect(engine.get(x, row.length-1-y)?.kind).toBe(id); }));
    for (const seal of m.initialSeals) expect(engine.get(seal.column, m.layout.length-1-seal.row)?.locked).toBe(true);
    const snapshot = engine.snapshot(), restored = normalizeSnapshot(snapshot)!;
    expect(restored).not.toBeNull();
    const other = new BoardEngine(restored.level, restored);
    const move = engine.legalMoves()[0];
    engine.trySwap(...move); other.trySwap(...move);
    expect(other.snapshot()).toEqual(engine.snapshot());
  }
});
it('uses a sparse shuffled ID registry for initialization, effects and collection', () => {
  const c = clone(config), ids: Record<number,number> = { 1:11, 2:123, 3:37, 4:90, 5:400 };
  c.tiles.forEach((t:any) => { t.id=ids[t.id]; }); c.tiles.reverse(); c.normalTileIds=c.normalTileIds.map((id:number)=>ids[id]);
  content=installContent(c);
  const m=clone(sources[0]) as MapDefinition;
  m.layout=m.layout.map(row=>row.map(id=>id>0?ids[id]:id));
  m.objectives.forEach(o=>{if(o.type==='Collect')o.tileKind=ids[o.tileKind];});
  m.spawnPolicy.weights=Object.fromEntries(Object.entries(m.spawnPolicy.weights).map(([id,w])=>[ids[Number(id)],w]));
  const engine=new BoardEngine(mapToLevel(validateMap(m,content),54321,0,content));
  expect(tileId('fire',content)).toBe(123);
  expect(semanticTileKind(123,content)).toBe(1);
  expect(engine.snapshot().tiles.every(t=>!t||Object.values(ids).includes(t.kind))).toBe(true);
  engine.trySwap(...engine.legalMoves()[0]);
  expect(engine.snapshot().tiles.every(t=>!t||Object.values(ids).includes(t.kind))).toBe(true);
});
it.each(['ragged','unknown','fraction','negative','fixed-match','seal-void','pool-obstacle'])('rejects invalid %s layouts/config', kind => {
  const m=map();
  if(kind==='ragged')m.layout[0].pop();
  if(kind==='unknown')m.layout[0][0]=999;
  if(kind==='fraction')m.layout[0][0]=1.5;
  if(kind==='negative')m.layout[0][0]=-2;
  if(kind==='fixed-match')m.layout[0].splice(0,3,1,1,1);
  if(kind==='seal-void'){m.layout[0][0]=0;m.initialSeals=[{row:0,column:0}];}
  if(kind==='pool-obstacle'){const c=clone(config);c.normalTileIds[0]=5;expect(()=>validateContent(c)).toThrow();return;}
  expect(()=>validateMap(m,content)).toThrow('INVALID_MAP');
});
it('rejects a fixed dead board without silently shuffling authored pieces', () => {
  const m=map();m.layout=Array.from({length:3},(_,y)=>Array.from({length:3},(_,x)=>(x+y)%4+1));m.initialSeals=[];
  expect(()=>new BoardEngine(mapToLevel(m,42,0,content))).toThrow('NO_PLAYABLE_LAYOUT');
});
it('keeps non-pilot rules and RNG equivalent after mapping legacy tile IDs', () => {
  const oldContent=installContent(legacy);
  for(const id of [11,16,18,21,40]) {
    const old=new BoardEngine(oldContent.levels[id-1]);
    content=installContent(config);
    const modern=new BoardEngine(mapToLevel(map(id),sources[id-1].legacy.seed,0,content));
    const compare=()=>{
      const a=old.snapshot(),b=modern.snapshot();
      expect(b.randomState).toBe(a.randomState);
      expect(b.tiles.map(t=>t?{...t,kind:t.kind-1}:null)).toEqual(a.tiles);
      expect(b.objectiveProgress).toEqual(a.objectiveProgress);
    };
    compare();
    for(let turn=0;turn<3&&!old.won&&!old.lost;turn++){const move=old.legalMoves()[0];old.trySwap(...move);modern.trySwap(...move);compare();}
    installContent(legacy);
  }
});
it('bootstrap has metadata and no maps; stars and capped retry support have explicit boundaries', () => {
  expect(contentWire(content)).not.toHaveProperty('levels');
  expect(content.levels).toEqual([]);
  expect(chapterForLevel(11,content).id).toBe('chapter-2');
  const m=map();
  expect(mapStars(m,m.starThresholds.threeStarMaxMovesUsed)).toBe(3);
  expect(mapStars(m,m.starThresholds.twoStarMaxMovesUsed)).toBe(2);
  expect(mapStars(m,m.moves+3)).toBe(1);
  expect([0,2,3,5,7,99].map(n=>assistForFailures(m,n))).toEqual([0,0,.1,.2,.3,.3]);
});
it('keeps sword damage modifiers correct with registry IDs instead of legacy enum values', () => {
  const m=map(5),s=new BoardEngine(mapToLevel(m,54321,0,content)).snapshot();
  s.tiles=Array.from({length:49},(_,i)=>({kind:(i%7+2*Math.floor(i/7))%4+1,chargeTier:0,locked:false}));
  for(let x=0;x<7;x++)s.tiles[3*7+x]!.kind=tileId('fire',content);
  s.swordQi=100;s.loadout={sword:'hoa-van',skills:['nhat-kiem']};
  const engine=new BoardEngine(s.level,s);
  expect(engine.trySkill('nhat-kiem',[{x:0,y:3}])).toBe(true);
  expect(engine.animation!.steps[0].damage).toBe(7*9);
});
