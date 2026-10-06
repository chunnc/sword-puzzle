import type { Loadout, PlayerProfile, PlayerOperation, SkillId, Stars, LevelResult } from './domain';
export type { Loadout, SkillId, Stars, PlayerProfile } from './domain';
export enum TileKind {
    Sword = 0,
    Fire = 1,
    Lightning = 2,
    SpiritOrb = 3,
    Rock = 4
}
export enum GoalKind {
    Collect = 'Collect',
    BreakSeals = 'BreakSeals',
    BreakRocks = 'BreakRocks',
    Battle = 'Battle',
    Boss = 'Boss'
}
export interface Tile {
    kind: TileKind;
    chargeTier: 0 | 4 | 5;
    locked: boolean;
}
export interface CellPosition {
    x: number;
    y: number;
}
export interface BoardSnapshot {
    contentVersion: 2;
    runId: string;
    levelId: number;
    moves: number;
    remaining: number;
    swordQi: number;
    score: number;
    drops: number;
    randomState: number;
    extraMovesUsed: boolean;
    condensed: boolean;
    skillUsed: boolean;
    loadout: Loadout;
    damageScale: number;
    tiles: Tile[];
}
export type BoardAnimationEffectKind = 'slash' | 'cross' | 'fire' | 'lightning' | 'spirit' | 'skill' | 'shuffle';
export interface BoardAnimationEffect {
    kind: BoardAnimationEffectKind;
    cells: number[];
    source?: number;
    row?: number;
    column?: number;
    damage: number;
    qi: number;
}
export interface BoardAnimationFall {
    index: number;
    fromY: number;
}
export interface BoardResolutionStep {
    before: BoardSnapshot;
    after: BoardSnapshot;
    cleared: number[];
    changed: number[];
    effects: BoardAnimationEffect[];
    falls: BoardAnimationFall[];
    damage: number;
    chain: number;
}
export interface BoardActionAnimation {
    kind: 'swap' | 'skill';
    swap?: {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
    };
    skillId?: SkillId;
    swappedBoard: BoardSnapshot;
    steps: BoardResolutionStep[];
    finalBoard: BoardSnapshot;
}
export interface LevelDefinition {
    id: number;
    moves: number;
    goal: GoalKind;
    collectKind: TileKind;
    target: number;
    rocks: number;
    seals: number;
    seed: number;
    chapter: string;
    baseExp: number;
}
export type LevelStar = LevelResult;
export interface WinSummary {
    runId: string;
    levelId: number;
    stars: Stars;
    bestStars: Stars;
    expGained: number;
    totalExp: number;
    coinsGained: number;
    realmBefore: number;
    realmAfter: number;
}
export interface SaveData {
    schemaVersion: 2;
    ownerId: string | null;
    confirmed: PlayerProfile;
    operations: PlayerOperation[];
    profile: PlayerProfile;
    active: BoardSnapshot | null;
    lastWin: WinSummary | null;
}
export type ProgressResponse = {
    levels: LevelStar[];
    highestUnlocked: number;
    realm: string;
};
