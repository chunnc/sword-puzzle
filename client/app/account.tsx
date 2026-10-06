import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { TopHud } from '../src/components/Chrome';
import { GameButton, ScreenFrame, TitleBanner } from '../src/components/Art';
import { useGameStore } from '../src/state/gameStore';
import { colors, type } from '../src/theme';

export default function AccountScreen() {
  const router = useRouter();
  const session = useGameStore((state) => state.session);
  const online = useGameStore((state) => state.online);
  const register = useGameStore((state) => state.register);
  const login = useGameStore((state) => state.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const linked = session !== null && !session.isGuest;
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/map');
  };

  const submit = async (action: 'register' | 'login') => {
    setBusy(true);
    setStatus('');
    try {
      if (action === 'register') await register(email.trim(), password);
      else await login(email.trim(), password);
      router.replace('/map');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Không thể đăng nhập.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenFrame background="bgMap">
      <TopHud onAccount={goBack} />
      <TitleBanner title="TÀI KHOẢN" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.subtitle}>{linked ? 'Tài khoản đã liên kết' : 'Liên kết để đồng bộ tiến trình'}</Text>
            {!online ? <Text style={styles.offline}>Đang ngoại tuyến. Bạn vẫn có thể tiếp tục chơi trên thiết bị này.</Text> : null}
            {!linked ? (
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
                <GameButton title={busy ? 'ĐANG XỬ LÝ…' : 'TẠO TÀI KHOẢN'} onPress={() => void submit('register')} disabled={busy || !online} style={styles.action} />
                <GameButton title="ĐĂNG NHẬP" onPress={() => void submit('login')} art="buttonSecondary" disabled={busy || !online} style={styles.action} />
              </>
            ) : (
              <Text style={styles.body}>Tiến trình đã liên kết và sẽ được đồng bộ khi có mạng.</Text>
            )}
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
