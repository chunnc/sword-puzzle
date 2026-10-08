import { randomUUID } from "node:crypto";
import express, { NextFunction, Request, Response } from "express";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { defineString } from "firebase-functions/params";
import { verifyAdmobCallback, CallbackFields } from "./domain/admob";
import { ApiError, createIdentityApi, type AuthenticatedRequest } from './identity';
import { highestUnlocked } from './domain/game';
import { currentContent, loadContent } from './content';
import { profileFromDocument, profileFields, parseOperations, processOperations, type OperationReceipt } from './domain/profile';
import { API_TIMEOUT_SECONDS, isTimeoutError } from './timeout';

if (getApps().length === 0) initializeApp();
const db = getFirestore();
const auth = getAuth();
const apiKey = defineString("GAME_AUTH_API_KEY");
const adUnits = defineString("ADMOB_REWARDED_AD_UNITS");

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));
const { router: identityRouter, requireAuth, assertInstallation } = createIdentityApi(db, auth, () => apiKey.value());
app.use(identityRouter);

app.get('/health', (_req, res) => { res.set('Cache-Control', 'no-store').json({ ok: true }); });
app.get('/v1/bootstrap', (_req, _res, next) => next(new ApiError(426, 'CLIENT_UPDATE_REQUIRED')));
app.get('/v2/bootstrap', async (_req, res, next) => {
  try {
    const { config, content } = await currentContent();
    res.set('Cache-Control', 'no-store').json({ contentVersion: content.version, content, levelCount: content.levelCount, rewardedAdsEnabled: config.rewardedAdsEnabled === true, minClientVersion: config.minClientVersion && config.minClientVersion.localeCompare('1.3.0', undefined, { numeric: true }) > 0 ? config.minClientVersion : '1.3.0' });
  } catch (error) { next(error); }
});
app.get('/v2/content/:version', async (req, res, next) => {
  try { res.json(await loadContent(Number(req.params.version))); } catch (error) { next(error); }
});

app.get('/v2/profile', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { content } = await currentContent();
    const ref = db.collection('players').doc(req.playerId!);
    const profile = await db.runTransaction(async tx => {
      await assertInstallation(req, tx);
      const snap = await tx.get(ref);
      if (snap.data()?.mergedInto) throw new ApiError(409, 'GUEST_ALREADY_MERGED');
      const p = profileFromDocument(snap.data(), content);
      tx.set(ref, profileFields(p, snap.data()?.stars, content), { merge: true });
      return p;
    });
    res.json(profile);
  } catch (error) { next(error); }
});

app.post('/v2/profile/sync', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const [{ content: profileContent }, content] = await Promise.all([currentContent(), loadContent(req.body?.contentVersion)]);
    let operations;
    try { operations = parseOperations(req.body?.operations, content); } catch { throw new ApiError(400, 'INVALID_OPERATIONS'); }
    const ref = db.collection('players').doc(req.playerId!);
    const response = await db.runTransaction(async tx => {
      // Read the binding inside the transaction to reject requests racing an account switch.
      await assertInstallation(req, tx);
      // Firestore requires all reads before writes, including operation receipts.
      const [snap, ...receiptSnaps] = await Promise.all([tx.get(ref), ...operations.map(op => tx.get(ref.collection('operations').doc(op.id)))]);
      if (snap.data()?.mergedInto) throw new ApiError(409, 'GUEST_ALREADY_MERGED');
      const receipts = new Map<string, OperationReceipt>();
      receiptSnaps.forEach((s, i) => { if (s.exists) receipts.set(operations[i].id, s.data() as OperationReceipt); });
      const processed = processOperations(profileFromDocument(snap.data(), profileContent), operations, receipts, content, profileContent);
      tx.set(ref, profileFields(processed.profile, snap.data()?.stars, profileContent), { merge: true });
      for (const [id, receipt] of processed.newReceipts) tx.create(ref.collection('operations').doc(id), { ...receipt, createdAt: Date.now() });
      return { profile: processed.profile, acknowledged: processed.acknowledged, rejected: processed.rejected, rewards: processed.rewards };
    });
    res.json(response);
  } catch (error) { next(error); }
});

