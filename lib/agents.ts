import { postJSON } from './api';
import { buildVeoPrompt, type SceneType } from './video/buildVeoPrompt';
import type { Campaign, Platform } from './types';

interface ScriptResult {
  hook: string;
  storyboard: string;
  voiceover: string;
  cta: string;
  duration_sec: number;
}

interface PostResult {
  content: string;
  hashtags: string;
}

/** Structured text generation via the backend Gemini route. */
async function generateObject<T>(
  prompt: string,
  schema: object,
  opts?: { temperature?: number }
): Promise<T> {
  const { object } = await postJSON<{ object: T }>(
    '/api/ai/text',
    {
      prompt,
      schema,
      // Fresh seed each call → varied outputs for identical prompts.
      seed: Math.floor(Math.random() * 1_000_000_000),
      ...(opts?.temperature != null ? { temperature: opts.temperature } : {}),
    },
    { retries: 2 }
  );
  return object;
}

const TONE_INSTRUCTIONS: Record<string, string> = {
  professionnel: 'Ton professionnel, crédible, orienté valeur business.',
  convivial: 'Ton chaleureux, accessible, complice avec le lecteur.',
  motivant: "Ton énergique, inspirant, avec verbes d'action.",
  apaisant: 'Ton calme, doux, rassurant.',
  humoristique: "Ton léger, drôle, avec une pointe d'humour décalé.",
};

// ─── Script vidéo ────────────────────────────────────────────────────────────

const SCRIPT_ANGLES = [
  "Angle problème → solution (avant/après) : montre la galère, puis le soulagement avec le produit.",
  'Angle émotionnel : le bénéfice ressenti au quotidien, la tranquillité gagnée.',
  "Angle démo produit : met en scène l'app en action, fonctionnalité phare.",
  "Angle storytelling : une journée type d'un utilisateur cible.",
  'Angle résultats/chiffres : gain de temps, économies, efficacité.',
  "Angle objection : lève le frein principal de la cible et rassure.",
];

export async function generateVideoScript(campaign: Campaign): Promise<ScriptResult> {
  const toneInstruction = TONE_INSTRUCTIONS[campaign.tone || 'professionnel'] || '';
  // Pick a random creative angle so each (re)generation produces a different script.
  const angle = SCRIPT_ANGLES[Math.floor(Math.random() * SCRIPT_ANGLES.length)];

  const object = await generateObject<ScriptResult>(
    `Tu es un expert en marketing vidéo pour applications PWA. Génère un script de vidéo de présentation de 30 secondes pour ce produit :

Produit : ${campaign.product_name}
Pitch : ${campaign.pitch}
Cible : ${campaign.target_audience || 'grand public'}
URL : ${campaign.product_url || 'n/a'}
${toneInstruction}

Angle créatif imposé pour CETTE version (différent à chaque génération) : ${angle}
Propose une accroche et des formulations originales, évite les tournures génériques déjà vues.

IMPORTANT : tout le contenu généré (hook, storyboard, voix off, CTA) doit être rédigé OBLIGATOIREMENT en français. Le script doit être percutant dès la première seconde (règle des 3s), avec un CTA clair à la fin. Le storyboard décrit 4-5 plans avec timings précis.`,
    {
      type: 'object',
      properties: {
        hook: { type: 'string', description: "Phrase d'accroche des 3 premières secondes, en français" },
        storyboard: { type: 'string', description: 'Description plan par plan avec timings (0-3s, 3-8s, etc.), en français' },
        voiceover: { type: 'string', description: 'Texte complet de la voix off EN FRANÇAIS (max 75 mots pour 30s)' },
        cta: { type: 'string', description: "Appel à l'action final" },
        duration_sec: { type: 'number', description: 'Durée totale en secondes' },
      },
      required: ['hook', 'storyboard', 'voiceover', 'cta', 'duration_sec'],
    },
    { temperature: 1.25 }
  );

  return object;
}

