import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put } from '@vercel/blob';

/**
 * POST /api/ai/speech
 * Body: { text: string, voice?: string }
 * Returns: { url: string }  (public MP3 hosted on Vercel Blob)
 *
 * Text-to-speech via OpenAI (replaces blink.ai.generateSpeech). OpenAI returns
 * raw audio bytes, so we persist the MP3 to Vercel Blob and return its URL —
 * matching the previous behaviour where the app received a playable URL.
 *
 * Requires OPENAI_API_KEY and Vercel Blob (BLOB_READ_WRITE_TOKEN) in the env.
 * Optionally override the model with OPENAI_TTS_MODEL (default: tts-1).
 */

const VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'OPENAI_API_KEY non configurée côté serveur.' });
    return;
  }
  const hasBlobAuth =
    !!process.env.BLOB_READ_WRITE_TOKEN ||
    (!!process.env.BLOB_STORE_ID && !!process.env.VERCEL_OIDC_TOKEN);
  if (!hasBlobAuth) {
    res.status(503).json({ error: 'Stockage Vercel Blob non configuré (pour héberger le MP3).' });
    return;
  }

  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
    const text: string = typeof body.text === 'string' ? body.text : '';
    const voice: string = VOICES.includes(body.voice) ? body.voice : 'nova';
    if (!text.trim()) {
      res.status(400).json({ error: 'Texte manquant pour la voix off.' });
      return;
    }

    const model = process.env.OPENAI_TTS_MODEL || 'tts-1';
    const apiRes = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, voice, input: text, response_format: 'mp3' }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text().catch(() => '');
      let msg = `OpenAI a répondu ${apiRes.status}`;
      try {
        msg = JSON.parse(errText)?.error?.message || msg;
      } catch {
        /* keep default */
      }
      res.status(502).json({ error: msg });
      return;
    }

    const arrayBuffer = await apiRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const name = `voiceovers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    const blob = await put(name, buffer, {
      access: 'public',
      contentType: 'audio/mpeg',
      addRandomSuffix: true,
    });

    res.status(200).json({ url: blob.url });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Échec de la génération de la voix off.' });
  }
}
