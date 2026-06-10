/**
 * Resolves the base URL for our Vercel API routes (/api/*).
 *
 * In local dev (expo on localhost) there is no /api server, so we call the
 * deployed endpoint directly (CORS is open on those routes).
 */
const PROD_BASE = 'https://auto-promo-agents.vercel.app';

export function apiBase(): string {
  if (process.env.EXPO_PUBLIC_API_BASE) return process.env.EXPO_PUBLIC_API_BASE;
  if (
    typeof window !== 'undefined' &&
    /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
  ) {
    return PROD_BASE;
  }
  return '';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** HTTP statuses worth retrying (transient gateway/timeout/internal errors). */
const TRANSIENT_STATUS = new Set([500, 502, 503, 504]);

interface PostOptions {
  /** Number of extra attempts on transient errors (502/503/504/network). Default 0. */
  retries?: number;
}

/** POST JSON to an /api route and parse the JSON response, with clear errors. */
export async function postJSON<T = any>(
  path: string,
  body: unknown,
  options: PostOptions = {}
): Promise<T> {
  const retries = options.retries ?? 0;
  let lastError: Error = new Error('Échec de la requête IA.');

  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${apiBase()}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (networkErr: any) {
      // Network failure → transient, retry if attempts remain.
      lastError = new Error(networkErr?.message || 'Erreur réseau. Réessaie dans un instant.');
      if (attempt < retries) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw lastError;
    }

    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      // Non-JSON body (HTML error page, gateway timeout, etc.)
      lastError = new Error(
        res.ok
          ? 'Réponse invalide du service IA (non-JSON).'
          : `Le service IA a échoué (${res.status}). Réessaie dans un instant.`
      );
      if (!res.ok && TRANSIENT_STATUS.has(res.status) && attempt < retries) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw lastError;
    }

    if (!res.ok) {
      // Our routes return { error }; platform/upstream errors may use { message }.
      const rawError = json?.error ?? json?.message;
      const extracted =
        typeof rawError === 'string'
          ? rawError
          : rawError?.message && typeof rawError.message === 'string'
            ? rawError.message
            : rawError
              ? JSON.stringify(rawError)
              : undefined;
      const message = extracted
        ? `${extracted}${res.status >= 500 ? ` (${res.status}, réessaie dans un instant)` : ''}`
        : `Le service IA a échoué (${res.status}). Réessaie dans un instant.`;
      lastError = new Error(message);
      if (TRANSIENT_STATUS.has(res.status) && attempt < retries) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw lastError;
    }

    return json as T;
  }

  throw lastError;
}