// ─── Posts sociaux ────────────────────────────────────────────────────────────

const PLATFORM_GUIDELINES: Record<Platform, string> = {
  instagram: `Post visuel et émotionnel. Commence par un emoji + hook. Paragraphes courts, sauts de ligne, 8-12 hashtags en fin. Max 2200 car. Inclure "Lien dans la bio".`,
  x: `Ultra-concis, max 280 caractères TOTAL (incluant hashtags et lien). Ton direct, percutant, 1-3 hashtags max. Inclure l'URL.`,
  facebook: `Ton conversationnel, 150-300 mots. Pose une question pour engager. 2-3 hashtags discrets. Pas d'emojis en excès.`,
  linkedin: `Ton professionnel 1ère personne, storytelling business. 150-300 mots, paragraphes très courts ligne par ligne. 4-5 hashtags business. Max 2 emojis.`,
};

export async function generateSocialPost(campaign: Campaign, platform: Platform): Promise<PostResult> {
  const toneInstruction = TONE_INSTRUCTIONS[campaign.tone || 'professionnel'] || '';
  const guideline = PLATFORM_GUIDELINES[platform];

  const object = await generateObject<PostResult>(
    `Tu es un expert community manager. Génère un post de lancement en français pour ce produit, optimisé pour la plateforme.

Produit : ${campaign.product_name}
Pitch : ${campaign.pitch}
Cible : ${campaign.target_audience || 'grand public'}
URL : ${campaign.product_url || ''}
${toneInstruction}

Plateforme : ${platform.toUpperCase()}
Directives : ${guideline}

Contenu prêt à publier (pas de markdown, pas d'instructions). Les hashtags : string avec # devant chaque tag, séparés par des espaces.`,
    {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Texte complet du post prêt à publier' },
        hashtags: { type: 'string', description: 'Hashtags séparés par espace, ex: "#startup #saas #ia"' },
      },
      required: ['content', 'hashtags'],
    }
  );

  return object;
}

// ─── Clip vidéo IA ────────────────────────────────────────────────────────────

/**
 * Each fal video model expects a different `duration` format:
 * - Veo 3.1   → string with "s"  ("4s" | "6s" | "8s")
 * - Sora 2    → integer seconds  (4 | 8 | 12 | 16 | 20)
 * - Kling 2.6 → string seconds   ("5" | "10")
 */
function formatDuration(model: string, duration: string): string | number {
  const seconds = parseInt(duration, 10) || 8;
  if (model.includes('kling')) return String(seconds);
  if (model.includes('sora')) return seconds;
  return `${seconds}s`;
}

/** Generate a video clip via the backend fal.ai route. */
async function generateVideo(options: {
  prompt: string;
  model: string;
  aspect_ratio: string;
  duration: string;
  image_url?: string;
  negative_prompt?: string;
}): Promise<string> {
  // Veo image-to-video only accepts auto/16:9/9:16 (no 1:1) → fall back to auto.
  let aspectRatio = options.aspect_ratio;
  if (
    options.image_url &&
    options.model.includes('veo') &&
    aspectRatio !== '16:9' &&
    aspectRatio !== '9:16'
  ) {
    aspectRatio = 'auto';
  }

  const input: Record<string, any> = {
    prompt: options.prompt,
    aspect_ratio: aspectRatio,
    duration: formatDuration(options.model, options.duration),
  };
  if (options.image_url) input.image_url = options.image_url;
  // Veo generates its own soundtrack (invented speech in a fake language, music)
  // by default. Disable it so each clip is clean/silent — the promo's only audio
  // is the optional voice-over mixed at assembly time.
  if (options.model.includes('veo')) {
    input.generate_audio = false;
  }
  // Only Kling documents a `negative_prompt` field; sending it to Veo Fast would
  // be rejected (422), so the static lock for Veo relies on the prompt suffix.
  if (options.negative_prompt && options.model.includes('kling')) {
    input.negative_prompt = options.negative_prompt;
  }

  const { video_url } = await postJSON<{ video_url: string }>('/api/ai/video', {
    model: options.model,
    input,
  });
  return video_url;
}

