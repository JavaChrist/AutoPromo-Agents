import type { VercelRequest, VercelResponse } from '@vercel/node';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { put } from '@vercel/blob';
import ffmpegPath from 'ffmpeg-static';

/**
 * POST /api/merge
 * Body: { urls: string[], fileName?: string }
 *
 * Downloads the ordered scene clips, concatenates them with ffmpeg (stream copy
 * when possible, re-encode as a fallback), uploads the result to Vercel Blob and
 * returns { url }. Only runs on Vercel (or `vercel dev`) — not in `expo start`.
 *
 * Requires env BLOB_READ_WRITE_TOKEN (auto-set when a Vercel Blob store is linked).
 */

async function downloadTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Téléchargement échoué (${res.status}) : ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
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
      code === 0 ? resolve() : reject(new Error(`ffmpeg (code ${code}) : ${stderr.slice(-600)}`))
    );
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée.' });
    return;
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
  const urls: string[] = Array.isArray(body.urls) ? body.urls : [];
  const fileName: string = typeof body.fileName === 'string' ? body.fileName : 'video';

  if (urls.length < 2) {
    res.status(400).json({ error: 'Fournis au moins 2 scènes à assembler.' });
    return;
  }
  if (!ffmpegPath) {
    res.status(500).json({ error: 'Binaire ffmpeg introuvable côté serveur.' });
    return;
  }

  let work: string | null = null;
  try {
    work = await fs.mkdtemp(path.join(os.tmpdir(), 'merge-'));

    const files: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      const dest = path.join(work, `scene_${String(i).padStart(3, '0')}.mp4`);
      await downloadTo(urls[i], dest);
      files.push(dest);
    }

    const listFile = path.join(work, 'list.txt');
    await fs.writeFile(listFile, files.map((f) => `file '${f}'`).join('\n'), 'utf8');

    const out = path.join(work, 'final.mp4');
    try {
      // Fast path: no re-encode (scenes share codec/resolution/fps).
      await runFfmpeg(ffmpegPath, [
        '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
        '-c', 'copy', '-movflags', '+faststart', out,
      ]);
    } catch {
      // Robust fallback: re-encode to a uniform H.264/AAC MP4.
      await runFfmpeg(ffmpegPath, [
        '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
        '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out,
      ]);
    }

    const data = await fs.readFile(out);
    const safeName = fileName.replace(/[^a-z0-9-_]+/gi, '-').slice(0, 60) || 'video';
    const blob = await put(`merged/${safeName}-${Date.now()}.mp4`, data, {
      access: 'public',
      contentType: 'video/mp4',
    });

    res.status(200).json({ url: blob.url, size: data.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Échec de la fusion.' });
  } finally {
    if (work) fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
