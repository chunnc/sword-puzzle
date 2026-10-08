import { randomUUID, createHash } from "node:crypto";
import express, { NextFunction, Request, Response } from "express";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { defineString } from "firebase-functions/params";
import { verifyAdmobCallback, CallbackFields } from "./domain/admob";
import { highestUnlocked } from './domain/game';
import { currentContent, loadContent } from './content';
import { profileFromDocument, profileFields, mergeProfiles, parseOperations, processOperations, type OperationReceipt } from './domain/profile';

if (getApps().length === 0) initializeApp();
const db = getFirestore();
const auth = getAuth();
const apiKey = defineString("GAME_AUTH_API_KEY");
const adUnits = defineString("ADMOB_REWARDED_AD_UNITS");

type AuthResult = {
  idToken: string; refreshToken: string; expiresIn: string; localId: string; email?: string;
};
type AuthenticatedRequest = Request & { playerId?: string; idToken?: string };

class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "32kb" }));

function replyAuth(res: Response, result: AuthResult, isGuest: boolean): void {
  res.json({ uid: result.localId, idToken: result.idToken, refreshToken: result.refreshToken,
    expiresIn: Number(result.expiresIn), isGuest });
}

async function identity(path: string, body: Record<string, unknown>): Promise<AuthResult> {
  const base = process.env.FIREBASE_AUTH_EMULATOR_HOST
    ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`
    : "https://identitytoolkit.googleapis.com/v1";
  const response = await fetch(`${base}/${path}?key=${encodeURIComponent(apiKey.value())}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const data = await response.json() as AuthResult & { error?: { message?: string } };
  if (!response.ok) {
    const reason = data.error?.message?.split(" : ")[0] || "AUTH_FAILED";
    const code = ["EMAIL_EXISTS", "INVALID_EMAIL", "WEAK_PASSWORD", "INVALID_PASSWORD", "EMAIL_NOT_FOUND"].includes(reason)
      ? reason : "AUTH_FAILED";
    throw new ApiError(response.status === 400 ? 400 : 502, code);
  }
  return data;
}