/** Kling only accepts 5s or 10s — map any requested duration to the nearest. */
function toKlingDuration(d: string): '5s' | '10s' {
  const seconds = parseInt(d, 10);
  return Number.isFinite(seconds) && seconds >= 8 ? '10s' : '5s';
}

/** Image-to-video variant of each text-to-video model (used when a screenshot is provided). */
const I2V_VARIANTS: Record<string, string> = {
  'fal-ai/veo3.1/fast': 'fal-ai/veo3.1/fast/image-to-video',
  'fal-ai/veo3.1': 'fal-ai/veo3.1/image-to-video',
  'fal-ai/sora-2/text-to-video/pro': 'fal-ai/sora-2/image-to-video/pro',
  'fal-ai/kling-video/v2.6/pro/text-to-video': 'fal-ai/kling-video/v2.6/pro/image-to-video',
};

const KLING_T2V = 'fal-ai/kling-video/v2.6/pro/text-to-video';
const KLING_I2V = 'fal-ai/kling-video/v2.6/pro/image-to-video';

// ─── Per-scene screenshots (long-form) ───────────────────────────────────────
// The screenshot URL is persisted inside the scene's prompt text (first line,
// behind a marker) so no DB schema change is required and it survives reloads
// and regenerations.

const SCENE_IMG_MARKER = '[screenshot]';

/** Attach (or detach with null) a screenshot URL to a scene prompt. */
export function setSceneScreenshot(prompt: string, imageUrl: string | null): string {
  const { prompt: clean } = extractSceneScreenshot(prompt);
  return imageUrl ? `${SCENE_IMG_MARKER} ${imageUrl}\n${clean}` : clean;
}

/** Split a scene prompt into the clean prompt + the attached screenshot URL, if any. */
export function extractSceneScreenshot(prompt: string): { prompt: string; imageUrl?: string } {
  const text = prompt || '';
  if (!text.startsWith(SCENE_IMG_MARKER)) return { prompt: text };
  const newlineIdx = text.indexOf('\n');
  const firstLine = newlineIdx === -1 ? text : text.slice(0, newlineIdx);
  const imageUrl = firstLine.slice(SCENE_IMG_MARKER.length).trim();
  const rest = newlineIdx === -1 ? '' : text.slice(newlineIdx + 1).trim();
  return { prompt: rest, imageUrl: imageUrl || undefined };
}

