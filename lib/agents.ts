import { blink } from './blink';
import { ensureAuthForAI } from './auth';
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

const TONE_INSTRUCTIONS: Record<string, string> = {
  professionnel: 'Ton professionnel, crédible, orienté valeur business.',
  convivial: 'Ton chaleureux, accessible, complice avec le lecteur.',
  motivant: "Ton énergique, inspirant, avec verbes d'action.",
  apaisant: 'Ton calme, doux, rassurant.',
  humoristique: "Ton léger, drôle, avec une pointe d'humour décalé.",
};

// ─── Script vidéo ────────────────────────────────────────────────────────────

export async function generateVideoScript(campaign: Campaign): Promise<ScriptResult> {
  await ensureAuthForAI();
  const toneInstruction = TONE_INSTRUCTIONS[campaign.tone || 'professionnel'] || '';

  const { object } = await blink.ai.generateObject({
    model: 'google/gemini-3-flash',
    prompt: `Tu es un expert en marketing vidéo pour applications PWA. Génère un script de vidéo de présentation de 30 secondes pour ce produit :

Produit : ${campaign.product_name}
Pitch : ${campaign.pitch}
Cible : ${campaign.target_audience || 'grand public'}
URL : ${campaign.product_url || 'n/a'}
${toneInstruction}

Le script doit être en français, percutant dès la première seconde (règle des 3s), avec un CTA clair à la fin. Le storyboard décrit 4-5 plans avec timings précis.`,
    schema: {
      type: 'object',
      properties: {
        hook: { type: 'string', description: "Phrase d'accroche des 3 premières secondes" },
        storyboard: { type: 'string', description: 'Description plan par plan avec timings (0-3s, 3-8s, etc.)' },
        voiceover: { type: 'string', description: 'Texte complet de la voix off (max 75 mots pour 30s)' },
        cta: { type: 'string', description: "Appel à l'action final" },
        duration_sec: { type: 'number', description: 'Durée totale en secondes' },
      },
      required: ['hook', 'storyboard', 'voiceover', 'cta', 'duration_sec'],
    },
  });

  return object as ScriptResult;
}

// ─── Posts sociaux ────────────────────────────────────────────────────────────

const PLATFORM_GUIDELINES: Record<Platform, string> = {
  instagram: `Post visuel et émotionnel. Commence par un emoji + hook. Paragraphes courts, sauts de ligne, 8-12 hashtags en fin. Max 2200 car. Inclure "Lien dans la bio".`,
  x: `Ultra-concis, max 280 caractères TOTAL (incluant hashtags et lien). Ton direct, percutant, 1-3 hashtags max. Inclure l'URL.`,
  facebook: `Ton conversationnel, 150-300 mots. Pose une question pour engager. 2-3 hashtags discrets. Pas d'emojis en excès.`,
  linkedin: `Ton professionnel 1ère personne, storytelling business. 150-300 mots, paragraphes très courts ligne par ligne. 4-5 hashtags business. Max 2 emojis.`,
};

export async function generateSocialPost(campaign: Campaign, platform: Platform): Promise<PostResult> {
  await ensureAuthForAI();
  const toneInstruction = TONE_INSTRUCTIONS[campaign.tone || 'professionnel'] || '';
  const guideline = PLATFORM_GUIDELINES[platform];

  const { object } = await blink.ai.generateObject({
    model: 'google/gemini-3-flash',
    prompt: `Tu es un expert community manager. Génère un post de lancement en français pour ce produit, optimisé pour la plateforme.

Produit : ${campaign.product_name}
Pitch : ${campaign.pitch}
Cible : ${campaign.target_audience || 'grand public'}
URL : ${campaign.product_url || ''}
${toneInstruction}

Plateforme : ${platform.toUpperCase()}
Directives : ${guideline}

Contenu prêt à publier (pas de markdown, pas d'instructions). Les hashtags : string avec # devant chaque tag, séparés par des espaces.`,
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Texte complet du post prêt à publier' },
        hashtags: { type: 'string', description: 'Hashtags séparés par espace, ex: "#startup #saas #ia"' },
      },
      required: ['content', 'hashtags'],
    },
  });

  return object as PostResult;
}

