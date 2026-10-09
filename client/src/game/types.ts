import type { Loadout, PlayerProfile, PlayerOperation, SkillId, Stars, LevelResult, LevelDefinition, ObjectiveProgress } from './domain';
export type { Loadout, SkillId, Stars, PlayerProfile, LevelDefinition, ObjectiveProgress } from './domain';
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
    contentVersion: number;
    level: LevelDefinition;
    runId: string;
    levelId: number;
    moves: number;
    objectiveProgress: ObjectiveProgress;
    swordQi: number;
    score: number;
    drops: number;
    randomState: number;
    extraMovesUsed: boolean;
    condensed: boolean;
    skillUsed: boolean;
    loadout: Loadout;
    damageScale: number;
    tiles: (Tile | null)[];
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
    objectiveProgressAfter?: ObjectiveProgress;
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
export type BoardActionStart = Pick<BoardActionAnimation, 'kind' | 'swap' | 'skillId' | 'swappedBoard'>;
export type BoardActionPhase =
    | { kind: 'start'; action: BoardActionStart }
    | { kind: 'step'; step: BoardResolutionStep }
    | { kind: 'settled'; board: BoardSnapshot };
export interface BoardPhasePlayback {
    started: Promise<void>;
    finished: Promise<void>;
}
export interface BoardActionPresenter {
    signal: AbortSignal;
    present: (phase: BoardActionPhase) => BoardPhasePlayback;
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
    schemaVersion: 3;
    ownerId: string | null;
    profile: PlayerProfile;
    active: BoardSnapshot | null;
    lastWin: WinSummary | null;
    pending: { contentVersion: number; operation: PlayerOperation } | null;
}
export type ProgressResponse = {
    levels: LevelStar[];
    highestUnlocked: number;
    realm: string;
};
