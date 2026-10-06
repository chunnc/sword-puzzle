import content from './game-content.json';
export const CONTENT = content;
export const LEVEL_COUNT = content.levelCount;
export const SKILLS = content.skills;
export const SWORDS = content.swords;
export const REALMS = content.realms;
export type SkillId = typeof SKILLS[number]['id'];
export type SwordId = typeof SWORDS[number]['id'];
export type Stars = 0 | 1 | 2 | 3;
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
} | {
    id: string;
    kind: 'purchase';
    category: 'skill' | 'sword';
    itemId: string;
} | {
    id: string;
    kind: 'equip';
    loadout: Loadout;
} | {
    id: string;
    kind: 'importProgress';
    levels: LevelResult[];
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
    return { levels: [], coins: 0, ownedSkills: ['nhat-kiem'], ownedSwords: ['thanh-phong'], loadout: { skills: ['nhat-kiem'], sword: 'thanh-phong' }, revision: 0, totalExp: 0 };
}
export function normalizeLevels(raw: unknown): LevelResult[] {
    if (!Array.isArray(raw))
        return [];
    const map = new Map<number, Stars>();
    for (const item of raw) {
        if (!item || !Number.isInteger(item.levelId) || item.levelId < 1 || item.levelId > LEVEL_COUNT || !Number.isInteger(item.stars) || item.stars < 0 || item.stars > 3)
            continue;
        map.set(item.levelId, Math.max(map.get(item.levelId) ?? 0, item.stars) as Stars);
    }
    const result: LevelResult[] = [];
    for (let id = 1; id <= LEVEL_COUNT && map.has(id); id++)
        result.push({ levelId: id, stars: map.get(id)! });
    return result;
}
export function mergeLevels(a: LevelResult[], b: LevelResult[]): LevelResult[] { return normalizeLevels([...a, ...b]); }
export function totalExp(levels: LevelResult[]): number { return normalizeLevels(levels).reduce((sum, level) => sum + expForStars(level.stars, getLevelData(level.levelId).baseExp), 0); }
export function expForStars(stars: Stars, baseExp = 100): number { return Math.floor(baseExp * content.expRates[stars] / 100); }
export function highestUnlocked(levels: LevelResult[]): number { return Math.min(LEVEL_COUNT, normalizeLevels(levels).length + 1); }
export function isCompleted(levels: LevelResult[], id: number): boolean { return levels.some(x => x.levelId === id); }
export function gradeStars(moves: number, initialMoves: number): Stars { return moves >= initialMoves * .25 ? 3 : moves >= initialMoves * .1 ? 2 : moves > 0 ? 1 : 0; }
export function starBonus(stars: Stars): number { return Math.max(0, stars - 1) * 25; }
export function realmForExp(exp: number) {
    const safe = Math.max(0, Math.floor(exp));
    let index = 0;
    while (index + 1 < REALMS.length && safe >= REALMS[index + 1].exp)
        index++;
    const realm = REALMS[index];
    const next = REALMS[index + 1];
    const progress = next ? Math.min(1, (safe - realm.exp) / (next.exp - realm.exp)) : 1;
    const stage = next ? Math.min(3, Math.floor(progress * 4)) : 0;
    return { ...realm, index, next, progress, stage, stageName: next ? ['Sơ kỳ', 'Trung kỳ', 'Hậu kỳ', 'Viên mãn'][stage] : 'Chân Tiên', damageScale: 1.25 ** index * (1 + .05 * stage), skillSlots: safe >= 1500 ? 2 : 1 };
}
export function getLevelData(id: number) {
    if (!Number.isInteger(id) || id < 1 || id > LEVEL_COUNT)
        throw new Error('INVALID_LEVEL');
    const bandIndex = Math.floor((id - 1) / 10);
    const band = content.levelBands[bandIndex];
    const step = (id - 1) % 10;
    const goal = id === 15 || step === 9 ? 'Boss' : step < 4 ? 'Collect' : step === 5 ? 'BreakSeals' : step === 7 ? 'BreakRocks' : 'Battle';
    return { id, chapter: band.chapter, moves: band.moves, goal, collectKind: step < 4 ? step : 0, target: goal === 'Collect' ? band.collect : goal === 'BreakSeals' ? band.seals : goal === 'BreakRocks' ? band.rocks : goal === 'Boss' ? band.boss : band.battle, rocks: goal === 'BreakRocks' ? band.rocks : goal === 'BreakSeals' ? 0 : bandIndex, seals: goal === 'BreakSeals' ? band.seals : goal === 'BreakRocks' ? 0 : bandIndex, seed: 7919 + id * 104729, baseExp: 100 };
}
export function skillCost(id: SkillId, sword: SwordId, condensed: boolean): number {
    const skill = SKILLS.find(x => x.id === id);
    if (!skill)
        throw new Error('INVALID_SKILL');
    return Math.max(1, Math.ceil(skill.cost * (sword === 'huyen-co' ? .9 : 1) * (condensed ? .75 : 1)));
}
export function validLoadout(raw: unknown, profile: PlayerProfile): Loadout | null {
    if (!raw || typeof raw !== 'object')
        return null;
    const loadout = raw as Loadout;
    if (!Array.isArray(loadout.skills) || loadout.skills.length < 1 || loadout.skills.length > realmForExp(totalExp(profile.levels)).skillSlots || new Set(loadout.skills).size !== loadout.skills.length || !loadout.skills.every(id => profile.ownedSkills.includes(id)) || !profile.ownedSwords.includes(loadout.sword))
        return null;
    return { skills: [...loadout.skills], sword: loadout.sword };
}
export function normalizeProfile(raw: unknown): PlayerProfile | null {
    if (!raw || typeof raw !== 'object')
        return null;
    const p = raw as PlayerProfile;
    if (!Array.isArray(p.levels) || !Number.isSafeInteger(p.coins) || p.coins < 0 || !Array.isArray(p.ownedSkills) || !Array.isArray(p.ownedSwords))
        return null;
    const result: PlayerProfile = { ...emptyProfile(), levels: normalizeLevels(p.levels), coins: p.coins, ownedSkills: [...new Set<SkillId>(['nhat-kiem', ...p.ownedSkills.filter(id => SKILLS.some(x => x.id === id))])], ownedSwords: [...new Set<SwordId>(['thanh-phong', ...p.ownedSwords.filter(id => SWORDS.some(x => x.id === id))])], revision: Number.isSafeInteger(p.revision) && p.revision >= 0 ? p.revision : 0, totalExp: 0 };
    result.totalExp = totalExp(result.levels);
    result.loadout = validLoadout(p.loadout, result) ?? result.loadout;
    return result;
}
export function profileFromLegacy(levels: LevelResult[]): PlayerProfile {
    const normalized = normalizeLevels(levels);
    return { ...emptyProfile(), levels: normalized, coins: normalized.reduce((sum, x) => sum + 100 + starBonus(x.stars), 0), totalExp: totalExp(normalized) };
}
export function parseOperation(raw: unknown): PlayerOperation | null {
    if (!raw || typeof raw !== 'object')
        return null;
    const op = raw as PlayerOperation;
    if (typeof op.id !== 'string' || !/^[a-zA-Z0-9_-]{8,120}$/.test(op.id))
        return null;
    if (op.kind === 'win' && Number.isInteger(op.levelId) && op.levelId >= 1 && op.levelId <= LEVEL_COUNT && Number.isInteger(op.stars) && op.stars >= 0 && op.stars <= 3)
        return { id: op.id, kind: op.kind, levelId: op.levelId, stars: op.stars };
    if (op.kind === 'purchase' && (op.category === 'skill' || op.category === 'sword') && typeof op.itemId === 'string')
        return { id: op.id, kind: op.kind, category: op.category, itemId: op.itemId };
    if (op.kind === 'equip' && op.loadout && Array.isArray(op.loadout.skills) && op.loadout.skills.every(x => typeof x === 'string') && typeof op.loadout.sword === 'string')
        return { id: op.id, kind: op.kind, loadout: { skills: [...op.loadout.skills], sword: op.loadout.sword } };
    if (op.kind === 'importProgress' && Array.isArray(op.levels) && op.levels.length <= LEVEL_COUNT && op.levels.every(x => x && Number.isInteger(x.levelId) && x.levelId >= 1 && x.levelId <= LEVEL_COUNT && Number.isInteger(x.stars) && x.stars >= 0 && x.stars <= 3) && normalizeLevels(op.levels).length === op.levels.length)
        return { id: op.id, kind: op.kind, levels: normalizeLevels(op.levels) };
    return null;
}
export function applyOperation(profile: PlayerProfile, op: PlayerOperation): {
    profile: PlayerProfile;
    error?: string;
} {
    const p: PlayerProfile = { ...profile, levels: [...profile.levels], ownedSkills: [...profile.ownedSkills], ownedSwords: [...profile.ownedSwords], loadout: { ...profile.loadout, skills: [...profile.loadout.skills] } };
    if (op.kind === 'win') {
        if (op.levelId > highestUnlocked(p.levels))
            return { profile, error: 'LEVEL_LOCKED' };
        const previous = p.levels.find(x => x.levelId === op.levelId);
        p.coins += previous ? 10 + Math.max(0, starBonus(op.stars) - starBonus(previous.stars)) : 100 + starBonus(op.stars);
        p.levels = mergeLevels(p.levels, [{ levelId: op.levelId, stars: op.stars }]);
    }
    else if (op.kind === 'importProgress') {
        const merged = mergeLevels(p.levels, op.levels);
        for (const level of merged) {
            const old = p.levels.find(x => x.levelId === level.levelId);
            p.coins += old ? Math.max(0, starBonus(level.stars) - starBonus(old.stars)) : 100 + starBonus(level.stars);
        }
        p.levels = merged;
    }
    else if (op.kind === 'purchase') {
        const item = (op.category === 'skill' ? SKILLS : SWORDS).find(x => x.id === op.itemId);
        if (!item)
            return { profile, error: 'INVALID_ITEM' };
        const owned: string[] = op.category === 'skill' ? p.ownedSkills : p.ownedSwords;
        if (owned.includes(item.id))
            return { profile, error: 'ALREADY_OWNED' };
        if (p.levels.length < item.unlock)
            return { profile, error: 'ITEM_LOCKED' };
        if (p.coins < item.price)
            return { profile, error: 'INSUFFICIENT_COINS' };
        p.coins -= item.price;
        if (op.category === 'skill')
            p.ownedSkills.push(item.id as SkillId);
        else
            p.ownedSwords.push(item.id as SwordId);
    }
    else {
        const loadout = validLoadout(op.loadout, p);
        if (!loadout)
            return { profile, error: 'INVALID_LOADOUT' };
        p.loadout = loadout;
    }
    p.totalExp = totalExp(p.levels);
    p.revision++;
    return { profile: p };
}
export function mergeProfiles(a: PlayerProfile, b: PlayerProfile): PlayerProfile {
    const result = { ...b, levels: mergeLevels(a.levels, b.levels), coins: a.coins + b.coins, ownedSkills: [...new Set([...a.ownedSkills, ...b.ownedSkills])], ownedSwords: [...new Set([...a.ownedSwords, ...b.ownedSwords])], revision: Math.max(a.revision, b.revision) + 1 };
    result.totalExp = totalExp(result.levels);
    result.loadout = validLoadout(b.loadout, result) ?? emptyProfile().loadout;
    return result;
}
