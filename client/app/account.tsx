import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArtPanel, GameButton } from '../src/components/Art';
import { useGameStore } from '../src/state/gameStore';
import { colors, type } from '../src/theme';
import { useSfxPress } from '../src/audio/useSfxPress';

type AuthMode = 'login' | 'register';
type Destination = 'map' | 'home' | 'back';
const ignoreRemove = () => undefined;

export default function AccountScreen() {
  const sfxPress = useSfxPress();
  const router = useRouter();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const session = useGameStore(s => s.session);
  const authRequired = useGameStore(s => s.authRequired);
  const initialized = useGameStore(s => s.initialized);
  const bootstrapLoaded = useGameStore(s => s.bootstrapLoaded);
  const online = useGameStore(s => s.online);
  const foreground = useGameStore(s => s.foreground);
  const recovering = useGameStore(s => s.recovering);
  const register = useGameStore(s => s.register);
  const login = useGameStore(s => s.login);
  const logout = useGameStore(s => s.logout);
  const startFreshGuest = useGameStore(s => s.startFreshGuest);
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [switching, setSwitching] = useState(false);
  const [destination, setDestination] = useState<Destination | null>(null);
  const inFlight = useRef(false);
  const linked = session !== null && !session.isGuest;
  const showForm = !linked || switching || authRequired;
  const canRegister = !linked && !authRequired;
  const activeMode = canRegister ? mode : 'login';
  const ready = online && foreground && bootstrapLoaded && !recovering;

  // Includes Android's system Back and native stack removal while auth is in flight.
  usePreventRemove(busy, ignoreRemove);

  useEffect(() => {
    // Navigate after the removal guard has been released, never while busy.
    if (busy || !destination) return;
    if (destination === 'back' && router.canGoBack()) router.back();
    else router.dismissTo(destination === 'map' ? '/map' : '/');
  }, [busy, destination, router]);

  const goBack = () => {
    if (inFlight.current) return;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  const changeMode = (next: AuthMode) => {
    if (inFlight.current) return;
    setMode(next); setPassword(''); setConfirmation(''); setStatus('');
  };
  const release = () => { inFlight.current = false; setBusy(false); };
  const begin = () => {
    if (inFlight.current || !ready) return false;
    inFlight.current = true; setBusy(true); setStatus('');
    return true;
  };

  const submit = (action: AuthMode = activeMode) => {
    if (inFlight.current || !ready || (action === 'register' && (!canRegister || !initialized))) return;
    const inputEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inputEmail) || inputEmail.length > 254) {
      setStatus('Vui lòng nhập email hợp lệ.'); return;
    }
    if (password.length < 8 || password.length > 128) {
      setStatus('Mật khẩu cần có từ 8 đến 128 ký tự.'); return;
    }
    if (action === 'register' && password !== confirmation) {
      setStatus('Xác nhận mật khẩu chưa khớp.'); return;
    }
    if (!begin()) return;
    const previousUid = session?.uid;
    const wasAuthRequired = authRequired;
    const perform = async () => {
      try {
        if (action === 'register') await register(inputEmail, password);
        else await login(inputEmail, password, !!session?.isGuest);
        const currentUid = useGameStore.getState().session?.uid;
        setDestination(source === 'welcome' || wasAuthRequired || previousUid !== currentUid ? 'map' : 'back');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Không thể hoàn thành thao tác. Vui lòng thử lại.');
      } finally { release(); }
    };
    if (action === 'login' && session?.isGuest) {
      Alert.alert('Chuyển tài khoản?', 'Tiến trình hiện tại chưa được liên kết. Chuyển tài khoản sẽ khiến bạn không thể khôi phục tiến trình này.', [
        { text: 'Hủy', style: 'cancel', onPress: release },
        { text: 'Chuyển tài khoản', onPress: () => void perform() },
      ], { cancelable: false });
    } else void perform();
  };

  const performLogout = async () => {
    if (!begin()) return;
    try { await logout(); setDestination('home'); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Không thể đăng xuất.'); }
    finally { release(); }
  };
  const requestFreshGuest = () => {
    if (!begin()) return;
    Alert.alert('Bắt đầu hồ sơ khách mới?', 'Hồ sơ đang lưu trên máy và thao tác còn chờ sẽ được thay thế. Hồ sơ chưa liên kết có thể không khôi phục được.', [
      { text: 'Hủy', style: 'cancel', onPress: release },
      { text: 'Chơi khách mới', onPress: () => {
        void startFreshGuest().then(() => setDestination('map')).catch(error => setStatus(error instanceof Error ? error.message : 'Không thể mở hồ sơ khách.')).finally(release);
      } },
    ], { cancelable: false });
  };
  const retryRecovery = async () => {
    if (!begin()) return;
    try {
      await useGameStore.getState().checkConnection();
      const current = useGameStore.getState();
      if (current.initialized && current.online && !current.authRequired) setDestination('map');
      else setStatus(current.bootError || 'Không thể khôi phục hồ sơ. Vui lòng thử lại.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Không thể khôi phục hồ sơ. Vui lòng thử lại.');
    } finally { release(); }
  };

  useEffect(() => {
    const bridge = (globalThis as any).__swordAcceptance;
    if (!__DEV__ || !bridge) return;
    bridge.account = {
      credentials(nextEmail: string, nextPassword: string, nextConfirmation = '') {
        setEmail(nextEmail); setPassword(nextPassword); setConfirmation(nextConfirmation);
      },
      mode: changeMode,
      login: () => submit('login'), register: () => submit('register'),
      switch: () => { setSwitching(true); changeMode('login'); },
      logout: performLogout, close: goBack,
    };
    return () => { delete bridge.account; };
  });

  return (
    <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <ArtPanel art="dialogPanel" style={styles.card} testID="account-panel">
            <View accessibilityViewIsModal style={styles.content}>
              <View style={styles.header}>
                <Text accessibilityRole="header" style={styles.title}>{linked ? 'TÀI KHOẢN' : 'LƯU TIẾN TRÌNH'}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Đóng tài khoản" accessibilityState={{ disabled: busy }} disabled={busy} onPress={sfxPress(goBack)} style={styles.close}>
                  <Text style={styles.closeText}>×</Text>
                </Pressable>
              </View>
              <Text style={styles.subtitle}>{linked && !authRequired ? 'Tiến trình đã được liên kết với tài khoản.' : 'Liên kết tài khoản để bảo vệ tiến trình và tiếp tục trên thiết bị khác.'}</Text>
              {!online ? <Text style={styles.offline}>Cần kết nối máy chủ để tiếp tục.</Text> : null}
              {session?.email ? <Text style={styles.body}>{session.email}</Text> : null}
              {authRequired ? <Text accessibilityRole="alert" style={styles.error}>Không thể khôi phục hồ sơ. Đăng nhập lại hoặc thử khôi phục để tiếp tục.</Text> : null}
              {showForm ? <>
                {canRegister ? <View style={styles.tabs}>
                  {(['login', 'register'] as const).map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityLabel={tab === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'} accessibilityState={{ selected: activeMode === tab, disabled: busy }} disabled={busy} onPress={sfxPress(() => changeMode(tab))} style={[styles.tab, activeMode === tab && styles.activeTab]}>
                    <Text style={[styles.tabText, activeMode === tab && styles.activeTabText]}>{tab === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</Text>
                  </Pressable>)}
                </View> : <Text style={styles.formTitle}>Đăng nhập</Text>}
                <View style={styles.field}>
                  <Text style={styles.label}>Email</Text>
                  <TextInput value={email} onChangeText={setEmail} editable={!busy} autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" placeholder="Email của bạn" placeholderTextColor={colors.textMuted} accessibilityLabel="Email" style={styles.input} />
                </View>
                <PasswordField label="Mật khẩu" value={password} onChangeText={setPassword} disabled={busy} creating={activeMode === 'register'} />
                {activeMode === 'register' ? <PasswordField label="Xác nhận mật khẩu" value={confirmation} onChangeText={setConfirmation} disabled={busy} creating /> : null}
                {activeMode === 'register' ? <Text style={styles.hint}>Mật khẩu từ 8 đến 128 ký tự. Tạo tài khoản sẽ giữ tiến trình hiện tại.</Text> : null}
                <GameButton title={busy ? 'ĐANG XỬ LÝ…' : activeMode === 'login' ? 'ĐĂNG NHẬP' : 'TẠO TÀI KHOẢN'} onPress={() => submit()} disabled={busy || !ready || activeMode === 'register' && !initialized} style={styles.action} />
              </> : null}
              {status ? <Text accessibilityRole="alert" style={styles.error}>{status}</Text> : null}
              {linked && !showForm ? <GameButton title="ĐỔI TÀI KHOẢN" art="buttonSecondary" textStyle={busy || !ready ? undefined : styles.secondaryText} disabled={busy || !ready} onPress={() => { setSwitching(true); changeMode('login'); }} style={styles.action} /> : null}
              {linked && !authRequired ? <GameButton title="ĐĂNG XUẤT" art="buttonSecondary" textStyle={busy || !ready ? undefined : styles.secondaryText} disabled={busy || !ready} onPress={() => void performLogout()} style={styles.action} /> : null}
              {authRequired ? <>
                <GameButton title="THỬ KHÔI PHỤC" disabled={busy || !ready} onPress={() => void retryRecovery()} style={styles.action} />
                <GameButton title="CHƠI KHÁCH MỚI" disabled={busy || !ready} onPress={requestFreshGuest} art="buttonSecondary" textStyle={busy || !ready ? undefined : styles.secondaryText} style={styles.action} />
              </> : null}
              <GameButton title="QUAY LẠI" onPress={goBack} disabled={busy} art="buttonSecondary" textStyle={busy ? undefined : styles.secondaryText} style={styles.action} />
              {showForm ? <Text style={styles.small}>Bản thử nghiệm chưa có chức năng khôi phục mật khẩu.</Text> : null}
            </View>
          </ArtPanel>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PasswordField({ label, value, onChangeText, disabled, creating = false }: {
  label: string; value: string; onChangeText: (value: string) => void; disabled: boolean; creating?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const sfxPress = useSfxPress();
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.passwordWrap}>
      <TextInput value={value} onChangeText={onChangeText} editable={!disabled} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} autoComplete={creating ? 'new-password' : 'current-password'} placeholder={label === 'Mật khẩu' ? 'Nhập mật khẩu' : 'Nhập lại mật khẩu'} placeholderTextColor={colors.textMuted} accessibilityLabel={label} style={[styles.input, styles.passwordInput]} />
      <Pressable accessibilityRole="button" accessibilityLabel={`${visible ? 'Ẩn' : 'Hiện'} ${label.toLowerCase()}`} disabled={disabled} onPress={sfxPress(() => setVisible(v => !v))} style={styles.showPasswordTap}>
        <Text style={styles.showPassword}>{visible ? 'ẨN' : 'HIỆN'}</Text>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(1,18,23,0.78)' },
  flex: { flex: 1, minHeight: 0 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 24 },
  card: { width: '100%', maxWidth: 400, alignSelf: 'center', paddingHorizontal: 25, paddingVertical: 28 },
  content: { width: '100%', gap: 14 },
  header: { minHeight: 44, justifyContent: 'center', paddingRight: 32 },
  title: { ...type.heading, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', color: colors.goldBright, fontSize: 22, textAlign: 'center' },
  close: { position: 'absolute', right: -12, top: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 30, color: colors.goldBright },
  subtitle: { ...type.body, fontSize: 13, lineHeight: 19, color: colors.textMuted, textAlign: 'center' },
  body: { ...type.body, color: colors.ivory, textAlign: 'center' },
  offline: { ...type.caption, color: colors.textMuted, textAlign: 'center' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.jadeBright },
  tab: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: colors.goldBright },
  tabText: { ...type.body, fontSize: 14, color: colors.textMuted },
  activeTabText: { color: colors.goldBright },
  formTitle: { ...type.heading, color: colors.goldBright, textAlign: 'center' },
  field: { width: '100%', gap: 7 },
  label: { ...type.caption, color: colors.ivory, letterSpacing: 0 },
  input: { width: '100%', minHeight: 49, paddingHorizontal: 13, borderRadius: 8, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.inkDeep, color: colors.ivory, fontSize: 15 },
  passwordWrap: { width: '100%', justifyContent: 'center' },
  passwordInput: { paddingRight: 60 },
  showPassword: { color: colors.goldBright, fontSize: 11, fontWeight: '900' },
  showPasswordTap: { position: 'absolute', right: 0, width: 58, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  error: { ...type.caption, color: '#ffb7aa', textAlign: 'center', letterSpacing: 0, lineHeight: 18 },
  action: { width: '100%', minHeight: 49 },
  secondaryText: { color: colors.ivory },
  hint: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  small: { color: colors.textMuted, textAlign: 'center', fontSize: 11, lineHeight: 16 },
});
