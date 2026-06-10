import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * POST /api/ai/video
 * Body: { model: string (fal model id), input: object }
 * Returns: { video_url: string }
 *
 * Video generation via fal.ai (replaces blink.ai.generateVideo). The model ids
 * are the same fal ids already used in the app (fal-ai/veo3.1, fal-ai/kling-...).
 * Set FAL_KEY in the Vercel project env.
 *
 * Uses fal's synchronous endpoint, which blocks until the clip is ready — make
 * sure this function has a generous maxDuration in vercel.json.
 */

function setCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/** fal video models return the clip under different keys depending on the model. */
function extractVideoUrl(data: any): string | undefined {
  return (
    data?.video?.url ||
    data?.video_url ||
    data?.output?.video?.url ||
    (Array.isArray(data?.videos) ? data.videos[0]?.url : undefined) ||
    data?.url
  );
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

  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    res.status(503).json({ error: 'FAL_KEY non configurée côté serveur.' });
    return;
  }

  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
    const model: string = typeof body.model === 'string' ? body.model : '';
    const input = body.input && typeof body.input === 'object' ? body.input : {};
    if (!model) {
      res.status(400).json({ error: 'Modèle vidéo manquant.' });
      return;
    }

    const apiRes = await fetch(`https://fal.run/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });

    const data = await apiRes.json().catch(() => null);
    if (!apiRes.ok) {
      const msg =
        data?.detail?.[0]?.msg ||
        (typeof data?.detail === 'string' ? data.detail : undefined) ||
        data?.error ||
        `fal.ai a répondu ${apiRes.status}`;
      res.status(apiRes.status >= 400 && apiRes.status < 500 ? apiRes.status : 502).json({ error: msg });
      return;
    }

    const video_url = extractVideoUrl(data);
    if (!video_url) {
      res.status(502).json({ error: 'fal.ai n\'a pas renvoyé d\'URL vidéo.' });
      return;
    }

    res.status(200).json({ video_url });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Échec de la génération vidéo.' });
  }
}
