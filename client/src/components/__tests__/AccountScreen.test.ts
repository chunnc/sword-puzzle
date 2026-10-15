import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, Text, TextInput } from 'react-native';
import { usePreventRemove } from 'expo-router/react-navigation';
import AccountScreen from '../../../app/account';

jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('../../audio/useSfxPress', () => ({ useSfxPress: () => (handler: unknown) => handler }));
jest.mock('../../state/gameStore', () => ({
  useGameStore: Object.assign((selector: (state: typeof mockState) => unknown) => selector(mockState), { getState: () => mockState }),
}));
jest.mock('../Art', () => {
  const React = require('react');
  const { Pressable, View } = require('react-native');
  return { ArtPanel: View, GameButton: ({ title, ...props }: any) => React.createElement(Pressable, { ...props, accessibilityLabel: title }) };
});

const mockRouter = { canGoBack: jest.fn(() => true), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() };
let mockParams: { source?: string } = {};
const guest = { uid: 'guest-1', isGuest: true, email: undefined as string | undefined };
const mockState = {
  session: { ...guest }, initialized: true, bootstrapLoaded: true, online: true, foreground: true,
  recovering: false, authRequired: false, bootError: '',
  login: jest.fn(), register: jest.fn(), logout: jest.fn(), startFreshGuest: jest.fn(), checkConnection: jest.fn(),
};
let renderer: ReactTestRenderer;
const mount = async () => { await act(async () => { renderer = create(React.createElement(AccountScreen)); }); };
const button = (label: string) => renderer.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const input = (label: string) => renderer.root.findAllByType(TextInput).find(n => n.props.accessibilityLabel === label)!;
const tab = button;
const hasText = (text: string) => renderer.root.findAllByType(Text).some(n => n.props.children === text);
const enter = (email = 'player@example.test', password = 'password-123', confirmation = password) => {
  act(() => {
    input('Email').props.onChangeText(email); input('Mật khẩu').props.onChangeText(password);
    const confirm = renderer.root.findAllByType(TextInput).find(n => n.props.accessibilityLabel === 'Xác nhận mật khẩu');
    confirm?.props.onChangeText(confirmation);
  });
};
const choose = async (label: string) => {
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)[2];
  await act(async () => buttons.find((b: any) => b.text === label).onPress());
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  Object.assign(mockState, { session: { ...guest }, initialized: true, bootstrapLoaded: true, online: true,
    foreground: true, recovering: false, authRequired: false, bootError: '' });
  mockState.login.mockImplementation(async () => { mockState.session = { uid: 'account-2', isGuest: false, email: 'player@example.test' }; });
  mockState.register.mockImplementation(async () => { mockState.session = { ...guest, isGuest: false, email: 'player@example.test' }; });
  mockState.logout.mockResolvedValue(undefined);
  mockState.startFreshGuest.mockResolvedValue(undefined);
  mockState.checkConnection.mockResolvedValue(undefined);
  mockRouter.canGoBack.mockReturnValue(true);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => { act(() => renderer?.unmount()); jest.restoreAllMocks(); });

it('defaults to login and only asks for confirmation when creating an account', async () => {
  await mount();
  expect(input('Mật khẩu').props.autoComplete).toBe('current-password');
  expect(renderer.root.findAllByType(TextInput)).toHaveLength(2);
  act(() => tab('Tạo tài khoản').props.onPress());
  expect(input('Xác nhận mật khẩu').props.secureTextEntry).toBe(true);
  expect(input('Mật khẩu').props.autoComplete).toBe('new-password');
  act(() => button('Hiện xác nhận mật khẩu').props.onPress());
  expect(input('Xác nhận mật khẩu').props.secureTextEntry).toBe(false);
  expect(input('Mật khẩu').props.secureTextEntry).toBe(true);
  act(() => tab('Đăng nhập').props.onPress());
  expect(renderer.root.findAllByType(TextInput)).toHaveLength(2);
});

it.each([
  ['bad-email', 'password-123', 'password-123', 'Vui lòng nhập email hợp lệ.'],
  ['a@example.test', 'short', 'short', 'Mật khẩu cần có từ 8 đến 128 ký tự.'],
  ['a@example.test', 'x'.repeat(129), 'x'.repeat(129), 'Mật khẩu cần có từ 8 đến 128 ký tự.'],
  ['a@example.test', 'password-123', 'different', 'Xác nhận mật khẩu chưa khớp.'],
])('rejects invalid registration before calling the API (%s)', async (email, password, confirmation, message) => {
  await mount(); act(() => tab('Tạo tài khoản').props.onPress()); enter(email, password, confirmation);
  await act(async () => button('TẠO TÀI KHOẢN').props.onPress());
  expect(mockState.register).not.toHaveBeenCalled(); expect(hasText(message)).toBe(true);
});

it.each([8, 128])('accepts a %s-character password and trims only the email', async length => {
  mockParams.source = 'welcome';
  await mount(); act(() => tab('Tạo tài khoản').props.onPress());
  const password = ` ${'x'.repeat(length - 2)} `;
  enter('  player@example.test  ', password);
  await act(async () => button('TẠO TÀI KHOẢN').props.onPress());
  expect(mockState.register).toHaveBeenCalledWith('player@example.test', password);
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/map');
});

it('closes back to the current game screen after linking the same guest profile', async () => {
  await mount(); act(() => tab('Tạo tài khoản').props.onPress()); enter();
  await act(async () => button('TẠO TÀI KHOẢN').props.onPress());
  expect(mockRouter.back).toHaveBeenCalledTimes(1); expect(mockRouter.dismissTo).not.toHaveBeenCalled();
});

