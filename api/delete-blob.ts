import type { VercelRequest, VercelResponse } from '@vercel/node';
import { del } from '@vercel/blob';

/**
 * POST /api/delete-blob
 * Body: { url: string | string[] }
 *
 * Deletes one or more files from Vercel Blob (e.g. a merged video). Only URLs
 * hosted on Vercel Blob are accepted — external URLs (fal.ai clips) are ignored
 * silently so the caller can pass any media URL without extra checks.
 *
 * CORS is open so the local dev app (expo on localhost) can use the deployed
 * endpoint.
 */

function setCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function isBlobUrl(url: string): boolean {
  return /\.blob\.vercel-storage\.com\//.test(url);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée.' });
    return;
  }

  const hasBlobAuth =
    !!process.env.BLOB_READ_WRITE_TOKEN ||
    (!!process.env.BLOB_STORE_ID && !!process.env.VERCEL_OIDC_TOKEN);
  if (!hasBlobAuth) {
    res.status(503).json({ error: 'Stockage Vercel Blob non configuré.' });
    return;
  }

  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
    const raw = body.url;
    const urls: string[] = (Array.isArray(raw) ? raw : [raw]).filter(
      (u: unknown): u is string => typeof u === 'string' && u.length > 0
    );

    const blobUrls = urls.filter(isBlobUrl);
    if (blobUrls.length === 0) {
      // Nothing hosted on Blob to delete — treat as a no-op success.
      res.status(200).json({ deleted: 0 });
      return;
    }

    await del(blobUrls);
    res.status(200).json({ deleted: blobUrls.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Échec de la suppression du fichier.' });
  }
}
