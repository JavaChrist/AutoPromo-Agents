export type Platform = 'instagram' | 'x' | 'facebook' | 'linkedin';

export interface Campaign {
  id: string;
  user_id: string;
  product_name: string;
  pitch: string;
  target_audience?: string;
  product_url?: string;
  tone?: string;
  status: 'draft' | 'generating' | 'ready';
  created_at?: string;
  updated_at?: string;
}

export interface VideoScript {
  id: string;
  campaign_id: string;
  user_id: string;
  hook?: string;
  storyboard?: string;
  voiceover?: string;
  cta?: string;
  duration_sec?: number;
  created_at?: string;
}

export interface SocialPost {
  id: string;
  campaign_id: string;
  user_id: string;
  platform: Platform;
  content: string;
  hashtags?: string;
  scheduled_at?: string;
  status: 'draft' | 'scheduled' | 'published';
  created_at?: string;
}

export interface VideoClip {
  id: string;
  campaign_id: string;
  user_id: string;
  prompt: string;
  model: string;
  aspect_ratio: string;
  duration: string;
  video_url?: string;
  status: 'pending' | 'generating' | 'ready' | 'failed';
  error?: string;
  created_at?: string;
}

// ─── Long-form video projects (multi-scene) ──────────────────────────────────

export interface VideoProject {
  id: string;
  campaign_id: string;
  user_id: string;
  title: string;
  target_duration: number; // 20 | 30 | 60
  aspect_ratio: string;
  model: string;
  voiceover_full?: string;
  status: 'draft' | 'planning' | 'generating' | 'ready' | 'failed';
  created_at?: string;
}

export interface VideoScene {
  id: string;
  project_id: string;
  user_id: string;
  scene_index: number;
  title?: string;
  description?: string;
  prompt?: string;
  duration: string;
  video_url?: string;
  status: 'pending' | 'generating' | 'ready' | 'failed';
  error?: string;
  created_at?: string;
}

export const VIDEO_PRESETS = [
  { value: 24, label: '24s • 3 scènes', scenes: 3, sceneDuration: '8s' },
  { value: 32, label: '32s • 4 scènes (recommandé)', scenes: 4, sceneDuration: '8s' },
  { value: 48, label: '48s • 6 scènes (cinématique)', scenes: 6, sceneDuration: '8s' },
];

// ─── Campaign waves (multi-post planning) ─────────────────────────────────────

export type WaveType = 'teaser' | 'launch' | 'social_proof' | 'feature' | 'retargeting' | 'community';

export interface CampaignWave {
  id: string;
  campaign_id: string;
  user_id: string;
  wave_index: number;
  name: string;
  type: WaveType;
  description?: string;
  goal?: string;
  scheduled_date?: string;
  status: 'draft' | 'generating' | 'ready' | 'published';
  created_at?: string;
}

export interface WavePost {
  id: string;
  wave_id: string;
  campaign_id: string;
  user_id: string;
  platform: Platform;
  content: string;
  hashtags?: string;
  status: 'draft' | 'scheduled' | 'published';
  created_at?: string;
}

export const WAVE_TYPES: Record<WaveType, { label: string; emoji: string; description: string }> = {
  teaser: { label: 'Teaser', emoji: '🔮', description: 'Crée le mystère avant le lancement' },
  launch: { label: 'Lancement', emoji: '🚀', description: 'Annonce officielle, full reveal' },
  social_proof: { label: 'Preuve sociale', emoji: '⭐', description: 'Témoignages, stats utilisateurs' },
  feature: { label: 'Feature spotlight', emoji: '✨', description: 'Met en avant une fonctionnalité clé' },
  retargeting: { label: 'Retargeting', emoji: '🎯', description: 'Reconvertit les hésitants' },
  community: { label: 'Communauté', emoji: '🤝', description: 'Engage et fait participer' },
};

export type VideoModel =
  | 'fal-ai/veo3.1/fast'
  | 'fal-ai/veo3.1'
  | 'fal-ai/sora-2/text-to-video/pro'
  | 'fal-ai/kling-video/v2.6/pro/text-to-video';

export const VIDEO_MODELS: { value: VideoModel; label: string; description: string }[] = [
  { value: 'fal-ai/veo3.1/fast', label: 'Veo 3.1 Fast', description: 'Rapide • qualité solide • ~30s' },
  { value: 'fal-ai/veo3.1', label: 'Veo 3.1', description: 'Meilleure qualité • plus lent' },
  { value: 'fal-ai/sora-2/text-to-video/pro', label: 'Sora 2 Pro', description: 'Cinématique • Premium' },
  { value: 'fal-ai/kling-video/v2.6/pro/text-to-video', label: 'Kling 2.6', description: 'Économique' },
];

export const ASPECT_RATIOS = [
  { value: '9:16', label: '📱 Vertical (Reels/Shorts/TikTok)' },
  { value: '16:9', label: '🖥️ Horizontal (YouTube/LinkedIn)' },
  { value: '1:1', label: '⬛ Carré (Feed Instagram)' },
];

// Veo/Sora/Kling support 8s reliably across all models — keep it simple
export const DURATIONS = [
  { value: '8s', label: '8 secondes (standard)' },
];

export const PLATFORM_META: Record<Platform, { label: string; color: string; emoji: string; charLimit?: number }> = {
  instagram: { label: 'Instagram', color: '#E1306C', emoji: '📷', charLimit: 2200 },
  x: { label: 'X (Twitter)', color: '#000000', emoji: '𝕏', charLimit: 280 },
  facebook: { label: 'Facebook', color: '#1877F2', emoji: '👍' },
  linkedin: { label: 'LinkedIn', color: '#0A66C2', emoji: '💼', charLimit: 3000 },
};
