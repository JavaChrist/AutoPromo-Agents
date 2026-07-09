import type { VercelRequest, VercelResponse } from '@vercel/node';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { put } from '@vercel/blob';
import ffmpegPath from 'ffmpeg-static';

/**
 * POST /api/slideshow — assembles the "Promo écrans" hybrid video.
 *
 * Body: {
 *   aspectRatio: '9:16'|'16:9'|'1:1',
 *   fileName?: string,
 *   musicUrl?: string,
 *   segments: Array<{
 *     type: 'ambiance' | 'app_demo',
 *     audioUrl?: string,        // per-segment voice-over MP3 (sets the duration)
 *     durationSec?: number,     // fallback duration when there is no audio
 *     videoUrl?: string,        // ambiance: AI/imported clip
 *     imageUrl?: string,        // ambiance: imported still image
 *     shots?: string[],         // app_demo: ordered real screenshots (logo last)
 *   }>
 * }
 *
 * Each segment lasts its voice-over line (auto timing). `ambiance` clips loop to
 * fill it; `app_demo` screenshots scroll vertically (phone-like) with the images
 * shown edge-to-edge. Segments are concatenated, then the optional background
 * music is mixed under the continuous voice-over. Returns { url, size }.
 */

interface Segment {
  type: 'ambiance' | 'app_demo';
  audioUrl?: string;
  durationSec?: number;
  videoUrl?: string;
  imageUrl?: string;
  shots?: string[];
}

function dims(aspect?: string): { W: number; H: number } {
  if (aspect === '16:9') return { W: 1280, H: 720 };
  if (aspect === '1:1') return { W: 1080, H: 1080 };
  return { W: 720, H: 1280 };
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

/** Reads a media file's duration (seconds) by parsing ffmpeg's stderr. */
function probeDuration(bin: string, file: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(bin, ['-i', file]);
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    const done = () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) return resolve(0);
      resolve(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
    };
    proc.on('error', () => resolve(0));
    proc.on('close', done);
  });
}

async function downloadTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Téléchargement échoué (${res.status}) : ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
}

const PAD = (W: number, H: number) =>
  `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;

const clampDuration = (d: number) => Math.min(15, Math.max(1.8, d || 0));

const ENC_VIDEO = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p'];
const ENC_AUDIO = ['-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2'];

/** Builds the audio input args + the [1:a] label. Uses silence when no voice. */
function audioArgs(voiceFile: string | null, D: number): string[] {
  return voiceFile
    ? ['-i', voiceFile]
    : ['-f', 'lavfi', '-t', String(D), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000'];
}

/** Ambiance clip: loop the video to fill D, drop its own audio, add the VO. */
async function renderVideoSegment(
  bin: string, videoFile: string, voiceFile: string | null, D: number, W: number, H: number, out: string
): Promise<void> {
  await runFfmpeg(bin, [
    '-y', '-stream_loop', '-1', '-i', videoFile, ...audioArgs(voiceFile, D),
    '-filter_complex', `[0:v]${PAD(W, H)},fps=30,format=yuv420p[v];[1:a]apad[a]`,
    '-map', '[v]', '-map', '[a]', '-t', String(D), '-r', '30',
    ...ENC_VIDEO, ...ENC_AUDIO, '-movflags', '+faststart', out,
  ]);
}

/** Still image (ambiance import or single screenshot): slow Ken Burns push-in. */
async function renderKenBurns(
  bin: string, imageFile: string, voiceFile: string | null, D: number, W: number, H: number, out: string
): Promise<void> {
  const frames = Math.max(2, Math.round(D * 30));
  const vf =
    `[0:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=decrease,` +
    `pad=${W * 2}:${H * 2}:(ow-iw)/2:(oh-ih)/2:color=black,` +
    `zoompan=z='min(zoom+0.0008,1.15)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=30,` +
    `setsar=1,format=yuv420p[v];[1:a]apad[a]`;
  await runFfmpeg(bin, [
    '-y', '-loop', '1', '-t', String(D), '-i', imageFile, ...audioArgs(voiceFile, D),
    '-filter_complex', vf,
    '-map', '[v]', '-map', '[a]', '-t', String(D), '-r', '30',
    ...ENC_VIDEO, ...ENC_AUDIO, '-movflags', '+faststart', out,
  ]);
}