it('keeps the guest unchanged when the account-switch warning is canceled', async () => {
  await mount(); enter();
  const login = button('ĐĂNG NHẬP');
  act(() => { login.props.onPress(); login.props.onPress(); });
  expect(Alert.alert).toHaveBeenCalledTimes(1); expect(mockState.login).not.toHaveBeenCalled();
  expect(usePreventRemove).toHaveBeenLastCalledWith(true, expect.any(Function));
  act(() => button('Đóng tài khoản').props.onPress()); expect(mockRouter.back).not.toHaveBeenCalled();
  await choose('Hủy');
  expect(mockState.session).toEqual(guest);
  expect(usePreventRemove).toHaveBeenLastCalledWith(false, expect.any(Function));
});

it('loads the selected account only after confirming the guest warning', async () => {
  await mount(); enter(); act(() => button('ĐĂNG NHẬP').props.onPress());
  await choose('Chuyển tài khoản');
  expect(mockState.login).toHaveBeenCalledWith('player@example.test', 'password-123', true);
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/map');
});

it('blocks duplicate submissions and Back while a request is pending', async () => {
  let resolve!: () => void;
  mockState.register.mockImplementation(() => new Promise<void>(r => { resolve = r; }));
  await mount(); act(() => tab('Tạo tài khoản').props.onPress()); enter();
  const register = button('TẠO TÀI KHOẢN');
  act(() => { register.props.onPress(); register.props.onPress(); });
  expect(mockState.register).toHaveBeenCalledTimes(1);
  expect(button('QUAY LẠI').props.disabled).toBe(true);
  expect(input('Email').props.editable).toBe(false);
  act(() => button('QUAY LẠI').props.onPress()); expect(mockRouter.back).not.toHaveBeenCalled();
  expect(usePreventRemove).toHaveBeenLastCalledWith(true, expect.any(Function));
  await act(async () => resolve());
  expect(usePreventRemove).toHaveBeenLastCalledWith(false, expect.any(Function));
});

it('shows server errors inline and keeps the popup usable', async () => {
  mockState.register.mockRejectedValueOnce(new Error('Email đã được sử dụng.'));
  await mount(); act(() => tab('Tạo tài khoản').props.onPress()); enter();
  await act(async () => button('TẠO TÀI KHOẢN').props.onPress());
  expect(hasText('Email đã được sử dụng.')).toBe(true);
  expect(mockRouter.back).not.toHaveBeenCalled(); expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  expect(button('TẠO TÀI KHOẢN').props.disabled).toBe(false);
});

it.each(['online', 'foreground', 'bootstrapLoaded'])('blocks auth when %s is false', async field => {
  (mockState as any)[field] = false;
  await mount(); enter();
  expect(button('ĐĂNG NHẬP').props.disabled).toBe(true);
  act(() => button('ĐĂNG NHẬP').props.onPress());
  expect(mockState.login).not.toHaveBeenCalled(); expect(Alert.alert).not.toHaveBeenCalled();
});

it('shows linked account controls and returns to welcome after logout', async () => {
  mockState.session = { ...guest, isGuest: false, email: 'saved@example.test' };
  await mount();
  expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
  expect(hasText('saved@example.test')).toBe(true);
  await act(async () => button('ĐĂNG XUẤT').props.onPress());
  expect(mockState.logout).toHaveBeenCalledTimes(1);
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/');
});

it('switches an existing account without a guest warning', async () => {
  mockState.session = { ...guest, isGuest: false };
  await mount(); act(() => button('ĐỔI TÀI KHOẢN').props.onPress()); enter();
  await act(async () => button('ĐĂNG NHẬP').props.onPress());
  expect(Alert.alert).not.toHaveBeenCalled(); expect(mockRouter.dismissTo).toHaveBeenCalledWith('/map');
});

it('returns to map after reauthentication of the same account', async () => {
  mockState.session = { ...guest, isGuest: false }; mockState.authRequired = true;
  mockState.login.mockResolvedValueOnce(undefined);
  await mount(); enter();
  expect(renderer.root.findAll(n => n.props.accessibilityRole === 'tab')).toHaveLength(0);
  await act(async () => button('ĐĂNG NHẬP').props.onPress());
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/map');
});

it('keeps failed recovery in the popup and navigates only after recovery succeeds', async () => {
  mockState.authRequired = true; mockState.bootError = 'Không thể khôi phục';
  await mount();
  await act(async () => button('THỬ KHÔI PHỤC').props.onPress());
  expect(mockRouter.dismissTo).not.toHaveBeenCalled(); expect(hasText('Không thể khôi phục')).toBe(true);
  mockState.checkConnection.mockImplementationOnce(async () => { mockState.authRequired = false; });
  await act(async () => button('THỬ KHÔI PHỤC').props.onPress());
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/map');
});

it('requires confirmation before replacing an unrecoverable guest', async () => {
  mockState.authRequired = true;
  await mount(); act(() => button('CHƠI KHÁCH MỚI').props.onPress());
  expect(mockState.startFreshGuest).not.toHaveBeenCalled(); await choose('Hủy');
  act(() => button('CHƠI KHÁCH MỚI').props.onPress()); await choose('Chơi khách mới');
  expect(mockState.startFreshGuest).toHaveBeenCalledTimes(1); expect(mockRouter.dismissTo).toHaveBeenCalledWith('/map');
});

it('falls back to welcome when opened without navigation history', async () => {
  mockRouter.canGoBack.mockReturnValue(false);
  await mount(); act(() => button('Đóng tài khoản').props.onPress());
  expect(mockRouter.replace).toHaveBeenCalledWith('/');
});