app.get('/v1/progress', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { content } = await currentContent();
    const snap = await db.collection('players').doc(req.playerId!).get();
    const p = profileFromDocument(snap.data(), content);
    res.json({ levels: p.levels, highestUnlocked: highestUnlocked(p.levels, content) });
  } catch(error) { next(error); }
});
app.put('/v1/progress', (_req, _res, next) => next(new ApiError(426, 'CLIENT_UPDATE_REQUIRED')));

app.post("/v1/ads/intents", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { content } = await currentContent();
    const levelId = Number(req.body?.levelId);
    if (!Number.isInteger(levelId) || levelId < 1 || levelId > content.levelCount || req.body?.placement !== "extra_moves")
      throw new ApiError(400, "INVALID_INTENT");
    const config = await db.collection("gameConfig").doc("current").get();
    if (config.data()?.rewardedAdsEnabled !== true) throw new ApiError(409, "ADS_DISABLED");
    const intentId = randomUUID();
    const expiresAt = Date.now() + 30 * 60 * 1000;
    await db.runTransaction(async tx => {
      await assertInstallation(req, tx);
      const player = await tx.get(db.collection('players').doc(req.playerId!));
      if (levelId > highestUnlocked(profileFromDocument(player.data(), content).levels, content)) throw new ApiError(400, 'LEVEL_LOCKED');
      tx.create(db.collection('adIntents').doc(intentId), { uid: req.playerId, levelId,
        placement: 'extra_moves', status: 'pending', createdAt: Date.now(), expiresAt,
        ttlAt: new Date(expiresAt + 24 * 60 * 60 * 1000) });
    });
    res.status(201).json({ intentId, customData: intentId, expiresAt });
  } catch (error) { next(error); }
});

app.get("/v1/ads/intents/:id", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const snap = await db.collection("adIntents").doc(req.params.id as string).get();
    if (!snap.exists || snap.data()?.uid !== req.playerId) throw new ApiError(404, "INTENT_NOT_FOUND");
    res.json({ status: snap.data()?.status, levelId: snap.data()?.levelId });
  } catch (error) { next(error); }
});

app.get("/v1/ads/admob-ssv", async (req, res, next) => {
  try {
    let callback: CallbackFields;
    try { callback = await verifyAdmobCallback(req.originalUrl,
      adUnits.value().split(",").map(value => value.trim()).filter(Boolean)); }
    catch (error) {
      if (isTimeoutError(error) || error instanceof Error && error.message === "KEY_FETCH_FAILED") throw error;
      throw new ApiError(400, "INVALID_CALLBACK");
    }
    const intentRef = db.collection("adIntents").doc(callback.intentId);
    const transactionRef = db.collection("adTransactions").doc(callback.transactionId);
    await db.runTransaction(async tx => {
      const [intent, previous] = await Promise.all([tx.get(intentRef), tx.get(transactionRef)]);
      if (previous.exists) return;
      const data = intent.data();
      if (!data || data.status !== "pending" || data.expiresAt < Date.now() ||
          callback.rewardItem !== "moves" || callback.rewardAmount !== 3)
        throw new ApiError(400, "INVALID_INTENT");
      tx.create(transactionRef, { intentId: callback.intentId, uid: data.uid, createdAt: Date.now() });
      tx.update(intentRef, { status: "verified", transactionId: callback.transactionId, verifiedAt: Date.now() });
    });
    res.status(200).send("OK");
  } catch (error) { next(error); }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const problem = isTimeoutError(error) ? new ApiError(504, 'TIMEOUT') : error instanceof ApiError ? error : error instanceof Error && error.message === "CONTENT_MISMATCH" ? new ApiError(409, "CONTENT_MISMATCH") : error instanceof Error && error.message === "CONTENT_NOT_CONFIGURED" ? new ApiError(503, "CONTENT_NOT_CONFIGURED") : new ApiError(500, "INTERNAL_ERROR");
  if (problem.status >= 500) console.error("API failure", error);
  res.status(problem.status).json({ error: problem.code });
});

export const gameApi = onRequest({ region: "asia-southeast1", maxInstances: 20, timeoutSeconds: API_TIMEOUT_SECONDS }, app);
