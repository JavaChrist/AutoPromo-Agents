import { createClient, AsyncStorageAdapter } from '@blinkdotnew/sdk';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';

export const blink = createClient({
  projectId: process.env.EXPO_PUBLIC_BLINK_PROJECT_ID!,
  publishableKey: process.env.EXPO_PUBLIC_BLINK_PUBLISHABLE_KEY!,
  authRequired: false,
  auth: { mode: 'headless', webBrowser: WebBrowser },
  storage: new AsyncStorageAdapter(AsyncStorage),
});

export const DEMO_USER_ID = 'demo';

/** Returns a readable error message from any caught error. */
export function getErrorMessage(err: unknown): string {
  if (!err) return 'Erreur inconnue';
  if (typeof err === 'string') return err;
  const e = err as any;
  // Blink SDK wraps original error in details
  const msg =
    e?.message ||
    e?.details?.message ||
    e?.details?.originalError?.message ||
    e?.cause?.message ||
    JSON.stringify(e);
  if (typeof msg === 'string') return msg;
  return JSON.stringify(msg);
}

/** Returns true if the error is an auth/401 error. */
export function isAuthError(err: unknown): boolean {
  const msg = getErrorMessage(err).toLowerCase();
  return (
    msg.includes('401') ||
    msg.includes('unauthorized') ||
    msg.includes('blinkautherror') ||
    (err as any)?.details?.originalError?.name === 'BlinkAuthError'
  );
}