// ─── Clip vidéo IA ────────────────────────────────────────────────────────────

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
  await ensureAuthForAI();
  const toneInstruction = TONE_INSTRUCTIONS[campaign.tone || 'professionnel'] || '';
  const fromScreenshot = !!options.image_url;
  let visualPrompt = '';

  const screenshotInstruction = fromScreenshot
    ? `\nIMPORTANT: The video STARTS from a real screenshot of the app's interface (provided as the first frame). Describe how to bring this UI to life: subtle camera push-in or pan over the interface, UI elements animating (taps, scrolls, transitions), then optionally widening to show the app in a real-life context. Do NOT invent a different interface — the existing screenshot IS the app.`
    : '';

  if (script?.storyboard) {
    const { object } = await blink.ai.generateObject({
      model: 'google/gemini-3-flash',
      prompt: `You are an art director. Convert this French storyboard into ONE cinematic video prompt in English for an AI video model (Veo/Sora). The prompt must describe:
- Main subject and their actions
- Visual style (cinematic, modern, vibrant, etc.)
- Lighting and mood
- Camera movements
- Dominant colors and composition
${screenshotInstruction}

Product: ${campaign.product_name}
Pitch: ${campaign.pitch}
Target: ${campaign.target_audience || 'general audience'}
${toneInstruction}

Original storyboard (French):
${script.storyboard}

Hook: ${script.hook || ''}

Write ONE paragraph of 60-100 words in English, dense and visual, optimized for a ${options.duration} video clip. No narration text, only visual description.`,
      schema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Cinematic English video generation prompt, 60-100 words' },
        },
        required: ['prompt'],
      },
    });
    visualPrompt = (object as { prompt: string }).prompt;
  } else {
    visualPrompt = fromScreenshot
      ? `Cinematic promotional video starting from the provided real screenshot of the "${campaign.product_name}" app interface. Gentle camera push-in over the UI, interface elements subtly animating (smooth scrolls, taps, micro-interactions), modern professional lighting, then a tasteful zoom-out revealing the app on a smartphone in a real-life scene. ${campaign.pitch}. Clean, polished tech advertisement style.`
      : `Modern cinematic promotional video for "${campaign.product_name}": ${campaign.pitch}. Dynamic tracking shots, vibrant professional lighting, contemporary UI mockups on screens, energetic transitions. Target audience: ${campaign.target_audience || 'general public'}. Clean, polished tech advertisement style.`;
  }

  const tryModel = async (model: string, duration: string) => {
    const { result } = await blink.ai.generateVideo({
      prompt: visualPrompt,
      model,
      aspect_ratio: options.aspect_ratio as '9:16' | '16:9' | '1:1',
      duration: duration as any,
      ...(options.image_url ? { image_url: options.image_url } : {}),
    });
    return result.video.url;
  };

  // With a screenshot, switch to the image-to-video variant of the chosen model.
  const primaryModel = fromScreenshot ? (I2V_VARIANTS[options.model] ?? options.model) : options.model;
  const fallbackModel = fromScreenshot ? KLING_I2V : KLING_T2V;

  let videoUrl: string;
  try {
    videoUrl = await tryModel(primaryModel, options.duration);
  } catch (err: any) {
    const msg = String(err?.message || '').toLowerCase();
    const isUnprocessable =
      msg.includes('400') || msg.includes('422') || msg.includes('unprocessable') || msg.includes('invalid') || msg.includes('content policy');
    if (isUnprocessable && primaryModel !== fallbackModel) {
      // Kling only supports 5s/10s — clamp the requested duration to a valid value.
      videoUrl = await tryModel(fallbackModel, toKlingDuration(options.duration));
    } else {
      throw err;
    }
  }

  return {
    video_url: videoUrl,
    prompt: visualPrompt,
  };
}

// ─── Long-form video: découpage en scènes ────────────────────────────────────

export interface ScenePlan {
  scene_index: number;
  title: string;
  description: string;
  prompt: string;
}