export async function generateVideoFromScript(
  campaign: Campaign,
  script: { hook?: string; storyboard?: string; voiceover?: string } | null,
  options: { model: string; aspect_ratio: string; duration: string; image_url?: string }
): Promise<{ video_url: string; prompt: string }> {
  const toneInstruction = TONE_INSTRUCTIONS[campaign.tone || 'professionnel'] || '';
  const fromScreenshot = !!options.image_url;
  let visualPrompt = '';

  const screenshotInstruction = fromScreenshot
    ? `\nIMPORTANT: The video STARTS from a real screenshot of the app interface (first frame). The on-screen content MUST stay completely static and unchanged — do NOT animate, navigate, tap, scroll or redraw anything on the screen, and do NOT invent a different interface. ALL motion comes only from a slow, subtle camera movement and the surrounding real-life environment.`
    : '';

  if (script?.storyboard) {
    const object = await generateObject<{ prompt: string }>(
      `You are an art director. Convert this French storyboard into ONE cinematic video prompt in English for an AI video model (Veo/Sora). The prompt must describe:
- Main subject and their actions
- Visual style (cinematic, modern, vibrant, etc.)
- Lighting and mood
- Camera movements
- Dominant colors and composition

CRITICAL: AI video models CANNOT render legible text. Do NOT include any on-screen text, captions, subtitles, UI labels, brand names, URLs or logos — they always come out garbled/misspelled. Keep the scene purely visual and text-free.
${screenshotInstruction}

Product: ${campaign.product_name}
Pitch: ${campaign.pitch}
Target: ${campaign.target_audience || 'general audience'}
${toneInstruction}

Original storyboard (French):
${script.storyboard}

Hook: ${script.hook || ''}

Write ONE paragraph of 60-100 words in English, dense and visual, optimized for a ${options.duration} video clip. No narration text, only visual description.`,
      {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Cinematic English video generation prompt, 60-100 words' },
        },
        required: ['prompt'],
      }
    );
    visualPrompt = object.prompt;
  } else {
    visualPrompt = fromScreenshot
      ? `Cinematic promotional video starting from the provided real screenshot of the app interface. Gentle camera push-in over the UI, interface elements subtly animating (smooth scrolls, taps, micro-interactions), modern professional lighting, then a tasteful zoom-out revealing the app on a smartphone in a real-life scene. ${campaign.pitch}. Clean, polished tech advertisement style. No added on-screen text, captions or logos.`
      : `Modern cinematic promotional video about: ${campaign.pitch}. Dynamic tracking shots, vibrant professional lighting, real-life lifestyle scenes, energetic transitions. Target audience: ${campaign.target_audience || 'general public'}. Clean, polished tech advertisement style. Purely visual — NO on-screen text, captions, subtitles, logos or readable UI labels (AI video renders text garbled).`;
  }

  // Hard-lock the prompt according to the scene type (static screen when a
  // seed screenshot is used).
  const sceneType: SceneType = fromScreenshot ? 'screen' : 'ambiance';
  const { prompt: lockedPrompt, negativePrompt } = buildVeoPrompt({
    type: sceneType,
    prompt: visualPrompt,
    imageUrl: options.image_url,
  });
  const finalPrompt = lockedPrompt ?? visualPrompt;

  const tryModel = (model: string, duration: string) =>
    generateVideo({
      prompt: finalPrompt,
      model,
      aspect_ratio: options.aspect_ratio,
      duration,
      ...(options.image_url ? { image_url: options.image_url } : {}),
      ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
    });

  // With a screenshot, switch to the image-to-video variant of the chosen model.
  const primaryModel = fromScreenshot ? (I2V_VARIANTS[options.model] ?? options.model) : options.model;
  const fallbackModel = fromScreenshot ? KLING_I2V : KLING_T2V;

  let videoUrl: string;
  try {
    videoUrl = await tryModel(primaryModel, options.duration);
  } catch (err: any) {
    if (isFallbackWorthy(err) && primaryModel !== fallbackModel) {
      // Kling only supports 5s/10s — clamp the requested duration to a valid value.
      videoUrl = await tryModel(fallbackModel, toKlingDuration(options.duration));
    } else {
      throw err;
    }
  }

  return {
    video_url: videoUrl,
    prompt: finalPrompt,
  };
}

/**
 * Whether a Veo/Sora failure should trigger the permissive Kling fallback.
 * Branches on the HTTP status (carried by ApiError) first, then on message
 * keywords — because the thrown message is fal's reason text, not the status.
 */
function isFallbackWorthy(err: any): boolean {
  const status = err?.status;
  if (status === 400 || status === 422) return true;
  const msg = String(err?.message || '').toLowerCase();
  return (
    msg.includes('400') ||
    msg.includes('422') ||
    msg.includes('unprocessable') ||
    msg.includes('invalid') ||
    msg.includes('content policy') ||
    msg.includes('content checker') ||
    msg.includes('flagged') ||
    msg.includes('did not generate') ||
    msg.includes('expected output')
  );
}

// ─── Long-form video: découpage en scènes ────────────────────────────────────

export interface ScenePlan {
  scene_index: number;
  title: string;
  description: string;
  prompt: string;
}

