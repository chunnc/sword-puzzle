export type StarsByLevel = Record<string, number>;

export interface Progress {
  stars: StarsByLevel;
  highestUnlocked: number;
  realm: "LuyenKhi" | "TrucCo" | "KimDan";
}

export interface LevelResult { levelId: number; stars: number; }

export const LEVEL_COUNT = 60;

export function emptyProgress(): Progress {
  return { stars: {}, highestUnlocked: 1, realm: "LuyenKhi" };
}

export function parseStars(value: unknown): StarsByLevel {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_PROGRESS");
  }
  const result: StarsByLevel = {};
  for (const [key, stars] of Object.entries(value)) {
    const level = Number(key);
    if (!Number.isInteger(level) || level < 1 || level > LEVEL_COUNT || String(level) !== key ||
        !Number.isInteger(stars) || (stars as number) < 1 || (stars as number) > 3) {
      throw new Error("INVALID_PROGRESS");
    }
    result[key] = stars as number;
  }
  return result;
}

export function parseLevelResults(value: unknown): StarsByLevel {
  if (!Array.isArray(value) || value.length > LEVEL_COUNT) throw new Error("INVALID_PROGRESS");
  const result: StarsByLevel = {};
  for (const item of value) {
    if (!item || typeof item !== "object" || !Number.isInteger(item.levelId) ||
        item.levelId < 1 || item.levelId > LEVEL_COUNT || !Number.isInteger(item.stars) ||
        item.stars < 1 || item.stars > 3 || result[String(item.levelId)] !== undefined)
      throw new Error("INVALID_PROGRESS");
    result[String(item.levelId)] = item.stars;
  }
  return result;
}

export function progressResponse(progress: Progress): { levels: LevelResult[]; highestUnlocked: number; realm: Progress["realm"] } {
  return { levels: Object.entries(progress.stars).map(([levelId, stars]) => ({ levelId: Number(levelId), stars }))
      .sort((a, b) => a.levelId - b.levelId), highestUnlocked: progress.highestUnlocked, realm: progress.realm };
}

export function mergeProgress(a: StarsByLevel, b: StarsByLevel): Progress {
  const stars: StarsByLevel = { ...a };
  for (const [level, count] of Object.entries(b)) {
    stars[level] = Math.max(stars[level] || 0, count);
  }
  let completed = 0;
  while (completed < LEVEL_COUNT && stars[String(completed + 1)] !== undefined) completed++;
  if (Object.keys(stars).some(key => Number(key) > completed)) {
    throw new Error("PROGRESS_GAP");
  }
  return {
    stars,
    highestUnlocked: Math.min(LEVEL_COUNT, completed + 1),
    realm: completed >= 40 ? "KimDan" : completed >= 20 ? "TrucCo" : "LuyenKhi"
  };
}