export async function planVideoScenes(
  campaign: Campaign,
  script: { hook?: string; storyboard?: string; voiceover?: string } | null,
  options: { numScenes: number; sceneDuration: string; totalDuration: number }
): Promise<ScenePlan[]> {
  await ensureAuthForAI();
  const toneInstruction = TONE_INSTRUCTIONS[campaign.tone || 'professionnel'] || '';

  const { object } = await blink.ai.generateObject({
    model: 'google/gemini-3-flash',
    prompt: `You are an expert video director. Break down a ${options.totalDuration}-second promotional video into EXACTLY ${options.numScenes} sequential scenes (each ${options.sceneDuration}).

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

The ${options.numScenes} scenes must form a coherent narrative arc:
- Scene 1: Hook / problem
- Middle scenes: Solution / features / benefits
- Last scene: CTA / brand reveal

Each prompt must be self-contained (the AI generates each clip independently with no memory of others).`,
    schema: {
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
  });

  return (object as { scenes: ScenePlan[] }).scenes.slice(0, options.numScenes);
}

export async function generateSceneClip(
  rawPrompt: string,
  options: { model: string; aspect_ratio: string; duration: string }
): Promise<string> {
  await ensureAuthForAI();

  // A screenshot may be embedded in the prompt → switch to image-to-video.
  const { prompt: basePrompt, imageUrl } = extractSceneScreenshot(rawPrompt);
  const prompt = imageUrl
    ? `The video STARTS from the provided real screenshot of the app's interface (first frame). Bring this exact UI to life — do NOT invent a different interface. ${basePrompt}`
    : basePrompt;

  const primaryModel = imageUrl ? (I2V_VARIANTS[options.model] ?? options.model) : options.model;
  const fallbackModel = imageUrl ? KLING_I2V : KLING_T2V;

  const tryModel = async (model: string, duration: string) => {
    const { result } = await blink.ai.generateVideo({
      prompt,
      model,
      aspect_ratio: options.aspect_ratio as '9:16' | '16:9' | '1:1',
      duration: duration as any,
      ...(imageUrl ? { image_url: imageUrl } : {}),
    });
    return result.video.url;
  };

  try {
    return await tryModel(primaryModel, options.duration);
  } catch (err: any) {
    const msg = String(err?.message || '').toLowerCase();
    // On 400/422/unprocessable, fallback to Kling (most permissive on aspect ratios).
    const isUnprocessable =
      msg.includes('400') ||
      msg.includes('422') ||
      msg.includes('unprocessable') ||
      msg.includes('invalid') ||
      msg.includes('content policy');
    if (isUnprocessable && primaryModel !== fallbackModel) {
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
  await ensureAuthForAI();
  const { url } = await blink.ai.generateSpeech({
    text,
    voice,
    response_format: 'mp3',
  });
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
  await ensureAuthForAI();
  const toneInstruction = TONE_INSTRUCTIONS[campaign.tone || 'professionnel'] || '';

  const { object } = await blink.ai.generateObject({
    model: 'google/gemini-3-flash',
    prompt: `Tu es un stratège marketing senior. Conçois un plan de campagne en ${options.numWaves} vagues sur ${options.durationDays} jours pour le lancement de ce produit.

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
    schema: {
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
    },
  });

  return (object as { waves: WavePlan[] }).waves.slice(0, options.numWaves);
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
  await ensureAuthForAI();
  const toneInstruction = TONE_INSTRUCTIONS[campaign.tone || 'professionnel'] || '';
  const guideline = PLATFORM_GUIDELINES[platform];
  const waveAngle = WAVE_ANGLE[wave.type] || '';

  const { object } = await blink.ai.generateObject({
    model: 'google/gemini-3-flash',
    prompt: `Tu es un expert community manager. Génère UN post de campagne en français pour cette vague.

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
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Texte complet du post' },
        hashtags: { type: 'string', description: 'Hashtags séparés par espace' },
      },
      required: ['content', 'hashtags'],
    },
  });

  return object as PostResult;
}

// ─── Full campaign ────────────────────────────────────────────────────────────

export async function generateFullCampaign(
  campaign: Campaign,
  onStep?: (key: 'script' | Platform, state: 'done' | 'failed') => void
): Promise<{ script: ScriptResult; posts: Record<Platform, PostResult> }> {
  // Auth once before parallel calls
  await ensureAuthForAI();

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
