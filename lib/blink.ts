import { createClient, AsyncStorageAdapter } from '@blinkdotnew/sdk';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';

// NOTE: do NOT set `auth.authUrl` here. In headless mode the SDK targets
// Blink's own auth server by default. Pointing authUrl at the app origin
// (e.g. http://localhost:3000) makes auth calls hit the SPA, which returns
// HTML instead of JSON and breaks signInWithEmail / me() with a
// "Unexpected token '<', <!DOCTYPE" error. The related dev warning is benign.
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

/**
 * Returns true when the AI gateway answered with HTML (or any non-JSON body)
 * instead of the expected JSON. This usually means a transient gateway error
 * (5xx / timeout — video generation is slow) rather than a bug in our payload.
 * The browser surfaces it as: Unexpected token '<', "<!DOCTYPE ... is not valid JSON.
 */
export function isNonJsonResponseError(err: unknown): boolean {
  const msg = getErrorMessage(err).toLowerCase();
  return (
    msg.includes('<!doctype') ||
    msg.includes('is not valid json') ||
    msg.includes("unexpected token '<'") ||
    msg.includes('unexpected token <') ||
    msg.includes('network error')
  );
}

/** Maps any generation error to a clear, user-facing French message. */
export function describeGenerationError(err: unknown): string {
  if (isAuthError(err)) {
    return 'Connecte-toi pour utiliser les agents IA.';
  }
  if (isNonJsonResponseError(err)) {
    return "Le service IA a renvoyé une réponse invalide (souvent un délai dépassé ou une erreur passagère du gateway). Réessaie dans quelques instants.";
  }
  return getErrorMessage(err) || 'Erreur inconnue. Réessaye dans un instant.';
}
