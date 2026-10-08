import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { Alert } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { getCurrentSession, saveSession, clearSession } from './session';
import { forgetDeviceCacheForTesting } from './device';
import { loadDeviceIdentity } from './device';
import { clearSave } from '../game/save';

// No production UI or production backend can activate this bridge.
export function installAcceptanceBridge() {
  if (!__DEV__ || process.env.EXPO_PUBLIC_ACCEPTANCE_TEST !== '1' ||
      !/^http:\/\/127\.0\.0\.1:8787$/.test(process.env.EXPO_PUBLIC_GAME_API_URL || '')) return;
  const state = () => {
    const s = useGameStore.getState(), session = getCurrentSession();
    return { uid: session?.uid, installationId: session?.installationId, bindingVersion: session?.bindingVersion,
      isGuest: session?.isGuest, email: session?.email, initialized: s.initialized, online: s.online,
      authRequired: s.authRequired, bootError: s.bootError, notice: s.notice,
      profile: s.save.profile, active: s.save.active ? { runId: s.save.active.runId, levelId: s.save.active.levelId,
        moves: s.save.active.moves, objectiveProgress: s.save.active.objectiveProgress,
        signature: JSON.stringify(s.save.active).split('').reduce((hash, c) => ((hash * 31) + c.charCodeAt(0)) | 0, 0) } : null, pending: s.save.pending };
  };
  let remembered = getCurrentSession();
  let latestAlert: { title: string; message?: string; buttons?: Parameters<typeof Alert.alert>[2] } | null = null;
  const originalAlert = Alert.alert;
  Alert.alert = (title, message, buttons, options) => {
    latestAlert = { title, message, buttons };
    originalAlert(title, message, buttons, options);
  };
  (globalThis as any).__swordAcceptance = {
    state,
    async storageStatus() {
      try { await SecureStore.getItemAsync('kiem-khai-session'); return { readable: true }; }
      catch (error) { return { readable: false, error: String(error) }; }
    },
    alert() { return latestAlert ? { title: latestAlert.title, message: latestAlert.message, buttons: latestAlert.buttons?.map(b => b.text) } : null; },
    chooseAlert(text: string) { const button = latestAlert?.buttons?.find(b => b.text === text); if (!button) throw new Error('Alert action unavailable'); button.onPress?.(); return true; },
    async expire(refreshAlso = false) {
      const current = getCurrentSession();
      if (!current) throw new Error('No session');
      await saveSession({ ...current, idToken: 'acceptance-expired-token', ...(refreshAlso ? { refreshToken: 'acceptance-invalid-refresh' } : {}) });
    },
    async recover() {
      useGameStore.setState({ online: false });
      await useGameStore.getState().checkConnection();
      return state();
    },
    async fresh() { await useGameStore.getState().startFreshGuest(); router.replace('/map'); return state(); },
    async register(email: string, password: string) { await useGameStore.getState().register(email, password); return state(); },
    async login(email: string, password: string, confirmed = false) { await useGameStore.getState().login(email, password, confirmed); return state(); },
    async logout() { await useGameStore.getState().logout(); router.replace('/map'); return state(); },
    async start(levelId = 1) { await useGameStore.getState().startLevel(levelId); router.replace(`/game/${levelId}`); return state(); },
    async purchase(category: 'skill' | 'sword', id: string) { await useGameStore.getState().purchase(category, id); return state(); },
    async equip(loadout: Parameters<ReturnType<typeof useGameStore.getState>['equip']>[0]) { await useGameStore.getState().equip(loadout); return state(); },
    async sync() { await useGameStore.getState().syncProgress(); return state(); },
    async initializeTwice() {
      await clearSession(); useGameStore.setState({ initialized: false, session: null });
      await Promise.all([useGameStore.getState().initialize(), useGameStore.getState().initialize()]); return state();
    },
    rememberSession() { remembered = getCurrentSession(); return true; },
    async probeStale() {
      const r = await fetch('http://127.0.0.1:8787/v2/profile', { headers: { Authorization: `Bearer ${remembered?.idToken}` } });
      return { status: r.status, error: r.ok ? undefined : (await r.json()).error };
    },
    async wrongKey() {
      const d = await loadDeviceIdentity(false);
      const r = await fetch('http://127.0.0.1:8787/v2/auth/device-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...d, secret: '0'.repeat(64) }) });
      return { status: r.status, error: (await r.json()).error };
    },
    async legacy() {
      const result = await fetch('http://127.0.0.1:8787/__control/legacy', { method: 'POST' });
      if (!result.ok) throw new Error('Legacy fixture unavailable');
      await clearSession(); await clearSave();
      await SecureStore.deleteItemAsync('kiem-khai-installation');
      await SecureStore.deleteItemAsync('kiem-khai-identity-operation');
      forgetDeviceCacheForTesting();
      const legacy = await result.json();
      await saveSession(legacy);
      return { reloadRequired: true, uid: legacy.uid };
    },
    route(path: string) { router.push(path as never); return true; },
  };
}