const NARRATIVE_STYLES = [
  'Style documentaire/lifestyle réaliste : vraies situations du quotidien.',
  'Style cinématique premium : plans léchés, ralentis, lumière travaillée.',
  'Style dynamique/énergique : coupes rapides, mouvement, rythme soutenu.',
  'Style intimiste/émotionnel : gros plans, ambiance chaleureuse, proximité.',
  'Style moderne/tech : esthétique épurée, graphique, futuriste.',
  'Style narratif "mini-histoire" : un avant/pendant/après clair.',
];

export async function planVideoScenes(
  campaign: Campaign,
  script: { hook?: string; storyboard?: string; voiceover?: string } | null,
  options: { numScenes: number; sceneDuration: string; totalDuration: number }
): Promise<ScenePlan[]> {
  const toneInstruction = TONE_INSTRUCTIONS[campaign.tone || 'professionnel'] || '';
  // Random visual style so each storyboard differs from the previous one.
  const style = NARRATIVE_STYLES[Math.floor(Math.random() * NARRATIVE_STYLES.length)];

  const object = await generateObject<{ scenes: ScenePlan[] }>(
    `You are an expert video director. Break down a ${options.totalDuration}-second promotional video into EXACTLY ${options.numScenes} sequential scenes (each ${options.sceneDuration}).

Style visuel imposé pour CETTE version (différent à chaque génération) : ${style}
Propose un découpage et des plans ORIGINAUX, évite de reproduire un storyboard générique déjà vu.

Product: ${campaign.product_name}
Pitch: ${campaign.pitch}
Target: ${campaign.target_audience || 'general audience'}
${toneInstruction}

${script?.storyboard ? `Existing storyboard reference:\n${script.storyboard}\n` : ''}
${script?.hook ? `Hook: ${script.hook}\n` : ''}

For each scene, produce:
- A short FRENCH title (3-6 words) describing what happens
- A FRENCH description (1 sentence) explaining the visual narrative
- A dense ENGLISH cinematic prompt (50-80 words) optimized for an AI video model (Veo/Sora/Kling). Include: subject, action, visual style, lighting, camera movement, dominant colors. NO narration text — only visuals.

CRITICAL: AI video models CANNOT render legible text. Do NOT ask for any on-screen text, captions, subtitles, UI labels, brand names, URLs or logos in the prompt — they always come out garbled/misspelled. Describe purely visual, text-free scenes (objects, people, environments, motion).

CRITICAL: If a scene shows an app screen/interface, the on-screen content MUST stay static — do NOT describe tapping, navigating, scrolling, UI animations or screen transitions. Motion for such scenes comes only from a subtle camera move and the surrounding environment.

The ${options.numScenes} scenes must form a coherent narrative arc:
- Scene 1: Hook / problem
- Middle scenes: Solution / features / benefits
- Last scene: CTA / brand reveal

Each prompt must be self-contained (the AI generates each clip independently with no memory of others).`,
    {
      type: 'object',
      properties: {
        scenes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              scene_index: { type: 'number' },
              title: { type: 'string' },
              description: { type: 'string' },
              prompt: { type: 'string' },
            },
            required: ['scene_index', 'title', 'description', 'prompt'],
          },
        },
      },
      required: ['scenes'],
    },
    { temperature: 1.2 }
  );

  return object.scenes.slice(0, options.numScenes);
}

