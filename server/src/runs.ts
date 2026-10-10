import { randomBytes } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { ApiError, type AuthenticatedRequest } from './identity';
import { chapterMaps, currentContent, loadContent, loadMap } from './content';
import { contentWire, highestUnlocked, mapFromDocument, mapToDocument } from './domain/game';
import { profileFields, profileFromDocument } from './domain/profile';
import { abandonedStats, assistForFailures, completeRun, emptyMapStats, parseRunReport, startedStats, type MapStats, type StoredRun } from './domain/runs';

export function createRunsRouter(db: Firestore, requireAuth: RequestHandler, assertInstallation: (req: AuthenticatedRequest, tx: Transaction) => Promise<unknown>) {
  const router = Router();
  router.get('/v3/bootstrap', async (_req, res, next) => {
    try {
      const { config, content } = await currentContent();
      if (!content.layoutCodes) throw new ApiError(503, 'CONTENT_NOT_CONFIGURED');
      res.set('Cache-Control', 'no-store').json({ contentVersion: content.version, content: contentWire(content), levelCount: content.levelCount,
        rewardedAdsEnabled: config.rewardedAdsEnabled === true, minClientVersion: config.minClientVersion ?? '1.4.0' });
    } catch (error) { next(error); }
  });
  router.get('/v3/content/:version', async (req, res, next) => {
    try { res.json(contentWire(await loadContent(Number(req.params.version)))); } catch (error) { next(error); }
  });
  router.get('/v3/chapters/:chapterId/maps', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
      const version = Number(req.query.contentVersion), chapterId = String(req.params.chapterId);
      const content = await loadContent(version), chapter = content.chapters?.find(c => c.id === chapterId);
      if (!chapter) throw new ApiError(404, 'INVALID_CHAPTER');
      const player = await db.collection('players').doc(req.playerId!).get();
      if (chapter.firstLevelId > highestUnlocked(profileFromDocument(player.data(), content).levels, content)) throw new ApiError(403, 'CHAPTER_LOCKED');
      res.json({ contentVersion: version, chapterId, maps: await chapterMaps(version, chapterId) });
    } catch (error) { next(error); }
  });
  router.post('/v3/runs/start', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
      const { runId, levelId, previousRunId = null, contentVersion } = req.body ?? {};
      if (typeof runId !== 'string' || !/^[a-zA-Z0-9_-]{8,120}$/.test(runId) || !Number.isSafeInteger(levelId)
        || previousRunId !== null && (typeof previousRunId !== 'string' || !/^[a-zA-Z0-9_-]{8,120}$/.test(previousRunId)) || previousRunId === runId) throw new ApiError(400, 'INVALID_RUN');
      const playerRef = db.collection('players').doc(req.playerId!), runRef = playerRef.collection('runs').doc(runId);
      // Retry a committed start even if the published catalog changed meanwhile.
      const existing = await runRef.get();
      if (existing.exists) {
        const data = existing.data()!;
        const stored = { ...data, map: mapFromDocument(data.map, await loadContent(data.map.contentVersion)) } as StoredRun;
        if (stored.map.id !== levelId || stored.map.contentVersion !== contentVersion || stored.installationId !== req.installationId || stored.previousRunId !== previousRunId) throw new ApiError(409, 'RUN_CONFLICT');
        if (stored.status !== 'active') throw new ApiError(409, 'RUN_FINISHED');
        return res.json({ run: { runId: stored.runId, seed: stored.seed, map: stored.map, assistReduction: stored.assistReduction, attempt: stored.attempt, loadout: stored.loadout, totalExp: stored.totalExp } });
      }
      const { content } = await currentContent();
      if (contentVersion !== content.version) throw new ApiError(409, 'CONTENT_MISMATCH');
      if (levelId < 1 || levelId > content.levelCount) throw new ApiError(400, 'INVALID_RUN');
      const map = await loadMap(content.version, levelId);
      const statsRef = playerRef.collection('mapStats').doc(String(levelId));
      const installationRef = db.collection('installations').doc(req.installationId!);
      const response = await db.runTransaction(async tx => {
        await assertInstallation(req, tx);
        const installation = await tx.get(installationRef);
        const supersededRunId = installation.data()?.activeRunId ?? previousRunId;
        const [player, duplicate, statsDoc, previousDoc] = await Promise.all([tx.get(playerRef), tx.get(runRef), tx.get(statsRef),
          supersededRunId ? tx.get(playerRef.collection('runs').doc(supersededRunId)) : Promise.resolve(null)]);
        const profile = profileFromDocument(player.data(), content);
        if (levelId > highestUnlocked(profile.levels, content)) throw new ApiError(400, 'LEVEL_LOCKED');
        if (duplicate.exists) {
          const data = duplicate.data() as StoredRun;
          if (data.map.id !== levelId || data.installationId !== req.installationId || data.previousRunId !== previousRunId || data.map.contentVersion !== contentVersion) throw new ApiError(409, 'RUN_CONFLICT');
          if (data.status !== 'active') throw new ApiError(409, 'RUN_FINISHED');
          return { ...data, map };
        }
        let stats = { ...emptyMapStats(), bestStars: profile.levels.find(l => l.levelId === levelId)?.stars ?? 0, ...statsDoc.data() } as MapStats;
        const previous = previousDoc?.data() as StoredRun | undefined;
        let previousStatsRef, previousStats;
        if (previous?.status === 'active') {
          if (previous.installationId !== req.installationId) throw new ApiError(409, 'RUN_CONFLICT');
          previousStatsRef = playerRef.collection('mapStats').doc(String(previous.map.id));
          if (previous.map.id === levelId) stats = abandonedStats(stats);
          else previousStats = abandonedStats({ ...emptyMapStats(), ...(await tx.get(previousStatsRef)).data() } as MapStats);
        }
        const run: StoredRun = { runId, seed: randomBytes(4).readUInt32LE() || 1, map,
          assistReduction: assistForFailures(map, stats.consecutiveFailures), attempt: stats.attemptsStarted + 1,
          loadout: profile.loadout, totalExp: profile.totalExp, installationId: req.installationId!, previousRunId, status: 'active', createdAt: Date.now() };
        if (previous?.status === 'active') tx.update(previousDoc!.ref, { status: 'abandoned', finishedAt: Date.now() });
        if (previousStatsRef && previousStats) tx.set(previousStatsRef, previousStats);
        tx.set(statsRef, startedStats(stats));
        tx.create(runRef, { ...run, map: mapToDocument(map) });
        tx.set(installationRef, { activeRunId: runId }, { merge: true });
        return run;
      });
      const { runId: id, seed, map: definition, assistReduction, attempt, loadout, totalExp } = response;
      res.json({ run: { runId: id, seed, map: definition, assistReduction, attempt, loadout, totalExp } });
    } catch (error) { next(error); }
  });
  router.post('/v3/runs/:runId/finish', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
      const runId = String(req.params.runId);
      if (!/^[a-zA-Z0-9_-]{8,120}$/.test(runId)) throw new ApiError(400, 'INVALID_RUN');
      const playerRef = db.collection('players').doc(req.playerId!), runRef = playerRef.collection('runs').doc(runId);
      const stored = await runRef.get();
      if (!stored.exists) throw new ApiError(404, 'RUN_NOT_FOUND');
      const initial = stored.data() as StoredRun;
      const [content, { content: profileContent }] = await Promise.all([loadContent(initial.map.contentVersion), currentContent()]);
      const map = await loadMap(content.version, initial.map.id);
      let report;
      try { report = parseRunReport(req.body, map); } catch { throw new ApiError(400, 'INVALID_RUN_REPORT'); }
      const result = await db.runTransaction(async tx => {
        await assertInstallation(req, tx);
        const statsRef = playerRef.collection('mapStats').doc(String(map.id));
        const installationRef = db.collection('installations').doc(req.installationId!);
        const [player, runDoc, statsDoc, installation] = await Promise.all([tx.get(playerRef), tx.get(runRef), tx.get(statsRef), tx.get(installationRef)]);
        const run = { ...runDoc.data(), map } as StoredRun;
        if (run.installationId !== req.installationId) throw new ApiError(403, 'RUN_CONFLICT');
        if (run.status !== 'active') {
          if (!run.report || JSON.stringify(run.report) !== JSON.stringify(report)) throw new ApiError(409, 'RUN_CONFLICT');
          return { profile: profileFromDocument(player.data(), profileContent), ...run.receipt };
        }
        const completed = completeRun(run, report, { ...emptyMapStats(), ...statsDoc.data() } as MapStats,
          profileFromDocument(player.data(), profileContent), content, profileContent, Date.now());
        tx.update(runRef, { status: report.outcome, report, receipt: completed.receipt, finishedAt: Date.now() });
        tx.set(statsRef, completed.stats);
        if (installation.data()?.activeRunId === runId) tx.set(installationRef, { activeRunId: null }, { merge: true });
        if (report.outcome === 'won') tx.set(playerRef, profileFields(completed.profile, player.data()?.stars, profileContent), { merge: true });
        return { profile: completed.profile, ...completed.receipt };
      });
      res.json(result);
    } catch (error) { next(error); }
  });
  return router;
}
