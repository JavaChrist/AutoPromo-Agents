export interface MergeResult {
  url: string;
  size: number;
  overlayApplied?: boolean;
  overlayWarning?: string;
}

export interface MergeOverlays {
  /** Brand / title shown at the top for the whole video. */
  title?: string;
  /** Call-to-action shown large near the bottom during the last seconds. */
  cta?: string;
  /** URL shown below the CTA during the last seconds. */
  url?: string;
}

/**
 * Calls the serverless merge endpoint to concatenate ordered scene clips into a
 * single MP4. Only works on the deployed site (Vercel) or under `vercel dev` —
 * in `expo start --web` there is no /api server, so we surface a clear message.
 */
export async function mergeScenes(
  urls: string[],
  fileName?: string,
  options?: { audioUrl?: string; overlays?: MergeOverlays; totalDuration?: number; aspectRatio?: string }
): Promise<MergeResult> {
  const res = await fetch('/api/merge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      urls,
      fileName,
      audioUrl: options?.audioUrl,
      overlays: options?.overlays,
      totalDuration: options?.totalDuration,
      aspectRatio: options?.aspectRatio,
    }),
  });

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      "La fusion n'est disponible que sur la version déployée (Vercel). En dev local (expo), l'API /api/merge n'existe pas."
    );
  }

  if (!res.ok) {
    const rawError = json?.error;
    const message =
      typeof rawError === 'string' ? rawError : rawError ? JSON.stringify(rawError) : 'Échec de la fusion.';
    throw new Error(message);
  }
  return json as MergeResult;
}
