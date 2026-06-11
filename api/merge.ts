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

/** Locates a bundled TTF font (best-effort). */
function findFontFile(): string | null {
  const candidates: string[] = [];
  // require.resolve also signals the Vercel bundler (nft) to include the asset.
  try {
    candidates.push(require.resolve('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'));
  } catch {
    /* not resolvable in this context */
  }
  const rel = 'node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf';
  candidates.push(
    path.join(process.cwd(), rel),
    path.join('/var/task', rel),
    path.join(__dirname, '..', rel),
    path.join(__dirname, '..', '..', rel)
  );
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Target render resolution for the overlay PNGs, by aspect ratio. */
function overlayDims(aspect?: string): { W: number; H: number } {
  if (aspect === '16:9') return { W: 1280, H: 720 };
  if (aspect === '1:1') return { W: 1080, H: 1080 };
  return { W: 720, H: 1280 }; // 9:16 default
}

/** A rounded, semi-transparent text "chip" (Satori VDOM node). */
function chip(text: string, fontSize: number, maxWidth: number, bgOpacity = 0.5, marginTop = 0): any {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        backgroundColor: `rgba(0,0,0,${bgOpacity})`,
        color: 'white',
        fontSize,
        fontWeight: 700,
        paddingTop: Math.round(fontSize * 0.3),
        paddingBottom: Math.round(fontSize * 0.3),
        paddingLeft: Math.round(fontSize * 0.7),
        paddingRight: Math.round(fontSize * 0.7),
        borderRadius: 16,
        maxWidth,
        marginTop,
        textAlign: 'center',
      },
      children: text,
    },
  };
}

function topElement(title: string, W: number, H: number): any {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: Math.round(H * 0.05),
      },
      children: chip(title, Math.round(H / 16), Math.round(W * 0.9), 0.5),
    },
  };
}

function bottomElement(cta: string | undefined, url: string | undefined, W: number, H: number): any {
  const children: any[] = [];
  if (cta) children.push(chip(cta, Math.round(H / 14), Math.round(W * 0.9), 0.55));
  if (url) children.push(chip(url, Math.round(H / 26), Math.round(W * 0.9), 0.5, children.length ? Math.round(H * 0.015) : 0));
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: Math.round(H * 0.08),
      },
      children,
    },
  };
}

/**
 * Burns the title (top, whole video) + CTA/URL (bottom, last seconds) by
 * compositing pre-rendered PNGs with ffmpeg's core `overlay` filter (the Linux
 * ffmpeg-static build has no `drawtext`/libfreetype, so text is rasterized with
 * Satori instead). Returns the ffmpeg args, or a reason when skipped.
 */
type OverlayResult =
  | { ok: true; inputs: string[]; filterComplex: string; mapLabel: string }
  | { ok: false; reason: string }
  | null;

async function buildOverlay(
  work: string,
  overlays: Overlays | undefined,
  totalDuration: number | undefined,
  aspectRatio: string | undefined
): Promise<OverlayResult> {
  const requested = !!(overlays && (overlays.title?.trim() || overlays.cta?.trim() || overlays.url?.trim()));
  if (!overlays || !requested) return null;

  const font = findFontFile();
  if (!font) return { ok: false, reason: 'police introuvable côté serveur' };

  // Loaded lazily so a native-module load failure (resvg) only disables the
  // overlay — it never crashes the whole merge function.
  let satori: any;
  let Resvg: any;
  try {
    satori = (await import('satori')).default;
    ({ Resvg } = await import('@resvg/resvg-js'));
  } catch {
    return { ok: false, reason: 'moteur de rendu texte indisponible côté serveur' };
  }

  const fontData = await fs.readFile(font);
  const { W, H } = overlayDims(aspectRatio);
  const ctaStart =
    typeof totalDuration === 'number' && totalDuration > 6 ? Math.max(0, Math.round(totalDuration - 4)) : 0;

  const renderPng = async (element: any, outFile: string): Promise<void> => {
    const svg = await satori(element, {
      width: W,
      height: H,
      fonts: [{ name: 'Inter', data: fontData, weight: 700, style: 'normal' }],
    });
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
    await fs.writeFile(outFile, png);
  };

  const inputs: string[] = [];
  const fc: string[] = [`[0:v]scale=${W}:${H},setsar=1[v0]`];
  let cur = 'v0';
  let idx = 1;

  if (overlays.title?.trim()) {
    const p = path.join(work, 'ov_top.png');
    await renderPng(topElement(overlays.title.trim(), W, H), p);
    inputs.push('-i', p);
    fc.push(`[${cur}][${idx}:v]overlay=0:0[v${idx}]`);
    cur = `v${idx}`;
    idx++;
  }
  if (overlays.cta?.trim() || overlays.url?.trim()) {
    const p = path.join(work, 'ov_bottom.png');
    await renderPng(bottomElement(overlays.cta?.trim(), overlays.url?.trim(), W, H), p);
    inputs.push('-i', p);
    const en = ctaStart > 0 ? `:enable='gte(t,${ctaStart})'` : '';
    fc.push(`[${cur}][${idx}:v]overlay=0:0${en}[v${idx}]`);
    cur = `v${idx}`;
    idx++;
  }

  return { ok: true, inputs, filterComplex: fc.join(';'), mapLabel: cur };
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
  const aspectRatio: string | undefined =
    typeof body.aspectRatio === 'string' ? body.aspectRatio : undefined;

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
    // Best-effort: if the font is missing or ffmpeg fails, keep the plain merge
    // but report why via `overlayWarning`.
    let videoFile = out;
    let overlayApplied = false;
    let overlayWarning: string | undefined;
    try {
      const overlay = await buildOverlay(work, overlays, totalDuration, aspectRatio);
      if (overlay && !overlay.ok) {
        overlayWarning = `Incrustation ignorée : ${overlay.reason}.`;
        console.error('[merge] overlay skipped', { reason: overlay.reason });
      } else if (overlay && overlay.ok) {
        const outOverlaid = path.join(work, 'overlaid.mp4');
        await runFfmpeg(ffmpegPath, [
          '-y', '-i', out, ...overlay.inputs,
          '-filter_complex', overlay.filterComplex,
          '-map', `[${overlay.mapLabel}]`, '-map', '0:a?',
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
          '-c:a', 'copy', '-movflags', '+faststart', outOverlaid,
        ]);
        videoFile = outOverlaid;
        overlayApplied = true;
      }
    } catch (e: any) {
      overlayWarning = `Incrustation échouée : ${String(e?.message || e).slice(-300)}`;
      console.error('[merge] overlay error', { message: String(e?.message || e) });
      videoFile = out;
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
      addRandomSuffix: true,
    });

    res.status(200).json({ url: blob.url, size: data.length, overlayApplied, overlayWarning });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Échec de la fusion.' });
  } finally {
    if (work) fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
