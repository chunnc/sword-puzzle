import type { Loadout, PlayerProfile, PlayerOperation, SkillId, Stars, LevelResult, LevelDefinition, ObjectiveProgress, RunReport } from './domain';
export type { Loadout, SkillId, Stars, PlayerProfile, LevelDefinition, ObjectiveProgress } from './domain';
// Historical v3 IDs and renderer semantics. Gameplay IDs resolve through the versioned registry.
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
    kind: number;
    chargeTier: 0 | 4 | 5;
    locked: boolean;
}
export interface CellPosition {
    x: number;
    y: number;
}
export interface BoardSnapshot {
    configVersion?: number;
    mapVersion?: number;
    totalExpAtStart?: number;
    directorPressure?: number;
    reshuffles?: number;
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
    /** Present only when a charged sword activates, not for slash-shaped skills. */
    swordChargeTier?: 4 | 5;
    /** Retained from the consumed orb, even when an earlier trace cleared it. */
    spiritChargeTier?: 4 | 5;
    row?: number;
    column?: number;
    damage: number;
    qi: number;
    objectiveProgressAfter?: ObjectiveProgress;
}
export interface BoardAnimationFall {
    spawned?: boolean;
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
    /** Refill board before a reward-free rearrangement; after is the durable settled board. */
    settlement?: { before: BoardSnapshot; reason: 'cascade-cap' | 'no-moves' };
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
    pendingStart?: { runId: string; levelId: number; contentVersion?: number; previousRunId: string | null };
    retiredRunId?: string;
    pendingFinish?: { runId: string; levelId: number; contentVersion: number; report: RunReport };
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
