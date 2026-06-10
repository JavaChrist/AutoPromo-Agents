import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put } from '@vercel/blob';

/**
 * POST /api/upload
 * Body: { data: string (base64), ext: 'png' | 'jpg' | 'jpeg' | 'gif' | 'webp' }
 *
 * Uploads a screenshot to Vercel Blob and returns { url }. Unlike Blink storage
 * (which rewrites files to `....blob`), Vercel Blob keeps the file extension in
 * the URL — required by the AI video models' image_url validation.
 *
 * CORS is open so the local dev app (expo on localhost) can use the deployed
 * endpoint.
 */

const ALLOWED_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

function setCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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
    const data: string = typeof body.data === 'string' ? body.data : '';
    const ext: string = String(body.ext || 'png').toLowerCase();

    if (!data) {
      res.status(400).json({ error: 'Image manquante.' });
      return;
    }
    if (!ALLOWED_EXT[ext]) {
      res.status(400).json({ error: `Format non supporté : ${ext}` });
      return;
    }

    const buffer = Buffer.from(data, 'base64');
    if (buffer.length > 4 * 1024 * 1024) {
      res.status(413).json({ error: 'Image trop lourde (max 4 Mo).' });
      return;
    }

    const name = `screenshots/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const blob = await put(name, buffer, {
      access: 'public',
      contentType: ALLOWED_EXT[ext],
      addRandomSuffix: true,
    });

    res.status(200).json({ url: blob.url });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Échec de l'upload." });
  }
}
