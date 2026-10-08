import React, { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { ArtPanel, GameButton } from './Art';
import { useGameStore } from '../state/gameStore';
import { colors, type } from '../theme';

type DialogMode = 'hidden' | 'network' | 'pending' | 'authentication';
type VisibleDialogMode = Exclude<DialogMode, 'hidden'>;
type GameState = ReturnType<typeof useGameStore.getState>;

const messages: Record<VisibleDialogMode, { title: string; body: string }> = {
  network: {
    title: 'KẾT NỐI MÁY CHỦ',
    body: 'Không thể kết nối máy chủ. Kiểm tra internet và thử lại để tiếp tục.',
  },
  pending: {
    title: 'CHỜ XÁC NHẬN',
    body: 'Thao tác đang chờ máy chủ xác nhận.',
  },
  authentication: {
    title: 'PHIÊN CẦN XÁC THỰC',
    body: 'Vui lòng đăng nhập lại để tiếp tục. Thao tác còn chờ sẽ được xác nhận sau khi đăng nhập.',
  },
};

// Subscribe to presentation changes, not the lifecycle of background requests.
function selectDialogMode(state: GameState): DialogMode {
  if (!state.online) return 'network';
  if (state.authRequired) return 'authentication';
  if (state.initialized && state.save.pending && state.notice) return 'pending';
  return 'hidden';
}

const ignoreClose = () => undefined;

export function ConnectionDialog() {
  const mode = useGameStore(selectDialogMode);
  const router = useRouter();
  const pathname = usePathname();
  const onLogin = useCallback(() => router.push('/account'), [router]);
  const visibleMode = mode === 'authentication' && pathname === '/account' ? 'hidden' : mode;

  return <ConnectionModal mode={visibleMode} onLogin={onLogin} />;
}

const ConnectionModal = memo(function ConnectionModal({ mode, onLogin }: {
  mode: DialogMode;
  onLogin: () => void;
}) {
  const lastVisibleMode = useRef<VisibleDialogMode>('network');
  useLayoutEffect(() => {
    if (mode !== 'hidden') lastVisibleMode.current = mode;
  }, [mode]);

  // Preserve the contents throughout the native Modal's closing animation.
  const displayedMode = mode === 'hidden' ? lastVisibleMode.current : mode;
  return (
    <Modal visible={mode !== 'hidden'} transparent animationType="fade" onRequestClose={ignoreClose} accessibilityViewIsModal>
      <View style={styles.backdrop}>
        <ConnectionPanel mode={displayedMode} onLogin={onLogin} />
      </View>
    </Modal>
  );
});

const ConnectionPanel = memo(function ConnectionPanel({ mode, onLogin }: {
  mode: VisibleDialogMode;
  onLogin: () => void;
}) {
  const message = messages[mode];
  return (
    <ArtPanel art="dialogPanel" style={styles.panel} testID="connection-dialog-panel">
      <Text accessibilityRole="header" style={styles.title}>{message.title}</Text>
      <Text style={styles.body}>{message.body}</Text>
      {mode === 'authentication'
        ? <GameButton title="ĐĂNG NHẬP" onPress={onLogin} />
        : <RetryAction mode={mode} />}
    </ArtPanel>
  );
});

// Manual feedback is confined to the button; the modal and artwork stay put.
const RetryAction = memo(function RetryAction({ mode }: { mode: 'network' | 'pending' }) {
  const [retrying, setRetrying] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const retry = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRetrying(true);
    try {
      const store = useGameStore.getState();
      await (mode === 'network' ? store.checkConnection() : store.syncProgress());
    } catch {
      // Store actions report errors; a failed retry leaves this dialog open.
    } finally {
      inFlight.current = false;
      if (mounted.current) setRetrying(false);
    }
  }, [mode]);

  return (
    <View style={styles.retryAction}>
      <GameButton
        title="THỬ LẠI"
        art="buttonPrimary"
        disabledArt="buttonPrimary"
        disabled={retrying}
        style={styles.retryButton}
        onPress={() => void retry()}
      />
      <View pointerEvents="none" style={styles.spinnerSlot}>
        <ActivityIndicator
          animating={retrying}
          hidesWhenStopped={false}
          size="small"
          color={colors.inkDeep}
          style={retrying ? styles.spinnerVisible : styles.spinnerHidden}
          accessibilityLabel="Đang thử kết nối lại"
          accessibilityElementsHidden={!retrying}
          importantForAccessibility={retrying ? 'auto' : 'no-hide-descendants'}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,12,18,.85)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  panel: { width: '100%', maxWidth: 380, padding: 24, gap: 20 },
  title: { ...type.heading, color: colors.goldBright, textAlign: 'center' },
  body: { ...type.body, color: colors.ivory, textAlign: 'center' },
  retryAction: { alignSelf: 'center', minWidth: 176, maxWidth: '100%' },
  retryButton: { paddingHorizontal: 40 },
  spinnerSlot: { position: 'absolute', left: 12, top: '50%', marginTop: -12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  spinnerVisible: { opacity: 1 },
  spinnerHidden: { opacity: 0 },
});
