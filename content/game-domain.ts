export type SkillId = 'nhat-kiem' | 'ngu-kiem' | 'hoa-lien' | 'dan-loi' | 'pha-chuong' | 'lien-kiem' | 'hoi-linh' | 'van-kiem';
export type SwordId = 'thanh-phong' | 'trong-nhac' | 'hoa-van' | 'loi-minh' | 'tu-linh' | 'lien-tinh' | 'pha-quan' | 'huyen-co';
export type Stars = 0 | 1 | 2 | 3;
export interface SkillDefinition {
  id: SkillId;
  name: string;
  description: string;
  artKey: string;
  unlock: number;
  price: number;
  cost: number;
}
export interface SwordDefinition {
  id: SwordId;
  name: string;
  description: string;
  artKey: string;
  unlock: number;
  price: number;
  color: string;
}
export type ObjectiveDefinition = {
  id: string;
  type: 'Collect';
  tileKind: number;
  target: number;
} | {
  id: string;
  type: 'BreakRocks' | 'BreakSeals';
  target: number;
} | {
  id: string;
  type: 'Battle' | 'Boss';
  target: number;
  enemy: {
    id: string;
    name: string;
    artKey: string;
  };
};
export type ObjectiveProgress = Record<string, number>;
export interface LevelDefinition {
  id: number;
  chapter: string;
  moves: number;
  seed: number;
  baseExp: number;
  board: {
    width: number;
    height: number;
    activeCells: boolean[];
  };
  objectives: ObjectiveDefinition[];
  obstacles: {
    rocks: number;
    seals: number;
  };
  spawnPhases: {
    minMovesRemaining: number;
    weights: [number, number, number, number];
  }[];
}
export interface GameContent {
  version: number;
  levelCount: number;
  qiCap: number;
  expRates: [number, number, number, number];
  rewards: {
    firstWinCoins: number;
    replayWinCoins: number;
    starBonus: [number, number, number, number];
  };
  tiles: {
    id: number;
    name: string;
    damage: number;
    qi: number;
  }[];
  realms: {
    id: string;
    name: string;
    exp: number;
  }[];
  skills: SkillDefinition[];
  swords: SwordDefinition[];
  levels: LevelDefinition[];
}
// Runtime content is installed only after bootstrap. No catalog is bundled here.
export let CONTENT: GameContent;
export let LEVEL_COUNT = 0;
export let SKILLS: SkillDefinition[] = [];
export let SWORDS: SwordDefinition[] = [];
export let REALMS: GameContent['realms'] = [];
export function requireContent(): GameContent {
  if (!CONTENT) throw new Error('CONTENT_NOT_LOADED');
  return CONTENT;
}
const skillIds = ['nhat-kiem', 'ngu-kiem', 'hoa-lien', 'dan-loi', 'pha-chuong', 'lien-kiem', 'hoi-linh', 'van-kiem'];
const swordIds = ['thanh-phong', 'trong-nhac', 'hoa-van', 'loi-minh', 'tu-linh', 'lien-tinh', 'pha-quan', 'huyen-co'];
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => Number.isSafeInteger(v) && v as number >= min && v as number <= max;
const unique = (xs: {
  id: string | number;
}[]) => new Set(xs.map(x => x.id)).size === xs.length;
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
export function validateContent(raw: unknown): GameContent {
  const c = raw as GameContent;
  const bad = () => {
    throw new Error('INVALID_CONTENT');
  };
  if (!c || !integer(c.version, 3) || !integer(c.levelCount, 1, 1000) || !integer(c.qiCap, 1, 10000) || !Array.isArray(c.expRates) || c.expRates.length !== 4 || !c.expRates.every(x => integer(x, 0, 100)) || !c.rewards || !integer(c.rewards.firstWinCoins) || !integer(c.rewards.replayWinCoins) || !Array.isArray(c.rewards.starBonus) || c.rewards.starBonus.length !== 4 || !c.rewards.starBonus.every(x => integer(x))) return bad();
  for (const list of [c.tiles, c.realms, c.skills, c.swords, c.levels]) if (!Array.isArray(list) || !list.length || list.some(x => !x || !text(String(x.id))) || !unique(list)) return bad();
  if (c.tiles.length !== 4 || c.tiles.some((x, i) => x.id !== i || !text(x.name) || !integer(x.damage) || !integer(x.qi)) || c.tiles[3].damage !== 0) return bad();
  if (c.skills.length !== 8 || c.swords.length !== 8 || c.skills.some(x => !skillIds.includes(x.id) || !integer(x.cost, 1, c.qiCap) || 'effect' in x || 'target' in x) || c.swords.some(x => !swordIds.includes(x.id) || 'modifiers' in x || !text(x.color))) return bad();
  for (const x of [...c.skills, ...c.swords]) if (!text(x.name) || !text(x.description) || !text(x.artKey) || !integer(x.price) || !integer(x.unlock, 0, c.levelCount)) return bad();
  if (c.realms[0].exp !== 0 || c.realms.some((x, i) => !text(x.id) || !text(x.name) || !integer(x.exp) || i > 0 && x.exp <= c.realms[i - 1].exp)) return bad();
  if (c.levels.length !== c.levelCount) return bad();
  for (const [i, l] of c.levels.entries()) {
    if (l.id !== i + 1 || !text(l.chapter) || !integer(l.moves, 1, 1000) || !integer(l.seed, 1, 0xffffffff) || !integer(l.baseExp, 1) || !l.board || !integer(l.board.width, 3, 12) || !integer(l.board.height, 3, 12) || !Array.isArray(l.board.activeCells) || l.board.activeCells.length !== l.board.width * l.board.height || l.board.activeCells.some(x => typeof x !== 'boolean') || !l.board.activeCells.some(Boolean)) return bad();
    if (!Array.isArray(l.objectives) || !l.objectives.length || !unique(l.objectives) || l.objectives.some(o => !text(o.id) || !/^[a-zA-Z0-9_-]{1,80}$/.test(o.id) || !integer(o.target, 1))) return bad();
    if (l.objectives.filter(o => o.type === 'Battle' || o.type === 'Boss').length > 1) return bad();
    if (!l.obstacles || !integer(l.obstacles.rocks) || !integer(l.obstacles.seals)) return bad();
    const active = l.board.activeCells.filter(Boolean).length;
    const rockCells = l.board.activeCells.filter((v, n) => v && n >= l.board.width && n < l.board.width * (l.board.height - 1)).length;
    if (l.obstacles.rocks > rockCells || l.obstacles.rocks + l.obstacles.seals > active - 6) return bad();
    for (const o of l.objectives) {
      if (o.type === 'Collect') {
        if (!integer(o.tileKind, 0, 3)) return bad();
      } else if (o.type === 'Battle' || o.type === 'Boss') {
        if (!o.enemy || !text(o.enemy.id) || !text(o.enemy.name) || !text(o.enemy.artKey)) return bad();
      } else if (o.type === 'BreakRocks') {
        if (o.target > l.obstacles.rocks) return bad();
      } else if (o.type === 'BreakSeals') {
        if (o.target > l.obstacles.seals) return bad();
      } else return bad();
    }
    if (!Array.isArray(l.spawnPhases) || !l.spawnPhases.length || l.spawnPhases[0].minMovesRemaining !== 0 || l.spawnPhases.some((p, n) => !integer(p.minMovesRemaining, 0, l.moves) || n > 0 && p.minMovesRemaining <= l.spawnPhases[n - 1].minMovesRemaining || !Array.isArray(p.weights) || p.weights.length !== 4 || !p.weights.every(w => integer(w, 1, 10000)))) return bad();
  }
  return JSON.parse(JSON.stringify(c)) as GameContent;
}
const contents = new Map<number, GameContent>();
export function registerContent(raw: unknown): GameContent {
  const c = validateContent(raw);
  contents.set(c.version, c);
  return c;
}
export function getContentVersion(version: number): GameContent {
  const c = contents.get(version);
  if (!c) throw new Error('CONTENT_NOT_LOADED');
  return c;
}
export function installContent(raw: unknown): GameContent {
  const c = registerContent(raw);
  CONTENT = c;
  LEVEL_COUNT = c.levelCount;
  SKILLS = c.skills;
  SWORDS = c.swords;
  REALMS = c.realms;
  return c;
}
export function objectivesComplete(level: LevelDefinition, progress: ObjectiveProgress): boolean {
  return Object.keys(progress).length === level.objectives.length && level.objectives.every(o => integer(progress[o.id], o.target, o.target));
}
export interface LevelResult {
  levelId: number;
  stars: Stars;
}
export interface Loadout {
  skills: SkillId[];
  sword: SwordId;
}
export interface PlayerProfile {
  levels: LevelResult[];
  coins: number;
  ownedSkills: SkillId[];
  ownedSwords: SwordId[];
  loadout: Loadout;
  revision: number;
  totalExp: number;
}
export type PlayerOperation = {
  id: string;
  kind: 'win';
  levelId: number;
  stars: Stars;
  objectiveProgress: ObjectiveProgress;
} | {
  id: string;
  kind: 'purchase';
  category: 'skill' | 'sword';
  itemId: string;
} | {
  id: string;
  kind: 'equip';
  loadout: Loadout;
};
export interface OperationReward {
  id: string;
  expGained: number;
  coinsGained: number;
  bestStars: Stars;
  realmBefore: number;
  realmAfter: number;
}
export interface SyncResponse {
  profile: PlayerProfile;
  acknowledged: string[];
  rewards?: OperationReward[];
  rejected: {
    id: string;
    reason: string;
  }[];
}
export function emptyProfile(): PlayerProfile {
  return {
    levels: [],
    coins: 0,
    ownedSkills: ['nhat-kiem'],
    ownedSwords: ['thanh-phong'],
    loadout: {
      skills: ['nhat-kiem'],
      sword: 'thanh-phong'
    },
    revision: 0,
    totalExp: 0
  };
}
export function normalizeLevels(raw: unknown, c = requireContent()): LevelResult[] {
  if (!Array.isArray(raw)) return [];
  const map = new Map<number, Stars>();
  for (const x of raw) if (x && integer(x.levelId, 1, c.levelCount) && integer(x.stars, 0, 3)) map.set(x.levelId, Math.max(map.get(x.levelId) ?? 0, x.stars) as Stars);
  const result: LevelResult[] = [];
  for (let id = 1; id <= c.levelCount && map.has(id); id++) result.push({
    levelId: id,
    stars: map.get(id)!
  });
  return result;
}
export function mergeLevels(a: LevelResult[], b: LevelResult[], c = requireContent()) {
  return normalizeLevels([...a, ...b], c);
}
export function getLevelData(id: number, c = requireContent()): LevelDefinition {
  const level = c.levels.find(x => x.id === id);
  if (!level) throw new Error('INVALID_LEVEL');
  return level;
}
export function expForStars(stars: Stars, baseExp = 100, c = requireContent()) {
  return Math.floor(baseExp * c.expRates[stars] / 100);
}
export function totalExp(levels: LevelResult[], c = requireContent()) {
  return normalizeLevels(levels, c).reduce((sum, l) => sum + expForStars(l.stars, getLevelData(l.levelId, c).baseExp, c), 0);
}
export function highestUnlocked(levels: LevelResult[], c = requireContent()) {
  return Math.min(c.levelCount, normalizeLevels(levels, c).length + 1);
}
export function isCompleted(levels: LevelResult[], id: number) {
  return levels.some(x => x.levelId === id);
}
export function gradeStars(moves: number, initialMoves: number): Stars {
  return moves >= initialMoves * .25 ? 3 : moves >= initialMoves * .1 ? 2 : moves > 0 ? 1 : 0;
}
export function starBonus(stars: Stars, c = requireContent()) {
  return c.rewards.starBonus[stars];
}
export function realmForExp(exp: number, c = requireContent()) {
  const safe = Math.max(0, Math.floor(exp));
  let index = 0;
  while (index + 1 < c.realms.length && safe >= c.realms[index + 1].exp) index++;
  const realm = c.realms[index],
    next = c.realms[index + 1];
  const progress = next ? Math.min(1, (safe - realm.exp) / (next.exp - realm.exp)) : 1,
    stage = next ? Math.min(3, Math.floor(progress * 4)) : 0;
  return {
    ...realm,
    index,
    next,
    progress,
    stage,
    stageName: next ? ['Sơ kỳ', 'Trung kỳ', 'Hậu kỳ', 'Viên mãn'][stage] : 'Chân Tiên',
    damageScale: 1.25 ** index * (1 + .05 * stage),
    skillSlots: safe >= 1500 ? 2 : 1
  };
}
export function skillCost(id: SkillId, sword: SwordId, condensed: boolean, c = requireContent()) {
  const skill = c.skills.find(x => x.id === id);
  if (!skill) throw new Error('INVALID_SKILL');
  return Math.max(1, Math.ceil(skill.cost * (sword === 'huyen-co' ? .9 : 1) * (condensed ? .75 : 1)));
}
export function validLoadout(raw: unknown, p: PlayerProfile, c = requireContent()): Loadout | null {
  const l = raw as Loadout;
  if (!l || !Array.isArray(l.skills) || l.skills.length < 1 || l.skills.length > realmForExp(p.totalExp, c).skillSlots || new Set(l.skills).size !== l.skills.length || !l.skills.every(id => p.ownedSkills.includes(id)) || !p.ownedSwords.includes(l.sword)) return null;
  return {
    skills: [...l.skills],
    sword: l.sword
  };
}
export function normalizeProfile(raw: unknown, c = requireContent()): PlayerProfile | null {
  const p = raw as PlayerProfile;
  if (!p || !Array.isArray(p.levels) || !integer(p.coins) || !integer(p.totalExp) || !Array.isArray(p.ownedSkills) || !Array.isArray(p.ownedSwords)) return null;
  const result: PlayerProfile = {
    ...emptyProfile(),
    levels: normalizeLevels(p.levels, c),
    coins: p.coins,
    totalExp: p.totalExp,
    revision: integer(p.revision) ? p.revision : 0,
    ownedSkills: [...new Set<SkillId>(['nhat-kiem', ...p.ownedSkills.filter(id => c.skills.some(x => x.id === id))])],
    ownedSwords: [...new Set<SwordId>(['thanh-phong', ...p.ownedSwords.filter(id => c.swords.some(x => x.id === id))])]
  };
  result.loadout = validLoadout(p.loadout, result, c) ?? result.loadout;
  return result;
}
// Only migration of legacy data already stored on the server uses this helper.
export function profileFromLegacy(levels: LevelResult[], c = requireContent()): PlayerProfile {
  const normalized = normalizeLevels(levels, c);
  return {
    ...emptyProfile(),
    levels: normalized,
    coins: normalized.reduce((sum, x) => sum + c.rewards.firstWinCoins + starBonus(x.stars, c), 0),
    totalExp: totalExp(normalized, c)
  };
}
export function parseOperation(raw: unknown, c = requireContent()): PlayerOperation | null {
  const op = raw as PlayerOperation;
  if (!op || typeof op.id !== 'string' || !/^[a-zA-Z0-9_-]{8,120}$/.test(op.id)) return null;
  if (op.kind === 'win' && integer(op.levelId, 1, c.levelCount) && integer(op.stars, 0, 3) && op.objectiveProgress && typeof op.objectiveProgress === 'object' && !Array.isArray(op.objectiveProgress) && Object.values(op.objectiveProgress).every(v => integer(v))) return {
    id: op.id,
    kind: 'win',
    levelId: op.levelId,
    stars: op.stars,
    objectiveProgress: Object.fromEntries(Object.entries(op.objectiveProgress).sort(([a], [b]) => a.localeCompare(b)))
  };
  if (op.kind === 'purchase' && ['skill', 'sword'].includes(op.category) && text(op.itemId)) return {
    id: op.id,
    kind: 'purchase',
    category: op.category,
    itemId: op.itemId
  };
  if (op.kind === 'equip' && op.loadout && Array.isArray(op.loadout.skills) && op.loadout.skills.every(x => typeof x === 'string') && typeof op.loadout.sword === 'string') return {
    id: op.id,
    kind: 'equip',
    loadout: {
      skills: [...op.loadout.skills],
      sword: op.loadout.sword
    }
  };
  return null;
}
export function applyOperation(profile: PlayerProfile, op: PlayerOperation, c = requireContent(), profileContent = c): {
  profile: PlayerProfile;
  error?: string;
} {
  const p: PlayerProfile = {
    ...profile,
    levels: [...profile.levels],
    ownedSkills: [...profile.ownedSkills],
    ownedSwords: [...profile.ownedSwords],
    loadout: {
      ...profile.loadout,
      skills: [...profile.loadout.skills]
    }
  };
  if (op.kind === 'win') {
    if (op.levelId > highestUnlocked(p.levels, profileContent)) return {
      profile,
      error: 'LEVEL_LOCKED'
    };
    if (!objectivesComplete(getLevelData(op.levelId, c), op.objectiveProgress)) return {
      profile,
      error: 'INCOMPLETE_OBJECTIVES'
    };
    const previous = p.levels.find(x => x.levelId === op.levelId);
    p.coins += previous ? c.rewards.replayWinCoins + Math.max(0, starBonus(op.stars, c) - starBonus(previous.stars, c)) : c.rewards.firstWinCoins + starBonus(op.stars, c);
    const best = Math.max(previous?.stars ?? 0, op.stars) as Stars;
    p.totalExp += expForStars(best, getLevelData(op.levelId, c).baseExp, c) - (previous ? expForStars(previous.stars, getLevelData(op.levelId, c).baseExp, c) : 0);
    p.levels = mergeLevels(p.levels, [{
      levelId: op.levelId,
      stars: op.stars
    }], profileContent);
  } else if (op.kind === 'purchase') {
    const item = (op.category === 'skill' ? c.skills : c.swords).find(x => x.id === op.itemId);
    if (!item) return {
      profile,
      error: 'INVALID_ITEM'
    };
    const owned: string[] = op.category === 'skill' ? p.ownedSkills : p.ownedSwords;
    if (owned.includes(item.id)) return {
      profile,
      error: 'ALREADY_OWNED'
    };
    if (p.levels.length < item.unlock) return {
      profile,
      error: 'ITEM_LOCKED'
    };
    if (p.coins < item.price) return {
      profile,
      error: 'INSUFFICIENT_COINS'
    };
    p.coins -= item.price;
    if (op.category === 'skill') p.ownedSkills.push(item.id as SkillId);else p.ownedSwords.push(item.id as SwordId);
  } else {
    const l = validLoadout(op.loadout, p, c);
    if (!l) return {
      profile,
      error: 'INVALID_LOADOUT'
    };
    p.loadout = l;
  }
  p.revision++;
  return {
    profile: p
  };
}
export function mergeProfiles(a: PlayerProfile, b: PlayerProfile, c = requireContent()): PlayerProfile {
  const levels = mergeLevels(a.levels, b.levels, c);
  const result = {
    ...b,
    levels,
    coins: a.coins + b.coins,
    ownedSkills: [...new Set([...a.ownedSkills, ...b.ownedSkills])],
    ownedSwords: [...new Set([...a.ownedSwords, ...b.ownedSwords])],
    revision: Math.max(a.revision, b.revision) + 1,
    totalExp: totalExp(levels, c)
  };
  result.loadout = validLoadout(b.loadout, result, c) ?? emptyProfile().loadout;
  return result;
}
