import type { VercelRequest, VercelResponse } from '@vercel/node';
import { promises as fs, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { put } from '@vercel/blob';
import ffmpegPath from 'ffmpeg-static';

interface Overlays {
  title?: string;
  cta?: string;
  url?: string;
}

/** Locates a bundled TTF font for ffmpeg drawtext (best-effort). */
function findFontFile(): string | null {
  const rel = 'node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf';
  const candidates = [path.join(process.cwd(), rel), path.join('/var/task', rel)];
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Builds an ffmpeg `-vf` drawtext chain that burns the title (top, whole video),
 * CTA and URL (bottom, last seconds) onto the video. Text is written to files to
 * avoid escaping issues with accents/apostrophes. Returns null if nothing to draw.
 */
async function buildOverlayFilter(
  work: string,
  overlays: Overlays | undefined,
  totalDuration: number | undefined
): Promise<string | null> {
  if (!overlays) return null;
  const font = findFontFile();
  if (!font) return null;

  const fontPath = font.replace(/\\/g, '/');
  const parts: string[] = [];
  const writeText = async (name: string, text: string): Promise<string> => {
    const f = path.join(work, name);
    await fs.writeFile(f, text, 'utf8');
    return f.replace(/\\/g, '/');
  };

  // CTA/URL only appear during the last ~4s when we know the total duration.
  const ctaStart =
    typeof totalDuration === 'number' && totalDuration > 6 ? Math.max(0, Math.round(totalDuration - 4)) : null;
  const enable = ctaStart != null ? `:enable=gte(t\\,${ctaStart})` : '';

  if (overlays.title?.trim()) {
    const tf = await writeText('ov_title.txt', overlays.title.trim());
    parts.push(
      `drawtext=fontfile='${fontPath}':textfile='${tf}':fontcolor=white:fontsize=h/18:box=1:boxcolor=black@0.45:boxborderw=16:x=(w-text_w)/2:y=h*0.06`
    );
  }
  if (overlays.cta?.trim()) {
    const tf = await writeText('ov_cta.txt', overlays.cta.trim());
    parts.push(
      `drawtext=fontfile='${fontPath}':textfile='${tf}':fontcolor=white:fontsize=h/13:box=1:boxcolor=black@0.55:boxborderw=22:x=(w-text_w)/2:y=h*0.72${enable}`
    );
  }
  if (overlays.url?.trim()) {
    const tf = await writeText('ov_url.txt', overlays.url.trim());
    parts.push(
      `drawtext=fontfile='${fontPath}':textfile='${tf}':fontcolor=white:fontsize=h/24:box=1:boxcolor=black@0.5:boxborderw=12:x=(w-text_w)/2:y=h*0.84${enable}`
    );
  }

  return parts.length ? parts.join(',') : null;
}

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
  const audioUrl: string | undefined = typeof body.audioUrl === 'string' ? body.audioUrl : undefined;
  const overlays: Overlays | undefined =
    body.overlays && typeof body.overlays === 'object' ? body.overlays : undefined;
  const totalDuration: number | undefined =
    typeof body.totalDuration === 'number' ? body.totalDuration : undefined;

  if (urls.length < 2) {
    res.status(400).json({ error: 'Fournis au moins 2 scènes à assembler.' });
    return;
  }
  if (!ffmpegPath) {
    res.status(500).json({ error: 'Binaire ffmpeg introuvable côté serveur.' });
    return;
  }
  // @vercel/blob authenticates via OIDC (VERCEL_OIDC_TOKEN + BLOB_STORE_ID) by
  // default on Vercel, or via a static BLOB_READ_WRITE_TOKEN. Accept either.
  const hasBlobAuth =
    !!process.env.BLOB_READ_WRITE_TOKEN ||
    (!!process.env.BLOB_STORE_ID && !!process.env.VERCEL_OIDC_TOKEN);
  if (!hasBlobAuth) {
    res.status(503).json({
      error:
        "Stockage Vercel Blob non configuré. Connecte un store Blob au projet (Vercel → Storage), puis redéploie.",
    });
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

    // Optional text overlays (brand/title + CTA + URL) burned onto the video.
    // Best-effort: if the font is missing or ffmpeg fails, keep the plain merge.
    let videoFile = out;
    const overlayFilter = await buildOverlayFilter(work, overlays, totalDuration);
    if (overlayFilter) {
      const outOverlaid = path.join(work, 'overlaid.mp4');
      try {
        await runFfmpeg(ffmpegPath, [
          '-y', '-i', out, '-vf', overlayFilter,
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
          '-c:a', 'copy', '-movflags', '+faststart', outOverlaid,
        ]);
        videoFile = outOverlaid;
      } catch {
        // Overlay failed (e.g. font/codec issue) → fall back to the plain merge.
        videoFile = out;
      }
    }

    // Optional voiceover: mix it over the merged video's audio (background
    // lowered to 25%), or use it as the only track if the video is silent.
    let finalFile = videoFile;
    if (audioUrl) {
      const voiceFile = path.join(work, 'voice.mp3');
      await downloadTo(audioUrl, voiceFile);
      const outVoice = path.join(work, 'final_voice.mp4');
      try {
        await runFfmpeg(ffmpegPath, [
          '-y', '-i', videoFile, '-i', voiceFile,
          '-filter_complex',
          '[0:a]volume=0.25[bg];[1:a]apad[vo];[bg][vo]amix=inputs=2:duration=first:dropout_transition=0[a]',
          '-map', '0:v', '-map', '[a]',
          '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
          '-movflags', '+faststart', outVoice,
        ]);
      } catch {
        // The merged video probably has no audio track → voiceover becomes the only track.
        await runFfmpeg(ffmpegPath, [
          '-y', '-i', videoFile, '-i', voiceFile,
          '-filter_complex', '[1:a]apad[a]',
          '-map', '0:v', '-map', '[a]',
          '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
          '-shortest', '-movflags', '+faststart', outVoice,
        ]);
      }
      finalFile = outVoice;
    }

    const data = await fs.readFile(finalFile);
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
