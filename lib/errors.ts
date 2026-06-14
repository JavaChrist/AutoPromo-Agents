/** Error helpers shared across the AI agents and data layer. */

/** Returns a readable error message from any caught error. */
export function getErrorMessage(err: unknown): string {
  if (!err) return 'Erreur inconnue';
  if (typeof err === 'string') return err;
  const e = err as any;
  const detailBody =
    typeof e?.details?.body === 'string'
      ? e.details.body
      : e?.details?.body
        ? JSON.stringify(e.details.body)
        : undefined;
  const msg =
    e?.error?.message ||
    e?.details?.error?.message ||
    detailBody ||
    e?.details?.message ||
    e?.response?.data?.error ||
    e?.message ||
    e?.cause?.message ||
    JSON.stringify(e);
  if (typeof msg === 'string') return msg;
  return JSON.stringify(msg);
}

/** Returns true if the error is an auth/401 error. */
export function isAuthError(err: unknown): boolean {
  const msg = getErrorMessage(err).toLowerCase();
  return msg.includes('401') || msg.includes('unauthorized') || msg.includes('not authorized');
}

/**
 * Returns true when the AI gateway answered with HTML (or any non-JSON body)
 * instead of the expected JSON. Usually a transient gateway error/timeout
 * (video generation is slow) rather than a bug in our payload.
 */
export function isNonJsonResponseError(err: unknown): boolean {
  const msg = getErrorMessage(err).toLowerCase();
  return (
    msg.includes('<!doctype') ||
    msg.includes('is not valid json') ||
    msg.includes("unexpected token '<'") ||
    msg.includes('unexpected token <') ||
    msg.includes('network error') ||
    msg.includes('failed to fetch')
  );
}

/** True when the video model rejected the input for content-moderation reasons. */
export function isContentFlaggedError(err: unknown): boolean {
  const msg = getErrorMessage(err).toLowerCase();
  return (
    msg.includes('content checker') ||
    msg.includes('content policy') ||
    msg.includes('flagged') ||
    msg.includes('content moderation') ||
    msg.includes('safety')
  );
}

/** Maps any generation error to a clear, user-facing French message. */
export function describeGenerationError(err: unknown): string {
  if (isContentFlaggedError(err)) {
    return "Cette scène a été refusée par la modération de contenu du modèle vidéo. Essaie une autre capture d'écran, retire la capture (rendu d'ambiance), ou reformule le prompt de la scène.";
  }
  if (isNonJsonResponseError(err)) {
    return "Le service IA a renvoyé une réponse invalide (souvent un délai dépassé ou une erreur passagère). Réessaie dans quelques instants.";
  }
  return getErrorMessage(err) || 'Erreur inconnue. Réessaye dans un instant.';
}
