import { createHash } from 'node:crypto';
import { applyOperation, mergeProfiles, normalizeLevels, normalizeProfile, parseOperation, profileFromLegacy, realmForExp, highestUnlocked, type PlayerProfile, type PlayerOperation, type SyncResponse, type OperationReward } from './game';
export function profileFromDocument(data: Record<string, any> | undefined): PlayerProfile {
    const existing = normalizeProfile(data?.profileV2);
    if (existing)
        return existing;
    const stars = data?.stars && typeof data.stars === 'object' ? data.stars : {};
    const levels = normalizeLevels(Object.entries(stars).map(([levelId, stars]) => ({ levelId: Number(levelId), stars })));
    return profileFromLegacy(levels);
}
export function profileFields(profile: PlayerProfile, previousStars: Record<string, number> = {}) {
    return { profileV2: profile, stars: { ...previousStars, ...Object.fromEntries(profile.levels.map(x => [String(x.levelId), x.stars])) }, highestUnlocked: highestUnlocked(profile.levels), realm: realmForExp(profile.totalExp).id, updatedAt: Date.now() };
}
export { mergeProfiles };
export interface OperationReceipt {
    hash: string;
    accepted: boolean;
    reason?: string;
    reward?: OperationReward;
}
export function operationHash(op: PlayerOperation): string { return createHash('sha256').update(JSON.stringify(op)).digest('hex'); }
export function parseOperations(raw: unknown): PlayerOperation[] {
    if (!Array.isArray(raw) || raw.length > 50)
        throw new Error('INVALID_OPERATIONS');
    const ops = raw.map(parseOperation);
    if (ops.some(op => !op) || new Set(ops.map(op => op!.id)).size !== ops.length)
        throw new Error('INVALID_OPERATIONS');
    return ops as PlayerOperation[];
}
export function processOperations(profile: PlayerProfile, operations: PlayerOperation[], receipts: Map<string, OperationReceipt>): SyncResponse & {
    newReceipts: Map<string, OperationReceipt>;
} {
    let next = profile;
    const acknowledged: string[] = [], rejected: {
        id: string;
        reason: string;
    }[] = [];
    const newReceipts = new Map<string, OperationReceipt>();
    const rewards: OperationReward[] = [];
    for (const op of operations) {
        const hash = operationHash(op);
        const previous = receipts.get(op.id);
        if (previous) {
            if (previous.hash !== hash)
                rejected.push({ id: op.id, reason: 'OPERATION_CONFLICT' });
            else if (previous.accepted) {
                acknowledged.push(op.id);
                if (previous.reward) rewards.push(previous.reward);
            }
            else
                rejected.push({ id: op.id, reason: previous.reason ?? 'INVALID_OPERATION' });
            continue;
        }
        const result = applyOperation(next, op);
        const reward: OperationReward | undefined = !result.error && op.kind === 'win' ? {
            id: op.id, expGained: result.profile.totalExp - next.totalExp,
            coinsGained: result.profile.coins - next.coins,
            bestStars: result.profile.levels.find(x => x.levelId === op.levelId)!.stars,
            realmBefore: realmForExp(next.totalExp).index,
            realmAfter: realmForExp(result.profile.totalExp).index
        } : undefined;
        const receipt: OperationReceipt = { hash, accepted: !result.error, ...(result.error ? { reason: result.error } : {}), ...(reward ? { reward } : {}) };
        if (reward) rewards.push(reward);
        newReceipts.set(op.id, receipt);
        if (result.error)
            rejected.push({ id: op.id, reason: result.error });
        else {
            next = result.profile;
            acknowledged.push(op.id);
        }
    }
    return { profile: next, acknowledged, rejected, rewards, newReceipts };
}
