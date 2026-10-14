jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import { BoardEngine } from '../BoardEngine';
import { assistForFailures, chapterForLevel, contentWire, getContentVersion, installContent, mapFromDocument, mapStars, mapToDocument, mapToLevel, semanticTileKind, tileId, validateContent, validateMap, type GameContent, type MapDefinition } from '../domain';
import { normalizeSnapshot } from '../save';
const config = require('../../../../content/game-config.json');
const sources = require('../../../../content/game-maps.json');
const legacy = require('../../../../content/game-config.json');
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
let content: GameContent;
beforeEach(() => { content = installContent(config); });
afterEach(() => { installContent(legacy); });
const map = (id = 1) => validateMap(sources.find((m:any) => m.id === id) ?? sources[0], content);
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
  const m = map(2);
  for (const seed of [1, 4321, 987654]) {
    const engine = new BoardEngine(mapToLevel(m, seed, .2, content));
    m.layout.forEach((row,y) => row.forEach((id,x) => { if (id > 0) expect(engine.get(x, m.layout.length-1-y)?.kind).toBe(id); }));
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
  m.tileRegistry=Object.fromEntries(Object.entries(m.tileRegistry!).map(([key,id])=>[key,ids[id as number]])) as MapDefinition['tileRegistry'];
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
  const m=map();delete m.tutorial;m.layout=Array.from({length:3},(_,y)=>Array.from({length:3},(_,x)=>(x+y)%4+1));m.initialSeals=[];
  expect(()=>new BoardEngine(mapToLevel(m,42,0,content))).toThrow('NO_PLAYABLE_LAYOUT');
});
it('rejects invalid combo chance and collect targets above the cap', () => {
  const missing = map(); delete (missing.spawnPolicy as any).comboChance;
  expect(() => validateMap(missing, content)).toThrow('INVALID_MAP');
  const negative = map(); negative.spawnPolicy.comboChance = -.1;
  expect(() => validateMap(negative, content)).toThrow('INVALID_MAP');
  const high = map(); high.objectives.find(o => o.type === 'Collect')!.target = 31;
  expect(() => validateMap(high, content)).toThrow('INVALID_MAP');
});
it('bootstrap has metadata and no maps; percentage stars and capped retry support have explicit boundaries', () => {
  expect(contentWire(content)).not.toHaveProperty('levels');
  expect(content.levels).toEqual([]);
  expect(chapterForLevel(2,content).id).toBe('chapter-1');
  expect(chapterForLevel(content.levelCount,content).id).toBe('chapter-1');
  expect(() => chapterForLevel(content.levelCount + 1,content)).toThrow('INVALID_CHAPTER');
  const m=map();
  expect(mapStars(m,3)).toBe(3);
  expect(mapStars(m,4)).toBe(2);
  expect(mapStars(m,6)).toBe(1);
  expect([0,2,3,5,7,99].map(n=>assistForFailures(m,n))).toEqual([0,0,0,0,0,0]);
});
it.each([
  [8,3,4,5,6],
  [10,4,5,7,8],
  [7,3,4,5,6],
  [11,5,6,8,9],
])('uses strict 50%%/75%% cutoffs for a %i-move map', (moves, lastThree, firstTwo, lastTwo, firstOne) => {
  const m=map();m.moves=moves;
  expect(mapStars(m,lastThree)).toBe(3);
  expect(mapStars(m,lastThree+1)).toBe(2);
  expect(mapStars(m,firstTwo)).toBe(2);
  expect(mapStars(m,lastTwo)).toBe(2);
  expect(mapStars(m,firstOne)).toBe(1);
  expect(mapStars(m,moves+3)).toBe(1); // Bonus moves count as moves used; denominator stays at the map budget.
});
it('validates percentage stars and tutorial metadata in the v8 catalog',()=>{
  for(const source of sources){const valid=mapFromDocument(mapToDocument(source),content);if(valid.tutorial)expect(valid.tutorial.steps.length).toBeGreaterThan(0);expect(mapStars(valid,1)).toBe(3);}
  const invalid=clone(map());invalid.starThresholds={mode:'percentage',threeStarBelowPercent:75,twoStarBelowPercent:50};
  expect(()=>validateMap(invalid,content)).toThrow('INVALID_MAP');
});
it('keeps sword damage modifiers correct with registry IDs instead of legacy enum values', () => {
  const m=map(4),s=new BoardEngine(mapToLevel(m,54321,0,content)).snapshot();
  s.tiles=Array.from({length:s.tiles.length},(_,i)=>({kind:content.normalTileIds[(i%7+2*Math.floor(i/7))%4],chargeTier:0 as const,locked:false}));
  for(let x=0;x<7;x++)s.tiles[3*7+x]!.kind=tileId('fire',content);
  s.swordQi=100;s.loadout={sword:'hoa-van',skills:['nhat-kiem']};
  const engine=new BoardEngine(s.level,s);
  expect(engine.trySkill('nhat-kiem',[{x:0,y:3}])).toBe(true);
  const activeFireCells = s.level.board.activeCells.slice(3*7,4*7).filter(Boolean).length;
  expect(engine.animation!.steps[0].damage).toBe(activeFireCells * Math.floor(content.tiles.find(t=>t.key==='fire')!.damage * 1.5));
});
