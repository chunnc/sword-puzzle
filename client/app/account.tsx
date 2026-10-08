import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { TopHud } from '../src/components/Chrome';
import { GameButton, ScreenFrame, TitleBanner } from '../src/components/Art';
import { useGameStore } from '../src/state/gameStore';
import { colors, type } from '../src/theme';

export default function AccountScreen() {
  const router = useRouter();
  const session = useGameStore((state) => state.session);
  const authRequired = useGameStore(s=>s.authRequired);
  const logout = useGameStore(s=>s.logout);
  const online = useGameStore((state) => state.online);
  const register = useGameStore((state) => state.register);
  const login = useGameStore((state) => state.login);
  const startFreshGuest = useGameStore(s => s.startFreshGuest);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [switching, setSwitching] = useState(false);
  const linked = session !== null && !session.isGuest;
  const showForm = !linked || switching || authRequired;
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/map');
  };

  const submit = async (action: 'register' | 'login', confirmedDiscardGuest = false) => {
    if (action === 'login' && session?.isGuest && !confirmedDiscardGuest) {
      Alert.alert('Chuyển tài khoản?', 'Tiến trình hiện tại chưa được liên kết. Chuyển tài khoản sẽ khiến bạn không thể khôi phục tiến trình này.', [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Chuyển tài khoản', onPress: () => void submit('login', true) },
      ]);
      return;
    }
    setBusy(true);
    setStatus('');
    try {
      if (action === 'register') await register(email.trim(), password);
      else await login(email.trim(), password, confirmedDiscardGuest);
      router.replace('/map');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Không thể đăng nhập.');
    } finally {
      setBusy(false);
    }
  };

  const performLogout = () => {
    setBusy(true);
    void logout().then(() => router.replace('/')).catch(error => setStatus(String(error))).finally(() => setBusy(false));
  };
  const requestLogout = () => {
    if (session?.isGuest) {
      Alert.alert('Đăng xuất hồ sơ khách?', 'Hồ sơ chưa liên kết email. Sau khi đăng xuất, bạn không thể tự khôi phục hồ sơ này.', [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Đăng xuất', style: 'destructive', onPress: performLogout },
      ]);
    } else performLogout();
  };
  const requestFreshGuest = () => Alert.alert('Bắt đầu hồ sơ khách mới?', 'Hồ sơ đang lưu trên máy và thao tác còn chờ sẽ được thay thế. Hồ sơ chưa liên kết có thể không khôi phục được.', [
    { text: 'Hủy', style: 'cancel' },
    { text: 'Chơi khách mới', onPress: () => {
      setBusy(true); setStatus('');
      void startFreshGuest().then(() => router.replace('/map')).catch(error => setStatus(String(error))).finally(() => setBusy(false));
    } },
  ]);
  useEffect(() => {
    const bridge = (globalThis as any).__swordAcceptance;
    if (!__DEV__ || !bridge) return;
    // Exercise the real screen callbacks in the development acceptance runtime.
    bridge.account = {
      credentials(nextEmail: string, nextPassword: string) { setEmail(nextEmail); setPassword(nextPassword); },
      login: () => submit('login'), register: () => submit('register'),
      switch: () => setSwitching(true), logout: requestLogout,
    };
    return () => { delete bridge.account; };
  });

  return (
    <ScreenFrame background="bgMap">
      <TopHud onAccount={goBack} />
      <TitleBanner title="TÀI KHOẢN" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.subtitle}>{linked ? 'Tài khoản đã liên kết' : 'Liên kết để bảo vệ và chuyển tiến trình sang thiết bị khác'}</Text>
            {!online ? <Text style={styles.offline}>Cần kết nối máy chủ để tiếp tục.</Text> : null}
            {session?.email ? <Text style={styles.body}>{session.email}</Text> : null}
            {authRequired ? <Text accessibilityRole="alert" style={styles.error}>Không thể khôi phục hồ sơ. Bạn có thể thử lại, đăng nhập hoặc chơi khách mới.</Text> : null}
            {showForm ? (
              <>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  placeholder="Email"
                  placeholderTextColor="#b6c0b2"
                  accessibilityLabel="Email"
                  style={styles.input}
                />
                <View style={styles.passwordWrap}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!passwordVisible}
                    autoComplete="new-password"
                    placeholder="Mật khẩu"
                    placeholderTextColor="#b6c0b2"
                    accessibilityLabel="Mật khẩu"
                    style={[styles.input, styles.passwordInput]}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={passwordVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    onPress={() => setPasswordVisible((visible) => !visible)}
                    style={styles.showPasswordTap}
                  >
                    <Text style={styles.showPassword}>
                    {passwordVisible ? 'ẨN' : 'HIỆN'}
                    </Text>
                  </Pressable>
                </View>
                {status ? <Text accessibilityRole="alert" style={styles.error}>{status}</Text> : null}
                {!linked && !authRequired ? <GameButton title={busy ? 'ĐANG XỬ LÝ…' : 'LIÊN KẾT TÀI KHOẢN'} onPress={() => void submit('register')} disabled={busy || !online} style={styles.action} /> : null}
                <GameButton title="ĐĂNG NHẬP" onPress={() => void submit('login')} art="buttonSecondary" disabled={busy || !online} style={styles.action} />
              </>
            ) : (
              <Text style={styles.body}>Tiến trình được lưu trên máy chủ và đã liên kết với tài khoản.</Text>
            )}
            {linked && !showForm ? <GameButton title="ĐỔI TÀI KHOẢN" art="buttonSecondary" disabled={busy || !online} onPress={() => setSwitching(true)} style={styles.action} /> : null}
            {linked && !authRequired ? <GameButton title="ĐĂNG XUẤT" art="buttonSecondary" disabled={busy || !online} onPress={requestLogout} style={styles.action} /> : null}
            {authRequired ? <>
              <GameButton title="THỬ KHÔI PHỤC" disabled={busy || !online} onPress={() => void useGameStore.getState().checkConnection()} style={styles.action} />
              <GameButton title="CHƠI KHÁCH MỚI" disabled={busy || !online} onPress={requestFreshGuest} art="buttonSecondary" style={styles.action} />
            </> : null}
            <GameButton title="QUAY LẠI" onPress={goBack} art="buttonSecondary" style={styles.action} />
            <Text style={styles.small}>Bản thử nghiệm chưa có chức năng khôi phục mật khẩu.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minHeight: 0 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 8 },
  card: { width: '100%', maxWidth: 420, alignSelf: 'center', minHeight: 350, justifyContent: 'center', alignItems: 'center', padding: 22, gap: 12, backgroundColor: 'rgba(4, 37, 40, 0.9)', borderWidth: 1, borderColor: colors.gold, borderRadius: 20 },
  subtitle: { ...type.heading, color: colors.goldBright, textAlign: 'center', marginBottom: 6 },
  body: { ...type.body, color: colors.ivory, textAlign: 'center' },
  offline: { ...type.caption, color: colors.textMuted, textAlign: 'center' },
  input: { width: '100%', minHeight: 49, paddingHorizontal: 13, borderRadius: 9, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.inkDeep, color: colors.ivory, fontSize: 15 },
  passwordWrap: { width: '100%', position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 60 },
  showPassword: { color: colors.goldBright, fontSize: 11, fontWeight: '900', textAlign: 'right' },
  showPasswordTap: { position: 'absolute', right: 0, minWidth: 58, height: 48, justifyContent: 'center' },
  error: { ...type.caption, color: '#ffb7aa', textAlign: 'center' },
  action: { width: '100%', minHeight: 47 },
  small: { color: colors.textMuted, textAlign: 'center', fontSize: 11, marginTop: 2 },
});
