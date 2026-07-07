import { apiBase } from './api';

/**
 * Deletes one or more files from Vercel Blob via the /api/delete-blob route.
 *
 * Best-effort: non-Blob URLs (e.g. fal.ai clips) are ignored server-side, and
 * any failure is swallowed so it never blocks a DB deletion. Only works on the
 * deployed site (Vercel) or under `vercel dev`.
 */
export async function deleteBlob(url: string | string[]): Promise<void> {
  const urls = (Array.isArray(url) ? url : [url]).filter(Boolean);
  if (urls.length === 0) return;

  try {
    await fetch(`${apiBase()}/api/delete-blob`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: urls }),
    });
  } catch {
    // Best-effort cleanup — ignore network/API errors.
  }
}
