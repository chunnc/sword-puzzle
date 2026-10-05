export enum TileKind {
  Sword = 0,
  Fire = 1,
  Lightning = 2,
  Stone = 3,
  Herb = 4,
  Rock = 5,
}

export enum SpecialKind {
  None = 0,
  Slash = 1,
  Omni = 2,
}

export enum GoalKind {
  Collect = 'Collect',
  BreakSeals = 'BreakSeals',
  Battle = 'Battle',
  Boss = 'Boss',
}

export type Tile = {
  kind: TileKind;
  special: SpecialKind | 99;
  locked: boolean;
};

export interface BoardSnapshot {
  levelId: number;
  moves: number;
  remaining: number;
  swordQi: number;
  score: number;
  drops: number;
  randomState: number;
  extraMovesUsed: boolean;
  tiles: Tile[];
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
}

export interface LevelStar {
  levelId: number;
  stars: number;
}

export interface SaveData {
  schemaVersion: 1;
  levels: LevelStar[];
  active: BoardSnapshot | null;
}

export interface ProgressResponse {
  levels: LevelStar[];
  highestUnlocked: number;
  realm: 'LuyenKhi' | 'TrucCo' | 'KimDan';
}
