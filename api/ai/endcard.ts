import type { VercelRequest, VercelResponse } from '@vercel/node';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { put } from '@vercel/blob';
import ffmpegPath from 'ffmpeg-static';

/**
 * POST /api/ai/endcard
 * Body: { imageUrl: string, duration?: number (s, default 8), zoom?: boolean (default true) }
 * Returns: { video_url: string }
 *
 * Renders a STATIC end card (logo / URL / CTA) as a 9:16 720x1280 H.264 24fps
 * clip directly from the provided image — NO generative model (Veo degrades
 * logos). Output matches the Veo clips' format so it concatenates cleanly.
 */

const W = 720;
const H = 1280;
const FPS = 24;

function setCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function downloadTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Téléchargement de l'image échoué (${res.status}).`);
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args);
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg (code ${code}) : ${stderr.slice(-500)}`))
    );
  });
}

/** Static frame scaled/cropped to 720x1280 (no motion). */
function staticArgs(img: string, dur: number, out: string): string[] {
  return [
    '-y', '-loop', '1', '-i', img, '-t', String(dur), '-r', String(FPS),
    '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', out,
  ];
}

/** Subtle Ken-Burns zoom from a single upscaled frame. */
function zoomArgs(img: string, dur: number, out: string): string[] {
  const frames = Math.max(1, Math.round(dur * FPS));
  return [
    '-y', '-i', img,
    '-vf',
    `scale=${W * 3}:${H * 3}:force_original_aspect_ratio=increase,crop=${W * 3}:${H * 3},` +
      `zoompan=z='min(1+0.0006*on,1.10)':d=${frames}:s=${W}x${H}:fps=${FPS},format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', out,
  ];
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
  if (!ffmpegPath) {
    res.status(500).json({ error: 'Binaire ffmpeg introuvable côté serveur.' });
    return;
  }
  const hasBlobAuth =
    !!process.env.BLOB_READ_WRITE_TOKEN ||
    (!!process.env.BLOB_STORE_ID && !!process.env.VERCEL_OIDC_TOKEN);
  if (!hasBlobAuth) {
    res.status(503).json({ error: 'Stockage Vercel Blob non configuré.' });
    return;
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
  const imageUrl: string = typeof body.imageUrl === 'string' ? body.imageUrl : '';
  const duration = Math.min(15, Math.max(2, Number(body.duration) || 8));
  const zoom = body.zoom !== false;
  if (!imageUrl) {
    res.status(400).json({ error: 'imageUrl manquante.' });
    return;
  }

  let work: string | null = null;
  try {
    work = await fs.mkdtemp(path.join(os.tmpdir(), 'endcard-'));
    const img = path.join(work, 'card.png');
    await downloadTo(imageUrl, img);
    const out = path.join(work, 'endcard.mp4');

    if (zoom) {
      try {
        await runFfmpeg(ffmpegPath, zoomArgs(img, duration, out));
      } catch {
        await runFfmpeg(ffmpegPath, staticArgs(img, duration, out));
      }
    } else {
      await runFfmpeg(ffmpegPath, staticArgs(img, duration, out));
    }

    const data = await fs.readFile(out);
    const blob = await put(`endcards/endcard-${Date.now()}.mp4`, data, {
      access: 'public',
      contentType: 'video/mp4',
      addRandomSuffix: true,
    });

    res.status(200).json({ video_url: blob.url, size: data.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Échec de la génération de la carte de fin.' });
  } finally {
    if (work) fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
