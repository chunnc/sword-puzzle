import { createHash, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Auth, DecodedIdToken, UserRecord } from 'firebase-admin/auth';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { currentContent } from './content';
import { profileFields, profileFromDocument } from './domain/profile';
import { API_TIMEOUT_MS, isTimeoutError } from './timeout';

export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export type AuthenticatedRequest = Request & {
  playerId?: string; idToken?: string; installationId?: string; bindingVersion?: number;
};
type AuthResult = { idToken: string; refreshToken: string; expiresIn: string; localId: string };
type Installation = {
  secretHash: string; playerUid: string; bindingVersion: number; status: 'active' | 'revoked';
  authValidAfter: number; isGuest: boolean; createdAt: number; updatedAt: number;
  registration?: { id: string; email: string };
};
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const validAfter = (user: UserRecord) => Date.parse(user.tokensValidAfterTime || '') || 0;
const bearer = (req: Request) => req.header('authorization')?.replace(/^Bearer /, '');

export function createIdentityApi(db: Firestore, auth: Auth, apiKey: () => string) {
  const router = Router();
  const refFor = (id: string) => db.collection('installations').doc(id);
  async function userFor(uid: string): Promise<UserRecord> {
    try {
      const user = await auth.getUser(uid);
      if (user.disabled) throw new ApiError(403, 'ACCOUNT_DISABLED');
      return user;
    } catch (error) {
      if ((error as { code?: string }).code === 'auth/user-not-found') throw new ApiError(403, 'ACCOUNT_DELETED');
      throw error;
    }
  }
  async function verify(token: string): Promise<DecodedIdToken> {
    try { return await auth.verifyIdToken(token, true); }
    catch (error) {
      if (isTimeoutError(error)) throw error;
      if ((error as { code?: string }).code === 'auth/internal-error') throw new ApiError(503, 'AUTH_UNAVAILABLE');
      throw new ApiError(401, 'INVALID_SESSION');
    }
  }
  async function identity(path: string, body: Record<string, unknown>): Promise<AuthResult> {
    const base = process.env.FIREBASE_AUTH_EMULATOR_HOST
      ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`
      : 'https://identitytoolkit.googleapis.com/v1';
    const response = await fetch(`${base}/${path}?key=${encodeURIComponent(apiKey())}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(API_TIMEOUT_MS)
    });
    if (response.status === 504) throw new ApiError(504, 'TIMEOUT');
    const data = await response.json() as AuthResult & { error?: { message?: string } };
    if (!response.ok) {
      const reason = data.error?.message?.split(' : ')[0] || 'AUTH_FAILED';
      const codes: Record<string, string> = { INVALID_LOGIN_CREDENTIALS: 'INVALID_PASSWORD', USER_DISABLED: 'ACCOUNT_DISABLED' };
      const safe = ['EMAIL_EXISTS', 'INVALID_EMAIL', 'WEAK_PASSWORD', 'INVALID_PASSWORD', 'EMAIL_NOT_FOUND'].includes(reason);
      throw new ApiError(response.status >= 500 ? 503 : 400, codes[reason] || (safe ? reason : 'AUTH_FAILED'));
    }
    return data;
  }
  async function refreshIdentity(refreshToken: string): Promise<AuthResult> {
    const base = process.env.FIREBASE_AUTH_EMULATOR_HOST
      ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/securetoken.googleapis.com/v1`
      : 'https://securetoken.googleapis.com/v1';
    const response = await fetch(`${base}/token?key=${encodeURIComponent(apiKey())}`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }), signal: AbortSignal.timeout(API_TIMEOUT_MS)
    });
    if (response.status === 504) throw new ApiError(504, 'TIMEOUT');
    const data = await response.json() as { id_token?: string; refresh_token?: string; user_id?: string; expires_in?: string };
    if (!response.ok) throw new ApiError(response.status < 500 ? 401 : 503, response.status < 500 ? 'INVALID_SESSION' : 'AUTH_UNAVAILABLE');
    if (!data.id_token || !data.refresh_token || !data.user_id) throw new ApiError(503, 'AUTH_UNAVAILABLE');
    return { idToken: data.id_token, refreshToken: data.refresh_token, localId: data.user_id, expiresIn: data.expires_in || '3600' };
  }
  async function limitAuth(req: Request, kind: string, limit: number) {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const ref = db.collection('authThrottle').doc(digest(`${kind}:${req.ip || 'unknown'}:${email}`));
    const now = Date.now();
    await db.runTransaction(async tx => {
      const data = (await tx.get(ref)).data();
      const fresh = !data?.startsAt || now - data.startsAt > 15 * 60 * 1000;
      const count = fresh ? 1 : (data.count || 0) + 1;
      if (count > limit) throw new ApiError(429, 'TOO_MANY_ATTEMPTS');
      tx.set(ref, { startsAt: fresh ? now : data!.startsAt, count, expiresAt: new Date(now + 3600000) });
    });
  }
  function deviceInput(req: Request) {
    const { installationId, secret } = req.body || {};
    if (typeof installationId !== 'string' || !/^[a-f0-9]{32}$/.test(installationId) ||
        typeof secret !== 'string' || !/^[a-f0-9]{64}$/.test(secret)) throw new ApiError(400, 'INVALID_DEVICE');
    return { installationId, secret };
  }
  function checkSecret(data: Installation | undefined, secret: string): asserts data is Installation {
    if (!data || typeof data.secretHash !== 'string' || data.secretHash.length !== 64 ||
        !timingSafeEqual(Buffer.from(data.secretHash), Buffer.from(digest(secret)))) throw new ApiError(403, 'DEVICE_KEY_INVALID');
    if (data.status !== 'active') throw new ApiError(403, 'DEVICE_REVOKED');
  }
  function credentials(req: Request) {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8 || password.length > 128)
      throw new ApiError(400, 'INVALID_CREDENTIALS');
    return { email, password };
  }
  function operationInput(req: Request) {
    const { operationId, expectedBindingVersion } = req.body || {};
    if (typeof operationId !== 'string' || !/^[a-zA-Z0-9_-]{8,120}$/.test(operationId) ||
        !Number.isSafeInteger(expectedBindingVersion) || expectedBindingVersion < 1) throw new ApiError(400, 'INVALID_IDENTITY_OPERATION');
    return { operationId, expectedBindingVersion };
  }
  async function ensureGuest(uid: string) {
    try { await auth.createUser({ uid }); }
    catch (error) { if ((error as { code?: string }).code !== 'auth/uid-already-exists') throw error; }
    return userFor(uid);
  }
  async function ensurePlayer(uid: string) {
    const { content } = await currentContent();
    const ref = db.collection('players').doc(uid);
    await db.runTransaction(async tx => {
      if (!(await tx.get(ref)).exists) tx.create(ref, { ...profileFields(profileFromDocument(undefined, content), {}, content), createdAt: Date.now() });
    });
  }
  async function assertInstallation(req: AuthenticatedRequest, tx?: Transaction) {
    if (!req.installationId || !req.bindingVersion || !req.playerId) throw new ApiError(426, 'DEVICE_BINDING_REQUIRED');
    const snap = tx ? await tx.get(refFor(req.installationId)) : await refFor(req.installationId).get();
    const data = snap.data() as Installation | undefined;
    if (!data || data.status !== 'active' || data.playerUid !== req.playerId || data.bindingVersion !== req.bindingVersion)
      throw new ApiError(401, 'DEVICE_BINDING_CHANGED');
    return data;
  }
  async function requireAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
    try {
      const token = bearer(req);
      if (!token) throw new ApiError(401, 'INVALID_SESSION');
      const decoded = await verify(token);
      req.playerId = decoded.uid; req.idToken = token;
      req.installationId = decoded.installationId; req.bindingVersion = decoded.bindingVersion;
      await assertInstallation(req);
      next();
    } catch (error) { next(error); }
  }
  async function session(id: string, data: Installation) {
    const user = await userFor(data.playerUid);
    if (validAfter(user) > data.authValidAfter) throw new ApiError(403, 'DEVICE_REAUTH_REQUIRED');
    await ensurePlayer(user.uid);
    const custom = await auth.createCustomToken(user.uid, { installationId: id, bindingVersion: data.bindingVersion });
    const result = await identity('accounts:signInWithCustomToken', { token: custom, returnSecureToken: true });
    return { uid: user.uid, idToken: result.idToken, refreshToken: result.refreshToken,
      expiresIn: Number(result.expiresIn), isGuest: !user.email, email: user.email,
      installationId: id, bindingVersion: data.bindingVersion };
  }
  async function binding(req: Request) {
    const { installationId, secret } = deviceInput(req);
    const data = (await refFor(installationId).get()).data() as Installation | undefined;
    checkSecret(data, secret);
    return { installationId, secret, data };
  }
  async function rebind(req: Request, kind: string, target: UserRecord) {
    const { installationId, secret } = deviceInput(req);
    const { operationId, expectedBindingVersion } = operationInput(req);
    const ref = refFor(installationId), receipt = ref.collection('operations').doc(operationId);
    await ensurePlayer(target.uid);
    return db.runTransaction(async tx => {
      const [snap, previous] = await Promise.all([tx.get(ref), tx.get(receipt)]);
      const data = snap.data() as Installation | undefined;
      checkSecret(data, secret);
      if (previous.exists) {
        const p = previous.data()!;
        if (p.kind !== kind || p.targetUid !== target.uid) throw new ApiError(409, 'OPERATION_CONFLICT');
        if (p.bindingVersion !== data.bindingVersion || data.playerUid !== target.uid) throw new ApiError(409, 'OPERATION_SUPERSEDED');
        return data;
      }
      if (data.bindingVersion !== expectedBindingVersion) throw new ApiError(409, 'DEVICE_BINDING_CHANGED');
      const completesRegistration = kind === 'login' && data.registration?.email === target.email && data.playerUid === target.uid;
      if (data.registration && !completesRegistration && (kind !== 'register' || data.registration.id !== operationId)) throw new ApiError(409, 'IDENTITY_OPERATION_PENDING');
      if (req.body.preserveOwnerId && req.body.preserveOwnerId !== target.uid) throw new ApiError(409, 'PROFILE_OWNER_MISMATCH');
      if (data.playerUid !== target.uid && data.isGuest && req.body.confirmedDiscardGuest !== true) throw new ApiError(409, 'GUEST_DISCARD_CONFIRMATION_REQUIRED');
      const next: Installation = { ...data, playerUid: target.uid, isGuest: !target.email,
        bindingVersion: data.bindingVersion + 1, authValidAfter: validAfter(target), updatedAt: Date.now() };
      delete next.registration;
      tx.set(ref, next);
      tx.create(receipt, { kind, targetUid: target.uid, bindingVersion: next.bindingVersion, createdAt: Date.now() });
      return next;
    });
  }
  const route = (path: string, handler: (req: Request) => Promise<unknown>) => router.post(path, async (req, res, next) => {
    try { res.set('Cache-Control', 'no-store').json(await handler(req)); } catch (error) { next(error); }
  });
  route('/v2/auth/device-session', async req => {
    const { installationId, secret } = deviceInput(req);
    const ref = refFor(installationId);
    let existing = (await ref.get()).data() as Installation | undefined;
    if (existing) {
      checkSecret(existing, secret);
      return session(installationId, existing);
    }
    if (req.body.requireExisting === true) throw new ApiError(403, 'DEVICE_KEY_MISSING');
    const oldToken = bearer(req);
    let user: UserRecord;
    if (oldToken) {
      const old = await verify(oldToken);
      if (old.installationId) throw new ApiError(409, 'DEVICE_ALREADY_BOUND');
      user = await userFor(old.uid);
    } else {
      // A proven legacy identity is migrating, not creating a new guest.
      // Rate limiting before verification can prevent even refreshing an expired legacy token.
      await limitAuth(req, 'device', 30);
      user = await ensureGuest(`guest_${installationId}`);
    }
    await ensurePlayer(user.uid);
    const data: Installation = { secretHash: digest(secret), playerUid: user.uid, bindingVersion: 1,
      status: 'active', isGuest: !user.email, authValidAfter: validAfter(user), createdAt: Date.now(), updatedAt: Date.now() };
    const bound = await db.runTransaction(async tx => {
      const previous = (await tx.get(ref)).data() as Installation | undefined;
      if (previous) { checkSecret(previous, secret); return previous; }
      tx.create(ref, data); return data;
    });
    return session(installationId, bound);
  });
  route('/v2/auth/login', async req => {
    await limitAuth(req, 'login', 10);
    const { installationId } = await binding(req);
    const result = await identity('accounts:signInWithPassword', { ...credentials(req), returnSecureToken: true });
    return session(installationId, await rebind(req, 'login', await userFor(result.localId)));
  });
  route('/v2/auth/register', async req => {
    await limitAuth(req, 'register', 8);
    const { installationId, secret, data: initial } = await binding(req);
    const { operationId, expectedBindingVersion } = operationInput(req);
    const input = credentials(req), ref = refFor(installationId);
    const owner = await userFor(initial.playerUid);
    // A device key alone must never bypass account/session revocation.
    if (!owner.email && validAfter(owner) > initial.authValidAfter) throw new ApiError(403, 'DEVICE_REAUTH_REQUIRED');
    const reserved = await db.runTransaction(async tx => {
      const data = (await tx.get(ref)).data() as Installation | undefined;
      checkSecret(data, secret);
      if (data.bindingVersion !== expectedBindingVersion) {
        const receipt = await tx.get(ref.collection('operations').doc(operationId));
        if (receipt.data()?.kind === 'register' && receipt.data()?.bindingVersion === data.bindingVersion) return data;
        throw new ApiError(409, 'DEVICE_BINDING_CHANGED');
      }
      if (data.registration && (data.registration.id !== operationId || data.registration.email !== input.email)) throw new ApiError(409, 'IDENTITY_OPERATION_PENDING');
      if (!data.isGuest) throw new ApiError(409, 'ALREADY_REGISTERED');
      const next = { ...data, registration: { id: operationId, email: input.email } };
      tx.set(ref, next); return next;
    });
    let user = await userFor(reserved.playerUid);
    if (!user.email) {
      try { user = await auth.updateUser(user.uid, input); }
      catch (error) {
        // A timed-out update may have committed; keep the registration reservation for recovery.
        if (isTimeoutError(error)) throw error;
        await db.runTransaction(async tx => {
          const data = (await tx.get(ref)).data() as Installation | undefined;
          if (data?.registration?.id === operationId) { const next = { ...data }; delete next.registration; tx.set(ref, next); }
        });
        const code = (error as { code?: string }).code;
        throw new ApiError(400, code === 'auth/email-already-exists' ? 'EMAIL_EXISTS' : 'AUTH_FAILED');
      }
    } else {
      if (user.email !== input.email) throw new ApiError(409, 'ALREADY_REGISTERED');
      await identity('accounts:signInWithPassword', { ...input, returnSecureToken: true });
    }
    return session(installationId, await rebind(req, 'register', user));
  });
  route('/v2/auth/logout', async req => {
    const { installationId } = await binding(req);
    const { operationId } = operationInput(req);
    await limitAuth(req, 'logout', 30);
    const target = await ensureGuest(`guest_${digest(`${installationId}:${operationId}`).slice(0, 40)}`);
    return session(installationId, await rebind(req, 'logout', target));
  });
  route('/v2/auth/refresh', async req => {
    const token = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '';
    if (!token) throw new ApiError(401, 'INVALID_SESSION');
    const result = await refreshIdentity(token), decoded = await verify(result.idToken);
    const request = { playerId: decoded.uid, installationId: decoded.installationId, bindingVersion: decoded.bindingVersion } as AuthenticatedRequest;
    await assertInstallation(request);
    const user = await userFor(decoded.uid);
    return { uid: user.uid, ...result, expiresIn: Number(result.expiresIn), isGuest: !user.email, email: user.email,
      installationId: decoded.installationId, bindingVersion: decoded.bindingVersion };
  });
  // Migration only: old refresh credentials can be adopted by device-session.
  route('/v1/auth/refresh', async req => {
    const token = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '';
    if (!token) throw new ApiError(401, 'INVALID_SESSION');
    const result = await refreshIdentity(token), decoded = await verify(result.idToken);
    if (decoded.installationId) throw new ApiError(426, 'CLIENT_UPDATE_REQUIRED');
    const user = await userFor(decoded.uid);
    return { uid: user.uid, ...result, expiresIn: Number(result.expiresIn), isGuest: !user.email };
  });
  for (const path of ['guest', 'login', 'register']) route(`/v1/auth/${path}`, async () => { throw new ApiError(426, 'CLIENT_UPDATE_REQUIRED'); });
  return { router, requireAuth, assertInstallation };
}
