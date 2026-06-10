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

/** POST JSON to an /api route and parse the JSON response, with clear errors. */
export async function postJSON<T = any>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON body (HTML error page, gateway timeout, etc.)
    throw new Error(
      res.ok
        ? "Réponse invalide du service IA (non-JSON)."
        : `Le service IA a échoué (${res.status}). Réessaie dans un instant.`
    );
  }
  if (!res.ok) {
    const rawError = json?.error;
    const message =
      typeof rawError === 'string'
        ? rawError
        : rawError
          ? JSON.stringify(rawError)
          : `Échec de la requête IA (${res.status}).`;
    throw new Error(message);
  }
  return json as T;
}