export async function generateSceneClip(
  rawPrompt: string,
  options: { model: string; aspect_ratio: string; duration: string }
): Promise<string> {
  // A screenshot may be embedded in the prompt → switch to image-to-video.
  const { prompt: basePrompt, imageUrl } = extractSceneScreenshot(rawPrompt);

  // Hard-lock the prompt: a scene with a seed screenshot is a `screen` scene
  // whose on-screen content must stay static; otherwise it's `ambiance`.
  const sceneType: SceneType = imageUrl ? 'screen' : 'ambiance';
  const lead = imageUrl
    ? 'The video starts from the provided real screenshot of the app interface (first frame), shown as a static screen. '
    : '';
  const { prompt: lockedPrompt, negativePrompt } = buildVeoPrompt({
    type: sceneType,
    prompt: `${lead}${basePrompt}`,
    imageUrl,
  });
  const prompt = lockedPrompt ?? basePrompt;

  const primaryModel = imageUrl ? (I2V_VARIANTS[options.model] ?? options.model) : options.model;
  const fallbackModel = imageUrl ? KLING_I2V : KLING_T2V;

  const tryModel = (model: string, duration: string) =>
    generateVideo({
      prompt,
      model,
      aspect_ratio: options.aspect_ratio,
      duration,
      ...(imageUrl ? { image_url: imageUrl } : {}),
      ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
    });

  try {
    return await tryModel(primaryModel, options.duration);
  } catch (err: any) {
    // On 400/422/unprocessable/content issues, fallback to Kling (most permissive).
    if (isFallbackWorthy(err) && primaryModel !== fallbackModel) {
      // Kling only supports 5s/10s — clamp the duration to a valid value.
      return await tryModel(fallbackModel, toKlingDuration(options.duration));
    }
    throw err;
  }
}

// ─── Voix off (text-to-speech) ───────────────────────────────────────────────

export type VoiceoverVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

export const VOICEOVER_VOICES: { value: VoiceoverVoice; label: string }[] = [
  { value: 'nova', label: 'Nova — féminine, énergique' },
  { value: 'shimmer', label: 'Shimmer — féminine, douce' },
  { value: 'alloy', label: 'Alloy — neutre, polyvalente' },
  { value: 'echo', label: 'Echo — masculine, posée' },
  { value: 'onyx', label: 'Onyx — masculine, grave' },
  { value: 'fable', label: 'Fable — chaleureuse, conteuse' },
];

/** Generates the voiceover audio (MP3 URL) from the script's voiceover text. */
export async function generateVoiceover(
  text: string,
  voice: VoiceoverVoice = 'nova'
): Promise<string> {
  const { url } = await postJSON<{ url: string }>('/api/ai/speech', { text, voice }, { retries: 2 });
  return url;
}

// ─── Campaign strategy: multi-wave plan ──────────────────────────────────────

export interface WavePlan {
  wave_index: number;
  name: string;
  type: 'teaser' | 'launch' | 'social_proof' | 'feature' | 'retargeting' | 'community';
  description: string;
  goal: string;
  day_offset: number; // days from campaign start
}

export async function planCampaignWaves(
  campaign: Campaign,
  options: { numWaves: number; durationDays: number }
): Promise<WavePlan[]> {
  const toneInstruction = TONE_INSTRUCTIONS[campaign.tone || 'professionnel'] || '';

  const object = await generateObject<{ waves: WavePlan[] }>(
    `Tu es un stratège marketing senior. Conçois un plan de campagne en ${options.numWaves} vagues sur ${options.durationDays} jours pour le lancement de ce produit.

Produit : ${campaign.product_name}
Pitch : ${campaign.pitch}
Cible : ${campaign.target_audience || 'grand public'}
${toneInstruction}

Chaque vague est une étape stratégique distincte. Types disponibles :
- teaser : crée mystère et anticipation avant le lancement
- launch : annonce officielle, reveal complet
- social_proof : témoignages, stats, validation
- feature : focus sur UNE fonctionnalité différenciante
- retargeting : reconvertit les hésitants avec urgence/preuve
- community : engage la communauté, UGC, questions

Pour chaque vague, produis :
- name : nom court en français (3-5 mots, ex: "Phase teaser", "Reveal officiel")
- type : un des types ci-dessus
- description : 1-2 phrases sur le contenu/angle (en français)
- goal : objectif business mesurable (ex: "Générer 500 inscriptions à la liste d'attente")
- day_offset : jour depuis le début (0 = jour de lancement, négatif = avant, positif = après)

Le plan doit avoir un arc cohérent : teaser → launch → social_proof → feature(s) → retargeting/community.`,
    {
      type: 'object',
      properties: {
        waves: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              wave_index: { type: 'number' },
              name: { type: 'string' },
              type: { type: 'string', enum: ['teaser', 'launch', 'social_proof', 'feature', 'retargeting', 'community'] },
              description: { type: 'string' },
              goal: { type: 'string' },
              day_offset: { type: 'number' },
            },
            required: ['wave_index', 'name', 'type', 'description', 'goal', 'day_offset'],
          },
        },
      },
      required: ['waves'],
    }
  );

  return object.waves.slice(0, options.numWaves);
}

