import { LEVEL_COUNT, expForStars, realmForExp, type Stars } from './game';
export { LEVEL_COUNT } from './game';
export type StarsByLevel = Record<string, number>;
export interface Progress {
    stars: StarsByLevel;
    highestUnlocked: number;
    realm: string;
}
export interface LevelResult {
    levelId: number;
    stars: number;
}
export function emptyProgress(): Progress { return { stars: {}, highestUnlocked: 1, realm: 'LuyenKhi' }; }
export function parseStars(value: unknown): StarsByLevel {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('INVALID_PROGRESS');
    const result: StarsByLevel = {};
    for (const [key, stars] of Object.entries(value)) {
        const level = Number(key);
        if (!Number.isInteger(level) || level < 1 || level > LEVEL_COUNT || String(level) !== key || !Number.isInteger(stars) || (stars as number) < 0 || (stars as number) > 3)
            throw new Error('INVALID_PROGRESS');
        result[key] = stars as number;
    }
    return result;
}
export function parseStoredStars(value: unknown): StarsByLevel {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    return parseStars(Object.fromEntries(Object.entries(value).filter(([key]) => Number.isInteger(Number(key)) && Number(key) >= 1 && Number(key) <= LEVEL_COUNT && String(Number(key)) === key)));
}
export function parseLevelResults(value: unknown): StarsByLevel {
    if (!Array.isArray(value) || value.length > LEVEL_COUNT)
        throw new Error('INVALID_PROGRESS');
    const result: StarsByLevel = {};
    for (const item of value) {
        if (!item || !Number.isInteger(item.levelId) || item.levelId < 1 || item.levelId > LEVEL_COUNT || !Number.isInteger(item.stars) || item.stars < 0 || item.stars > 3 || result[String(item.levelId)] !== undefined)
            throw new Error('INVALID_PROGRESS');
        result[String(item.levelId)] = item.stars;
    }
    return result;
}
export function progressResponse(progress: Progress) {
    return { levels: Object.entries(progress.stars).map(([levelId, stars]) => ({ levelId: Number(levelId), stars })).sort((a, b) => a.levelId - b.levelId), highestUnlocked: progress.highestUnlocked, realm: progress.realm };
}
export function mergeProgress(a: StarsByLevel, b: StarsByLevel): Progress {
    const stars = { ...a };
    for (const [key, value] of Object.entries(b))
        stars[key] = Math.max(stars[key] ?? 0, value);
    let completed = 0;
    while (completed < LEVEL_COUNT && stars[String(completed + 1)] !== undefined)
        completed++;
    if (Object.keys(stars).some(key => Number(key) > completed))
        throw new Error('PROGRESS_GAP');
    const exp = Object.values(stars).reduce((sum, value) => sum + expForStars(value as Stars), 0);
    return { stars, highestUnlocked: Math.min(LEVEL_COUNT, completed + 1), realm: realmForExp(exp).id };
}
