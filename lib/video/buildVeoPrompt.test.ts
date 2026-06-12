import { describe, it, expect } from 'vitest';
import {
  buildVeoPrompt,
  neutralizeScreenMotion,
  SCREEN_LOCK_SUFFIX,
  AMBIANCE_SUFFIX,
} from './buildVeoPrompt';

describe('buildVeoPrompt', () => {
  it('(a) cleans on-screen motion terms and appends the locked suffix for a screen scene', () => {
    const res = buildVeoPrompt({
      type: 'screen',
      prompt: 'A hand taps and navigates the home screen with a smooth UI animation.',
      imageUrl: 'https://example.com/shot.png',
    });

    expect(res.skip).toBe(false);
    expect(res.prompt).toBeTruthy();
    const prompt = res.prompt as string;

    // The locked suffix and a negative prompt are present.
    expect(prompt.endsWith(SCREEN_LOCK_SUFFIX)).toBe(true);
    expect(res.negativePrompt).toBeTruthy();

    // Inspect only the AI part (before the locked suffix), since the suffix
    // itself legitimately mentions "UI animation"/"home screen" as negations.
    const aiPart = prompt.slice(0, prompt.length - SCREEN_LOCK_SUFFIX.length);
    expect(/\btaps\b/i.test(aiPart)).toBe(false);
    expect(/\bnavigates\b/i.test(aiPart)).toBe(false);
    expect(/\bui animation\b/i.test(aiPart)).toBe(false);
    expect(/\bhome screen\b/i.test(aiPart)).toBe(false);
  });

  it('(b) does not clean an ambiance scene, only adds a light suffix', () => {
    const original = 'A person taps their phone while walking through a sunny park.';
    const res = buildVeoPrompt({ type: 'ambiance', prompt: original });

    expect(res.skip).toBe(false);
    // The word "taps" is preserved for ambiance scenes (no screen to protect).
    expect(res.prompt).toContain('taps');
    expect(res.prompt?.endsWith(AMBIANCE_SUFFIX)).toBe(true);
    expect(res.negativePrompt).toBeUndefined();
  });

  it('(c) returns no Veo prompt for an end_card scene', () => {
    const res = buildVeoPrompt({ type: 'end_card', prompt: 'logo + url + cta' });
    expect(res.skip).toBe(true);
    expect(res.prompt).toBeNull();
  });

  it('neutralizeScreenMotion is case-insensitive and whole-word only', () => {
    // "scrolling" removed, but "scroller" (different word) preserved.
    const out = neutralizeScreenMotion('Scrolling fast past a scroller device.');
    expect(/\bscrolling\b/i.test(out)).toBe(false);
    expect(out).toContain('scroller');
  });
});
