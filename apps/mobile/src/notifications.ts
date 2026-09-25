import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Me } from './api/endpoints';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Registers this device's native FCM/APNs token with the backend (PUSH_PROVIDER=fcm).
 * Remote push isn't available inside Expo Go, so this is a no-op there — use a development
 * build (`npx expo run:android` or EAS) with google-services.json to receive pushes.
 */
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Updates',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return;
    const token = await Notifications.getDevicePushTokenAsync();
    await Me.registerDevice(String(token.data), Platform.OS === 'ios' ? 'ios' : 'android');
  } catch (err) {
    console.warn('Push registration skipped:', err);
  }
}
