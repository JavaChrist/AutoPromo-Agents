/**
 * Prompt "hard lock" layer for image-to-video (Veo 3.1 Fast).
 *
 * In image-to-video, any instruction describing motion ON the screen (taps,
 * navigation, animations, transitions…) makes the model drop the seed image and
 * hallucinate a generic UI/logo. This module post-processes the AI-generated
 * prompt depending on the scene type, neutralizing those terms and appending a
 * non-negotiable "static screen" constraint.
 *
 * Pure & framework-agnostic — safe to unit test.
 */

export type SceneType = 'screen' | 'ambiance' | 'end_card';

export interface VeoScene {
  /** What the scene shows: a real app capture, an ambiance shot, or an end card. */
  type: SceneType;
  /** The raw prompt produced by the AI director. */
  prompt: string;
  /** Seed image URL (for `screen` scenes in image-to-video). */
  imageUrl?: string;
}

export interface VeoPromptResult {
  /** Final prompt to send to Veo, or `null` when the scene must NOT use Veo (end_card). */
  prompt: string | null;
  /** Optional negative prompt for models that accept one. */
  negativePrompt?: string;
  /** True when the scene must be produced WITHOUT a generative model (end_card). */
  skip: boolean;
}

/** Locked, non-negotiable suffix appended to every `screen` scene prompt. */
export const SCREEN_LOCK_SUFFIX =
  'The on-screen content stays completely static and unchanged throughout — no navigation, no tapping, no UI animation, no home screen, no logo redraw, no text change. All motion comes ONLY from a slow, subtle camera movement and the surrounding environment. No brand logos visible. Vertical 9:16.';

/** Light suffix for ambiance scenes (no screen to protect). */
export const AMBIANCE_SUFFIX = 'No brand logos visible. Vertical 9:16.';

/** Negative prompt for `screen` scenes (used when the model supports one). */
export const SCREEN_NEGATIVE_PROMPT =
  'navigation, tapping, scrolling, swiping, cursor, clicking, UI animation, screen transition, home screen, logo redraw, text change, moving interface elements, different UI, regenerated screen, brand logos, captions, subtitles';

/**
 * Single words (whole-word, case-insensitive) that induce on-screen motion and
 * must be neutralized for `screen` scenes.
 */
const MOVEMENT_WORDS = [
  'tap',
  'taps',
  'tapping',
  'navigate',
  'navigates',
  'navigating',
  'scroll',
  'scrolls',
  'scrolling',
  'swipe',
  'swipes',
  'swiping',
  'cursor',
  'click',
  'clicks',
  'clicking',
  'animate',
  'animates',
  'animation',
  'animations',
  'animated',
  'morph',
  'morphs',
  'morphing',
  'transition',
  'transitions',
  'transitioning',
];

/** Multi-word phrases to neutralize for `screen` scenes. */
const MOVEMENT_PHRASES = ['ui animation', 'screen transition', 'home screen'];

/** Removes movement-inducing terms (whole words & phrases) and tidies whitespace. */
export function neutralizeScreenMotion(prompt: string): string {
  let out = prompt;

  for (const phrase of MOVEMENT_PHRASES) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'gi'), '');
  }

  out = out.replace(new RegExp(`\\b(?:${MOVEMENT_WORDS.join('|')})\\b`, 'gi'), '');

  // Tidy up: collapse spaces, fix orphaned punctuation/articles left behind.
  return out
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\./g, '.')
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Post-processes an AI-generated prompt for Veo according to the scene type.
 *
 * - `screen`   → neutralize on-screen motion terms + append the locked static
 *                suffix, and provide a negative prompt.
 * - `ambiance` → leave the content untouched, append a light suffix.
 * - `end_card` → returns `{ prompt: null, skip: true }` (must be rendered
 *                locally with ffmpeg, never through a generative model).
 */
export function buildVeoPrompt(scene: VeoScene): VeoPromptResult {
  if (scene.type === 'end_card') {
    return { prompt: null, skip: true };
  }

  if (scene.type === 'ambiance') {
    const base = (scene.prompt || '').trim();
    return { prompt: `${base} ${AMBIANCE_SUFFIX}`.trim(), skip: false };
  }

  // 'screen'
  const cleaned = neutralizeScreenMotion(scene.prompt || '');
  const prompt = `${cleaned} ${SCREEN_LOCK_SUFFIX}`.trim();
  return { prompt, negativePrompt: SCREEN_NEGATIVE_PROMPT, skip: false };
}
