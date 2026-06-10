import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * POST /api/ai/text
 * Body: { prompt: string, schema: object (JSON schema) }
 * Returns: { object: <parsed JSON matching schema> }
 *
 * Structured text generation via Google Gemini (replaces blink.ai.generateObject).
 * Set GOOGLE_API_KEY in the Vercel project env. Optionally override the model
 * with GEMINI_MODEL (default: gemini-2.5-flash).
 */

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

  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'GOOGLE_API_KEY (ou GEMINI_API_KEY) non configurée côté serveur.' });
    return;
  }

  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
    const prompt: string = typeof body.prompt === 'string' ? body.prompt : '';
    const schema = body.schema;
    if (!prompt) {
      res.status(400).json({ error: 'Prompt manquant.' });
      return;
    }

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const generationConfig: Record<string, any> = { responseMimeType: 'application/json' };
    if (schema && typeof schema === 'object') {
      generationConfig.responseSchema = schema;
    }

    // Pass the key via the `x-goog-api-key` header (NOT the legacy `?key=` query
    // param). The newer Google AI Studio "auth keys" (prefix `AQ.`, bound to a
    // service account) are rejected on the query param but accepted via header;
    // legacy `AIza…` keys work both ways.
    const apiRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
      }),
    });

    const data = await apiRes.json().catch(() => null);
    if (!apiRes.ok) {
      const msg = data?.error?.message || `Gemini a répondu ${apiRes.status}`;
      // Surface the exact upstream error in Vercel runtime logs for debugging.
      console.error('[ai/text] Gemini error', {
        status: apiRes.status,
        model,
        message: msg,
        keyPrefix: apiKey ? `${apiKey.slice(0, 6)}…(${apiKey.length} chars)` : 'MISSING',
      });
      res.status(502).json({ error: msg });
      return;
    }

    const text: string | undefined = data?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p?.text || '')
      .join('');
    if (!text) {
      res.status(502).json({ error: 'Réponse vide du modèle de texte.' });
      return;
    }

    let object: any;
    try {
      object = JSON.parse(text);
    } catch {
      // Strip markdown fences if the model wrapped the JSON.
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      object = JSON.parse(cleaned);
    }

    res.status(200).json({ object });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Échec de la génération de texte.' });
  }
}
