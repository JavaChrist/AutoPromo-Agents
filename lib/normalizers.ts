import type {
  Campaign,
  VideoScript,
  SocialPost,
  VideoClip,
  VideoProject,
  VideoScene,
  CampaignWave,
  WavePost,
  WaveType,
} from './types';

// Normalize camelCase DB response to snake_case Campaign type
export function normalizeCampaign(row: any): Campaign {
  return {
    id: row.id,
    user_id: row.userId ?? row.user_id ?? '',
    product_name: row.productName ?? row.product_name ?? '',
    pitch: row.pitch ?? '',
    target_audience: row.targetAudience ?? row.target_audience,
    product_url: row.productUrl ?? row.product_url,
    tone: row.tone ?? 'professionnel',
    status: row.status ?? 'draft',
    created_at: row.createdAt ?? row.created_at,
    updated_at: row.updatedAt ?? row.updated_at,
  };
}

export function normalizeScript(row: any): VideoScript {
  return {
    id: row.id,
    campaign_id: row.campaignId ?? row.campaign_id ?? '',
    user_id: row.userId ?? row.user_id ?? '',
    hook: row.hook,
    storyboard: row.storyboard,
    voiceover: row.voiceover,
    cta: row.cta,
    duration_sec: row.durationSec ?? row.duration_sec,
    created_at: row.createdAt ?? row.created_at,
  };
}

export function normalizePost(row: any): SocialPost {
  return {
    id: row.id,
    campaign_id: row.campaignId ?? row.campaign_id ?? '',
    user_id: row.userId ?? row.user_id ?? '',
    platform: row.platform,
    content: row.content ?? '',
    hashtags: row.hashtags,
    scheduled_at: row.scheduledAt ?? row.scheduled_at,
    status: row.status ?? 'draft',
    created_at: row.createdAt ?? row.created_at,
  };
}

export function normalizeClip(row: any): VideoClip {
  return {
    id: row.id,
    campaign_id: row.campaignId ?? row.campaign_id ?? '',
    user_id: row.userId ?? row.user_id ?? '',
    prompt: row.prompt ?? '',
    model: row.model ?? 'fal-ai/veo3.1/fast',
    aspect_ratio: row.aspectRatio ?? row.aspect_ratio ?? '9:16',
    duration: row.duration ?? '8s',
    video_url: row.videoUrl ?? row.video_url,
    status: row.status ?? 'pending',
    error: row.error,
    created_at: row.createdAt ?? row.created_at,
  };
}

export function normalizeProject(row: any): VideoProject {
  return {
    id: row.id,
    campaign_id: row.campaignId ?? row.campaign_id ?? '',
    user_id: row.userId ?? row.user_id ?? '',
    title: row.title ?? '',
    target_duration: Number(row.targetDuration ?? row.target_duration ?? 30),
    aspect_ratio: row.aspectRatio ?? row.aspect_ratio ?? '9:16',
    model: row.model ?? 'fal-ai/veo3.1/fast',
    voiceover_full: row.voiceoverFull ?? row.voiceover_full,
    merged_url: row.mergedUrl ?? row.merged_url,
    status: row.status ?? 'draft',
    created_at: row.createdAt ?? row.created_at,
  };
}

export function normalizeScene(row: any): VideoScene {
  return {
    id: row.id,
    project_id: row.projectId ?? row.project_id ?? '',
    user_id: row.userId ?? row.user_id ?? '',
    scene_index: Number(row.sceneIndex ?? row.scene_index ?? 0),
    title: row.title,
    description: row.description,
    prompt: row.prompt,
    duration: row.duration ?? '8s',
    video_url: row.videoUrl ?? row.video_url,
    status: row.status ?? 'pending',
    error: row.error,
    created_at: row.createdAt ?? row.created_at,
  };
}

export function normalizeWave(row: any): CampaignWave {
  return {
    id: row.id,
    campaign_id: row.campaignId ?? row.campaign_id ?? '',
    user_id: row.userId ?? row.user_id ?? '',
    wave_index: Number(row.waveIndex ?? row.wave_index ?? 0),
    name: row.name ?? '',
    type: (row.type ?? 'launch') as WaveType,
    description: row.description,
    goal: row.goal,
    scheduled_date: row.scheduledDate ?? row.scheduled_date,
    status: row.status ?? 'draft',
    created_at: row.createdAt ?? row.created_at,
  };
}

export function normalizeWavePost(row: any): WavePost {
  return {
    id: row.id,
    wave_id: row.waveId ?? row.wave_id ?? '',
    campaign_id: row.campaignId ?? row.campaign_id ?? '',
    user_id: row.userId ?? row.user_id ?? '',
    platform: row.platform,
    content: row.content ?? '',
    hashtags: row.hashtags,
    status: row.status ?? 'draft',
    created_at: row.createdAt ?? row.created_at,
  };
}
