/**
 * Auth utilities for AutoPromo Agent Suite.
 *
 * The Blink AI module requires a valid user JWT.
 * We auto-sign-in with a demo account on first launch,
 * then show a real login prompt for production use.
 */
import { blink, getErrorMessage } from './blink';

const DEMO_EMAIL = 'demo@autopromo.app';
const DEMO_PASSWORD = 'AutoPromo2024!';

let _authCheckDone = false;

/**
 * Ensure there is an authenticated user before calling Blink AI.
 * - First tries the existing session (cached token).
 * - If none, auto-signs in with the shared demo account.
 * - If demo sign-in fails (first run), creates the account then signs in.
 * Returns the user or throws if all attempts fail.
 */
export async function ensureAuthForAI(): Promise<void> {
  if (_authCheckDone) {
    const user = await blink.auth.me().catch(() => null);
    if (user) return;
  }

  // Try cached session first
  const user = await blink.auth.me().catch(() => null);
  if (user) {
    _authCheckDone = true;
    return;
  }

  // Auto sign-in with demo account
  try {
    await blink.auth.signInWithEmail(DEMO_EMAIL, DEMO_PASSWORD);
    _authCheckDone = true;
    return;
  } catch (err) {
    const msg = getErrorMessage(err).toLowerCase();
    // Account doesn't exist yet → create it
    if (msg.includes('invalid') || msg.includes('not found') || msg.includes('credentials') || msg.includes('404')) {
      try {
        await blink.auth.signUp({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
        await blink.auth.signInWithEmail(DEMO_EMAIL, DEMO_PASSWORD);
        _authCheckDone = true;
        return;
      } catch (signupErr) {
        // If signup also fails, just try sign-in one more time (race condition)
        await blink.auth.signInWithEmail(DEMO_EMAIL, DEMO_PASSWORD);
        _authCheckDone = true;
        return;
      }
    }
    throw err;
  }
}
