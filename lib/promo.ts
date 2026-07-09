import { postJSON } from './api';

/**
 * "Promo écrans" mode — a hybrid promotional video that alternates:
 *  - `ambiance` segments: a short lifestyle shot (AI clip or an imported media)
 *    that sets the narrative (characters, real-life situation, no app screen).
 *  - `app_demo` segments: the user's REAL screenshots scrolled/zoomed inside a
 *    phone-like frame — 100% faithful, never garbled by an AI model.
 *
 * A continuous voice-over (one line per segment) is timed to the segments, with
 * an optional low background music. No burned-in text (kept clean on purpose).
 *
 * The whole storyboard is serialized to JSON and stored in the project's
 * `voiceover_full` column, so no DB migration is needed. The project is tagged
 * with `model: 'slideshow'` to tell it apart from the AI long-form projects.
 */

export const PROMO_PROJECT_MODEL = 'slideshow';

export type PromoSegmentType = 'ambiance' | 'app_demo';

export interface PromoSegment {
  id: string;
  type: PromoSegmentType;
  /** French voice-over line read while this segment plays. */
  voice: string;
  // ── ambiance ──────────────────────────────────────────────────────────────
  /** AI visual prompt (English) for `ambiance` clips generated with Veo. */
  prompt?: string;
  /** Resolved media URL: an AI clip, or an imported video/image. */
  mediaUrl?: string;
  mediaKind?: 'ai' | 'video' | 'image';
  clipStatus?: 'idle' | 'generating' | 'ready' | 'failed';
  clipError?: string;
  // ── app_demo ────────────────────────────────────────────────────────────────
  /** Ordered screenshot URLs to scroll through (put the logo last). */
  shots?: string[];
  /** Optional fixed duration (s) when there is no voice line to time on. */
  durationSec?: number;
}

export interface PromoStoryboard {
  /** OpenAI TTS voice id used for the whole video. */
  voice: string;
  /** Optional background-music URL (imported MP3, hosted on Blob). */
  musicUrl?: string;
  segments: PromoSegment[];
}

export function emptyStoryboard(voice = 'nova'): PromoStoryboard {
  return { voice, musicUrl: undefined, segments: [] };
}

/** Parse the JSON storyboard stored on a project (tolerant to bad/empty data). */
export function parseStoryboard(raw: string | undefined | null): PromoStoryboard {
  if (!raw) return emptyStoryboard();
  try {
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.segments)) {
      return { voice: data.voice || 'nova', musicUrl: data.musicUrl || undefined, segments: data.segments };
    }
  } catch {
    /* not JSON (legacy plain voiceover text) → start fresh */
  }
  return emptyStoryboard();
}

export function serializeStoryboard(sb: PromoStoryboard): string {
  return JSON.stringify(sb);
}

export function newSegmentId(): string {
  return `seg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Server assembly call ─────────────────────────────────────────────────────

export interface PromoRenderSegment {
  type: PromoSegmentType;
  /** VO audio (MP3 URL) already generated for this segment, if any. */
  audioUrl?: string;
  /** Fallback duration (s) when there is no audio. */
  durationSec?: number;
  // ambiance
  videoUrl?: string;
  imageUrl?: string;
  // app_demo
  shots?: string[];
}

export interface PromoRenderResult {
  url: string;
  size: number;
}

/**
 * Calls the serverless slideshow endpoint to assemble the final MP4. Only works
 * on the deployed site (Vercel) — in `expo start --web` there is no /api server.
 */
export async function buildPromoVideo(
  segments: PromoRenderSegment[],
  options: { aspectRatio: string; fileName?: string; musicUrl?: string }
): Promise<PromoRenderResult> {
  return postJSON<PromoRenderResult>('/api/slideshow', {
    segments,
    aspectRatio: options.aspectRatio,
    fileName: options.fileName || 'promo',
    musicUrl: options.musicUrl,
  });
}