async function refreshIdentity(refreshToken: string): Promise<AuthResult> {
  const base = process.env.FIREBASE_AUTH_EMULATOR_HOST
    ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/securetoken.googleapis.com/v1`
    : "https://securetoken.googleapis.com/v1";
  const response = await fetch(`${base}/token?key=${encodeURIComponent(apiKey.value())}`,
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }), signal: AbortSignal.timeout(10000) });
  const data = await response.json() as { id_token?: string; refresh_token?: string; expires_in?: string; user_id?: string };
  if (!response.ok) throw new ApiError(response.status === 400 || response.status === 401 ? 401 : 502, response.status === 400 || response.status === 401 ? "INVALID_SESSION" : "AUTH_UNAVAILABLE");
  if (!data.id_token || !data.refresh_token || !data.user_id) throw new ApiError(502, "AUTH_UNAVAILABLE");
  return { idToken: data.id_token, refreshToken: data.refresh_token, localId: data.user_id,
    expiresIn: data.expires_in || "3600" };
}

function bearer(req: Request): string | undefined {
  const value = req.header("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7) : undefined;
}

async function requireAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = bearer(req);
    if (!token) throw new ApiError(401, "AUTH_REQUIRED");
    const decoded = await auth.verifyIdToken(token);
    req.playerId = decoded.uid;
    req.idToken = token;
    next();
  } catch { next(new ApiError(401, "INVALID_SESSION")); }
}

async function limitAuth(req: Request, kind: string, limit: number): Promise<void> {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const address = req.ip || "unknown";
  const id = createHash("sha256").update(`${kind}:${address}:${email}`).digest("hex");
  const ref = db.collection("authThrottle").doc(id);
  const now = Date.now();
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const current = snap.data() as { startsAt?: number; count?: number } | undefined;
    const fresh = !current?.startsAt || now - current.startsAt > 15 * 60 * 1000;
    const count = fresh ? 1 : (current.count || 0) + 1;
    if (count > limit) throw new ApiError(429, "TOO_MANY_ATTEMPTS");
    tx.set(ref, { startsAt: fresh ? now : current!.startsAt, count, expiresAt: new Date(now + 60 * 60 * 1000) });
  });
}

function emailPassword(req: Request): { email: string; password: string } {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8 || password.length > 128)
    throw new ApiError(400, "INVALID_CREDENTIALS");
  return { email, password };
}

async function ensurePlayer(uid: string): Promise<void> {
  const { content } = await currentContent();
  const ref = db.collection("players").doc(uid);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) tx.create(ref, { ...profileFields(profileFromDocument(undefined, content), {}, content), createdAt: Date.now() });
  });
}

app.post("/v1/auth/guest", async (req, res, next) => {
  try {
    await limitAuth(req, "guest", 30);
    const result = await identity("accounts:signUp", { returnSecureToken: true });
    await ensurePlayer(result.localId);
    replyAuth(res, result, true);
  } catch (error) { next(error); }
});

app.post("/v1/auth/register", async (req, res, next) => {
  try {
    await limitAuth(req, "register", 8);
    const credentials = emailPassword(req);
    const token = bearer(req);
    let result: AuthResult;
    if (token) {
      let user;
      try { user = await auth.verifyIdToken(token); }
      catch { throw new ApiError(401, "INVALID_SESSION"); }
      if (user.email) throw new ApiError(409, "ALREADY_REGISTERED");
      result = await identity("accounts:update", { idToken: token, ...credentials, returnSecureToken: true });
    } else {
      result = await identity("accounts:signUp", { ...credentials, returnSecureToken: true });
    }
    await ensurePlayer(result.localId);
    replyAuth(res, result, false);
  } catch (error) { next(error); }
});

app.post("/v1/auth/login", async (req, res, next) => {
  try {
    await limitAuth(req, "login", 10);
    const result = await identity("accounts:signInWithPassword", { ...emailPassword(req), returnSecureToken: true });
    await ensurePlayer(result.localId);
    const guestToken = bearer(req);
    if (guestToken) {
      let guest;
      try { guest = await auth.verifyIdToken(guestToken); }
      catch { throw new ApiError(401, "INVALID_SESSION"); }
      if (guest.uid !== result.localId && !guest.email) {
        const { content } = await currentContent();
        const guestRef = db.collection("players").doc(guest.uid);
        const targetRef = db.collection("players").doc(result.localId);
        await db.runTransaction(async tx => {
          const [guestSnap, targetSnap] = await Promise.all([tx.get(guestRef), tx.get(targetRef)]);
          const guestData = guestSnap.data();
          if (guestData?.mergedInto) {
            if (guestData.mergedInto !== result.localId) throw new ApiError(409, "GUEST_ALREADY_MERGED");
            return;
          }
          const combined = mergeProfiles(profileFromDocument(guestData, content), profileFromDocument(targetSnap.data(), content), content);
          tx.set(targetRef, profileFields(combined, targetSnap.data()?.stars, content), { merge: true });
          tx.set(guestRef, { mergedInto: result.localId, updatedAt: Date.now() }, { merge: true });
        });
      }
    }
    replyAuth(res, result, false);
  } catch (error) { next(error); }
});

app.post("/v1/auth/refresh", async (req, res, next) => {
  try {
    const token = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
    if (!token) throw new ApiError(400, "INVALID_SESSION");
    const result = await refreshIdentity(token);
    let user;
    try { user = await auth.getUser(result.localId); }
    catch(error) { if ((error as {code?:string}).code === 'auth/user-not-found') throw new ApiError(401, 'INVALID_SESSION'); throw error; }
    if(user.disabled)throw new ApiError(401, 'INVALID_SESSION');
    replyAuth(res, result, !user.email);
  } catch (error) { next(error); }
});

app.get('/health', (_req, res) => { res.set('Cache-Control', 'no-store').json({ ok: true }); });
app.get('/v1/bootstrap', (_req, _res, next) => next(new ApiError(426, 'CLIENT_UPDATE_REQUIRED')));
app.get('/v2/bootstrap', async (_req, res, next) => {
  try {
    const { config, content } = await currentContent();
    res.set('Cache-Control', 'no-store').json({ contentVersion: content.version, content, levelCount: content.levelCount, rewardedAdsEnabled: config.rewardedAdsEnabled === true, minClientVersion: config.minClientVersion || '1.2.0' });
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
    const player = await db.collection("players").doc(req.playerId!).get();
    if (levelId > highestUnlocked(profileFromDocument(player.data(), content).levels, content)) throw new ApiError(400, "LEVEL_LOCKED");
    const intentId = randomUUID();
    const expiresAt = Date.now() + 30 * 60 * 1000;
    await db.collection("adIntents").doc(intentId).create({ uid: req.playerId, levelId,
      placement: "extra_moves", status: "pending", createdAt: Date.now(), expiresAt,
      ttlAt: new Date(expiresAt + 24 * 60 * 60 * 1000) });
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
      if (error instanceof Error && error.message === "KEY_FETCH_FAILED") throw error;
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
  const problem = error instanceof ApiError ? error : error instanceof Error && error.message === "CONTENT_MISMATCH" ? new ApiError(409, "CONTENT_MISMATCH") : error instanceof Error && error.message === "CONTENT_NOT_CONFIGURED" ? new ApiError(503, "CONTENT_NOT_CONFIGURED") : new ApiError(500, "INTERNAL_ERROR");
  if (problem.status >= 500) console.error("API failure", error);
  res.status(problem.status).json({ error: problem.code });
});

export const gameApi = onRequest({ region: "asia-southeast1", maxInstances: 20 }, app);
