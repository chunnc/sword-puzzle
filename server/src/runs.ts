import { randomBytes } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { ApiError, type AuthenticatedRequest } from './identity';
import { chapterMaps, latestChapterMaps, currentContent, loadContent } from './content';
import { contentWire, highestUnlocked, mapFromDocument, mapResourceFromDocument, mapToDocument, versionMap, type GameContent } from './domain/game';
import { profileFields, profileFromDocument } from './domain/profile';
import { abandonedStats, assistForFailures, completeRun, emptyMapStats, parseRunReport, startedStats, type MapStats, type StoredRun } from './domain/runs';

export function createRunsRouter(db: Firestore, requireAuth: RequestHandler, assertInstallation: (req: AuthenticatedRequest, tx: Transaction) => Promise<unknown>) {
  const router = Router();
  router.get('/v3/bootstrap', async (_req, res, next) => {
    try {
      const { config, content } = await currentContent();
      if (!content.layoutCodes) throw new ApiError(503, 'CONTENT_NOT_CONFIGURED');
      res.set('Cache-Control', 'no-store').json({ contentVersion: content.version, catalogRevision: config.catalogRevision ?? 0, content: contentWire(content), levelCount: content.levelCount,
        rewardedAdsEnabled: config.rewardedAdsEnabled === true, minClientVersion: config.minClientVersion ?? '1.4.0' });
    } catch (error) { next(error); }
  });
  router.get('/v4/chapters/:chapterId/maps', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
      const { content, config } = await currentContent(), chapterId = String(req.params.chapterId);
      const chapter = content.chapters?.find(c => c.id === chapterId);
      if (!chapter) throw new ApiError(404, 'INVALID_CHAPTER');
      const player = await db.collection('players').doc(req.playerId!).get();
      if (chapter.firstLevelId > highestUnlocked(profileFromDocument(player.data(), content).levels, content)) throw new ApiError(403, 'CHAPTER_LOCKED');
      res.set('Cache-Control', 'no-store').json({ contentVersion: content.version, catalogRevision: config.catalogRevision ?? 0, chapterId, maps: await latestChapterMaps(content, chapterId) });
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
  router.post(['/v3/runs/start', '/v4/runs/start'], requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
      const { runId, levelId, previousRunId = null, contentVersion } = req.body ?? {};
      if (typeof runId !== 'string' || !/^[a-zA-Z0-9_-]{8,120}$/.test(runId) || !Number.isSafeInteger(levelId)
        || previousRunId !== null && (typeof previousRunId !== 'string' || !/^[a-zA-Z0-9_-]{8,120}$/.test(previousRunId)) || previousRunId === runId) throw new ApiError(400, 'INVALID_RUN');
      const playerRef = db.collection('players').doc(req.playerId!), runRef = playerRef.collection('runs').doc(runId);
      const serverSelected = req.path.toLowerCase().startsWith('/v4/');
      const statsRef = playerRef.collection('mapStats').doc(String(levelId));
      const installationRef = db.collection('installations').doc(req.installationId!);
      const response = await db.runTransaction(async tx => {
        await assertInstallation(req, tx);
        const duplicate = await tx.get(runRef);
        if (duplicate.exists) {
          const data = duplicate.data()!;
          const content = await loadContent(data.configVersion ?? data.map.contentVersion);
          const stored = { ...data, map: mapFromDocument(data.map, content) } as StoredRun;
          if (stored.map.id !== levelId || stored.installationId !== req.installationId || stored.previousRunId !== previousRunId
            || !serverSelected && content.version !== contentVersion) throw new ApiError(409, 'RUN_CONFLICT');
          if (stored.status !== 'active') throw new ApiError(409, 'RUN_FINISHED');
          return { run: stored, content };
        }
        // Mutable pointers are in the read set: a concurrent publish retries selection.
        const settings = (await tx.get(db.collection('gameConfig').doc('current'))).data();
        if (!settings?.contentVersion) throw new ApiError(503, 'CONTENT_NOT_CONFIGURED');
        const content = await loadContent(settings?.contentVersion);
        if (!serverSelected && contentVersion !== content.version) throw new ApiError(409, 'CONTENT_MISMATCH');
        if (levelId < 1 || levelId > content.levelCount) throw new ApiError(400, 'INVALID_RUN');
        const resource = await tx.get(db.collection('gameMaps').doc(String(levelId)));
        let map;
        if (resource.exists) {
          if (serverSelected) map = mapResourceFromDocument(resource.data(), content);
          else {
            const entry = resource.data()!.versions.filter((m: any) => m.contentVersion === content.version).sort((a: any,b: any) => b.mapVersion-a.mapVersion)[0];
            if (!entry) throw new ApiError(404, 'MAP_NOT_FOUND');
            map = mapFromDocument(entry, content);
          }
        } else {
          const legacy = await tx.get(db.collection('gameMaps').doc(`${content.version}_${levelId}`));
          if (!legacy.exists) throw new ApiError(404, 'MAP_NOT_FOUND');
          map = versionMap(mapFromDocument(legacy.data(), content), content);
        }
        if (map.id !== levelId) throw new Error('INVALID_MAP_RESOURCE');
        const installation = await tx.get(installationRef);
        const supersededRunId = installation.data()?.activeRunId ?? previousRunId;
        const [player, statsDoc, previousDoc] = await Promise.all([tx.get(playerRef), tx.get(statsRef),
          supersededRunId ? tx.get(playerRef.collection('runs').doc(supersededRunId)) : Promise.resolve(null)]);
        const profile = profileFromDocument(player.data(), content);
        if (levelId > highestUnlocked(profile.levels, content)) throw new ApiError(400, 'LEVEL_LOCKED');
        let stats = { ...emptyMapStats(), bestStars: profile.levels.find(l => l.levelId === levelId)?.stars ?? 0, ...statsDoc.data() } as MapStats;
        const previous = previousDoc?.data() as StoredRun | undefined;
        let previousStatsRef, previousStats;
        if (previous?.status === 'active') {
          if (previous.installationId !== req.installationId) throw new ApiError(409, 'RUN_CONFLICT');
          previousStatsRef = playerRef.collection('mapStats').doc(String(previous.map.id));
          if (previous.map.id === levelId) stats = abandonedStats(stats);
          else previousStats = abandonedStats({ ...emptyMapStats(), ...(await tx.get(previousStatsRef)).data() } as MapStats);
        }
        const run: StoredRun = { runId, mapVersion: map.mapVersion ?? map.contentVersion, configVersion: content.version, seed: randomBytes(4).readUInt32LE() || 1, map,
          assistReduction: assistForFailures(map, stats.consecutiveFailures), attempt: stats.attemptsStarted + 1,
          loadout: profile.loadout, totalExp: profile.totalExp, installationId: req.installationId!, previousRunId, status: 'active', createdAt: Date.now() };
        if (previous?.status === 'active') tx.update(previousDoc!.ref, { status: 'abandoned', finishedAt: Date.now() });
        if (previousStatsRef && previousStats) tx.set(previousStatsRef, previousStats);
        tx.set(statsRef, startedStats(stats));
        tx.create(runRef, { ...run, map: mapToDocument(map) });
        tx.set(installationRef, { activeRunId: runId }, { merge: true });
        return { run, content };
      });
      res.json(startResponse(response.run, response.content));
    } catch (error) { next(error); }
  });
  router.post(['/v3/runs/:runId/finish', '/v4/runs/:runId/finish'], requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
      const runId = String(req.params.runId);
      if (!/^[a-zA-Z0-9_-]{8,120}$/.test(runId)) throw new ApiError(400, 'INVALID_RUN');
      const playerRef = db.collection('players').doc(req.playerId!), runRef = playerRef.collection('runs').doc(runId);
      const stored = await runRef.get();
      if (!stored.exists) throw new ApiError(404, 'RUN_NOT_FOUND');
      const initial = stored.data() as StoredRun;
      const [content, { content: profileContent }] = await Promise.all([loadContent(initial.configVersion ?? initial.map.contentVersion), currentContent()]);
      const map = mapFromDocument(initial.map, content);
      if (initial.mapVersion !== undefined && initial.mapVersion !== (map.mapVersion ?? map.contentVersion)) throw new ApiError(409, 'RUN_CONFLICT');
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
          if (!run.report || JSON.stringify(parseRunReport(run.report, map)) !== JSON.stringify(report)) throw new ApiError(409, 'RUN_CONFLICT');
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
      res.json({ ...result, profileConfig: contentWire(profileContent) });
    } catch (error) { next(error); }
  });
  return router;
}
function startResponse(run: StoredRun, content: GameContent) {
  const { runId, seed, assistReduction, attempt, loadout, totalExp } = run;
  // A committed legacy start may be recovered by an upgraded client. Materialize
  // revision metadata without changing its actual layout, rules, seed or context.
  const map = run.map.mapVersion === undefined ? versionMap(run.map, content, run.mapVersion ?? run.map.contentVersion) : run.map;
  return { run: { runId, mapVersion: run.mapVersion ?? map.mapVersion ?? map.contentVersion, configVersion: run.configVersion ?? content.version,
    seed, map, assistReduction, attempt, loadout, totalExp }, config: contentWire(content) };
}