const WAVE_ANGLE: Record<string, string> = {
  teaser: 'Ton mystérieux, intrigant. Pas de reveal. Suggère sans dire. Pose une question. Crée FOMO.',
  launch: 'Annonce officielle, ton confiant et énergique. Reveal complet du produit, features clés, lien direct.',
  social_proof: 'Mets en avant des chiffres concrets (utilisateurs, ratings, témoignages). Crée la confiance.',
  feature: "Focus UNE fonctionnalité. Démontre comment elle résout un problème spécifique. Avant/après.",
  retargeting: "Crée l'urgence (offre limitée, deadline). Lève les dernières objections. Réassurance.",
  community: 'Pose une question. Invite à partager. UGC. Mention de la communauté existante.',
};

export async function generateWavePost(
  campaign: Campaign,
  wave: { name: string; type: string; description: string; goal: string },
  platform: Platform
): Promise<PostResult> {
  const toneInstruction = TONE_INSTRUCTIONS[campaign.tone || 'professionnel'] || '';
  const guideline = PLATFORM_GUIDELINES[platform];
  const waveAngle = WAVE_ANGLE[wave.type] || '';

  const object = await generateObject<PostResult>(
    `Tu es un expert community manager. Génère UN post de campagne en français pour cette vague.

PRODUIT
Nom : ${campaign.product_name}
Pitch : ${campaign.pitch}
Cible : ${campaign.target_audience || 'grand public'}
URL : ${campaign.product_url || ''}
${toneInstruction}

VAGUE
Nom : ${wave.name}
Type : ${wave.type}
Description : ${wave.description}
Objectif : ${wave.goal}
Angle : ${waveAngle}

PLATEFORME : ${platform.toUpperCase()}
Directives : ${guideline}

Le post doit refléter l'angle de la vague (pas un post de lancement générique). Prêt à publier (pas de markdown).`,
    {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Texte complet du post' },
        hashtags: { type: 'string', description: 'Hashtags séparés par espace' },
      },
      required: ['content', 'hashtags'],
    }
  );

  return object;
}

// ─── Full campaign ────────────────────────────────────────────────────────────

export async function generateFullCampaign(
  campaign: Campaign,
  onStep?: (key: 'script' | Platform, state: 'done' | 'failed') => void
): Promise<{ script: ScriptResult; posts: Record<Platform, PostResult> }> {
  const platforms: Platform[] = ['instagram', 'x', 'facebook', 'linkedin'];

  // Each task reports its real completion so the UI can reflect per-agent state.
  const scriptPromise = generateVideoScript(campaign).then(
    (r) => {
      onStep?.('script', 'done');
      return r;
    },
    (e) => {
      onStep?.('script', 'failed');
      throw e;
    }
  );

  const postPromises = platforms.map((p) =>
    generateSocialPost(campaign, p).then(
      (r) => {
        onStep?.(p, 'done');
        return r;
      },
      (e) => {
        onStep?.(p, 'failed');
        throw e;
      }
    )
  );

  const [script, ...postResults] = await Promise.all([scriptPromise, ...postPromises]);

  const posts = platforms.reduce((acc, p, i) => {
    acc[p] = postResults[i];
    return acc;
  }, {} as Record<Platform, PostResult>);

  return { script, posts };
}