/** App demo with several screenshots: vertical scroll through a tall stack. */
async function renderScroll(
  bin: string, shotFiles: string[], voiceFile: string | null, D: number, W: number, H: number, work: string, out: string
): Promise<void> {
  if (shotFiles.length === 1) {
    await renderKenBurns(bin, shotFiles[0], voiceFile, D, W, H, out);
    return;
  }
  // Pass 1: stack all screenshots vertically into one tall image (each full-width).
  const stack = path.join(work, `stack_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.png`);
  const inputs = shotFiles.flatMap((f) => ['-i', f]);
  const scales = shotFiles.map((_, i) => `[${i}:v]scale=${W}:-2[s${i}]`);
  const chain = shotFiles.map((_, i) => `[s${i}]`).join('');
  await runFfmpeg(bin, [
    '-y', ...inputs,
    '-filter_complex', `${scales.join(';')};${chain}vstack=inputs=${shotFiles.length}[o]`,
    '-map', '[o]', '-frames:v', '1', '-update', '1', stack,
  ]);

  // Pass 2: scroll a WxH window from top to bottom over the whole duration.
  const yExpr = `min(max((ih-${H})*(t/${D})\\,0)\\,ih-${H})`;
  const vf =
    `[0:v]scale=${W}:-2,pad=${W}:'max(ih\\,${H})':0:0:color=black,` +
    `crop=${W}:${H}:0:'${yExpr}',fps=30,setsar=1,format=yuv420p[v];[1:a]apad[a]`;
  await runFfmpeg(bin, [
    '-y', '-loop', '1', '-t', String(D), '-i', stack, ...audioArgs(voiceFile, D),
    '-filter_complex', vf,
    '-map', '[v]', '-map', '[a]', '-t', String(D), '-r', '30',
    ...ENC_VIDEO, ...ENC_AUDIO, '-movflags', '+faststart', out,
  ]);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée.' });
    return;
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
  const segments: Segment[] = Array.isArray(body.segments) ? body.segments : [];
  const aspectRatio: string | undefined = typeof body.aspectRatio === 'string' ? body.aspectRatio : undefined;
  const fileName: string = typeof body.fileName === 'string' ? body.fileName : 'promo';
  const musicUrl: string | undefined = typeof body.musicUrl === 'string' ? body.musicUrl : undefined;

  if (segments.length < 1) {
    res.status(400).json({ error: 'Fournis au moins 1 segment.' });
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
    res.status(503).json({
      error: 'Stockage Vercel Blob non configuré. Connecte un store Blob au projet, puis redéploie.',
    });
    return;
  }

  const { W, H } = dims(aspectRatio);
  let work: string | null = null;
  try {
    work = await fs.mkdtemp(path.join(os.tmpdir(), 'promo-'));
    const bin = ffmpegPath;

    const segFiles: string[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];

      // Per-segment voice-over sets the duration (auto timing on the voice).
      let voiceFile: string | null = null;
      let D = clampDuration(seg.durationSec || (seg.type === 'ambiance' ? 6 : 5));
      if (seg.audioUrl) {
        voiceFile = path.join(work, `voice_${i}.mp3`);
        await downloadTo(seg.audioUrl, voiceFile);
        const probed = await probeDuration(bin, voiceFile);
        if (probed > 0) D = clampDuration(probed + 0.3); // small tail so the line finishes
      }

      const out = path.join(work, `seg_${String(i).padStart(3, '0')}.mp4`);
      try {
        if (seg.type === 'ambiance' && seg.videoUrl) {
          const vf = path.join(work, `amb_${i}.mp4`);
          await downloadTo(seg.videoUrl, vf);
          await renderVideoSegment(bin, vf, voiceFile, D, W, H, out);
        } else if (seg.type === 'ambiance' && seg.imageUrl) {
          const img = path.join(work, `amb_${i}.img`);
          await downloadTo(seg.imageUrl, img);
          await renderKenBurns(bin, img, voiceFile, D, W, H, out);
        } else {
          const shots = Array.isArray(seg.shots) ? seg.shots.filter(Boolean) : [];
          if (shots.length === 0) {
            throw new Error('segment "démo écrans" sans capture');
          }
          const shotFiles: string[] = [];
          for (let j = 0; j < shots.length; j++) {
            const sf = path.join(work, `shot_${i}_${j}.img`);
            await downloadTo(shots[j], sf);
            shotFiles.push(sf);
          }
          await renderScroll(bin, shotFiles, voiceFile, D, W, H, work, out);
        }
      } catch (e: any) {
        throw new Error(`Segment ${i + 1} : ${String(e?.message || e).slice(-300)}`);
      }
      segFiles.push(out);
    }

    // Concatenate the uniform segments (stream copy — all share codec params).
    const listFile = path.join(work, 'list.txt');
    await fs.writeFile(listFile, segFiles.map((f) => `file '${f}'`).join('\n'), 'utf8');
    const concat = path.join(work, 'concat.mp4');
    await runFfmpeg(bin, [
      '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
      '-c', 'copy', '-movflags', '+faststart', concat,
    ]);

    // Optional background music, mixed low under the continuous voice-over.
    let finalFile = concat;
    if (musicUrl) {
      const musicFile = path.join(work, 'music.mp3');
      await downloadTo(musicUrl, musicFile);
      const outMusic = path.join(work, 'final.mp4');
      await runFfmpeg(bin, [
        '-y', '-i', concat, '-i', musicFile,
        '-filter_complex',
        '[1:a]aloop=loop=-1:size=2e9,volume=0.16[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0[a]',
        '-map', '0:v', '-map', '[a]',
        '-c:v', 'copy', ...ENC_AUDIO, '-movflags', '+faststart', outMusic,
      ]);
      finalFile = outMusic;
    }

    const data = await fs.readFile(finalFile);
    const safeName = fileName.replace(/[^a-z0-9-_]+/gi, '-').slice(0, 60) || 'promo';
    const blob = await put(`promo/${safeName}-${Date.now()}.mp4`, data, {
      access: 'public',
      contentType: 'video/mp4',
      addRandomSuffix: true,
    });

    res.status(200).json({ url: blob.url, size: data.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Échec du montage.' });
  } finally {
    if (work) fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
