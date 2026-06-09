import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getErrorMessage } from '../blink';
import { db } from '../db';
import { normalizeClip } from '../normalizers';
import type { Campaign, VideoScript, VideoClip } from '../types';
import { generateVideoFromScript } from '../agents';

// ─── Video Clips ─────────────────────────────────────────────────────────────

export function useVideoClips(campaignId: string) {
  return useQuery({
    queryKey: ['video_clips', campaignId],
    queryFn: async () => {
      const rows = await db.videoClips.list({
        where: { campaignId },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(normalizeClip);
    },
    enabled: !!campaignId,
    // Poll every 5s when a clip is generating
    refetchInterval: (query: any) => {
      const clips = query.state.data as VideoClip[] | undefined;
      return clips?.some((c) => c.status === 'generating') ? 5000 : false;
    },
  });
}

export function useGenerateVideoClip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      campaign: Campaign;
      script: VideoScript | null;
      model: string;
      aspectRatio: string;
      duration: string;
    }) => {
      const { campaign, script, model, aspectRatio, duration } = input;

      try {
        // ✅ Correct pattern: generate FIRST, save AFTER
        const { video_url, prompt } = await generateVideoFromScript(
          campaign,
          script,
          { model, aspect_ratio: aspectRatio, duration }
        );

        const row = await db.videoClips.create({
          campaignId: campaign.id,
          userId: campaign.user_id,
          prompt,
          model,
          aspectRatio,
          duration,
          videoUrl: video_url,
          status: 'ready',
        });
        return row.id as string;
      } catch (err: any) {
        // Surface the full raw error in dev to diagnose gateway/HTML responses.
        if (__DEV__) {
          console.error('[generateVideoClip] RAW ERROR →', err);
          console.error('[generateVideoClip] details →', {
            message: err?.message,
            status: err?.status ?? err?.details?.status ?? err?.response?.status,
            url: err?.url ?? err?.details?.url ?? err?.response?.url,
            details: err?.details,
            body: err?.details?.body ?? err?.response?.data,
          });
        }
        const msg = getErrorMessage(err);
        throw new Error(msg);
      }
    },
    onSettled: (_, __, variables) => {
      qc.invalidateQueries({ queryKey: ['video_clips', variables.campaign.id] });
    },
  });
}

export function useDeleteVideoClip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, campaignId }: { id: string; campaignId: string }) => {
      await db.videoClips.delete(id);
      return campaignId;
    },
    onSuccess: (campaignId) => {
      qc.invalidateQueries({ queryKey: ['video_clips', campaignId] });
    },
  });
}
