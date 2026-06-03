import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getErrorMessage } from '../blink';
import { db } from '../db';
import { normalizeWave, normalizeWavePost } from '../normalizers';
import type { Campaign, CampaignWave, Platform } from '../types';
import { planCampaignWaves, generateWavePost } from '../agents';

// ─── Campaign waves ──────────────────────────────────────────────────────────

export function useCampaignWaves(campaignId: string) {
  return useQuery({
    queryKey: ['campaign_waves', campaignId],
    queryFn: async () => {
      const rows = await db.campaignWaves.list({
        where: { campaignId },
        orderBy: { waveIndex: 'asc' },
      });
      return rows.map(normalizeWave).sort((a: CampaignWave, b: CampaignWave) => a.wave_index - b.wave_index);
    },
    enabled: !!campaignId,
  });
}

export function useWavePosts(waveId: string) {
  return useQuery({
    queryKey: ['wave_posts', waveId],
    queryFn: async () => {
      const rows = await db.wavePosts.list({ where: { waveId } });
      return rows.map(normalizeWavePost);
    },
    enabled: !!waveId,
  });
}

export function useGenerateCampaignPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      campaign: Campaign;
      numWaves: number;
      durationDays: number;
      startDate: string; // ISO date "2026-01-15"
    }) => {
      try {
        const { campaign, numWaves, durationDays, startDate } = input;

        // 1. Plan waves with AI
        const waves = await planCampaignWaves(campaign, { numWaves, durationDays });

        // 2. Delete existing waves + their posts
        const existingWaves = await db.campaignWaves.list({ where: { campaignId: campaign.id } });
        for (const w of existingWaves) {
          const wPosts = await db.wavePosts.list({ where: { waveId: w.id } });
          for (const p of wPosts) await db.wavePosts.delete(p.id);
          await db.campaignWaves.delete(w.id);
        }

        // 3. Create wave rows
        const baseDate = new Date(startDate);
        for (const w of waves) {
          const scheduledDate = new Date(baseDate);
          scheduledDate.setDate(scheduledDate.getDate() + w.day_offset);
          await db.campaignWaves.create({
            campaignId: campaign.id,
            userId: campaign.user_id,
            waveIndex: w.wave_index,
            name: w.name,
            type: w.type,
            description: w.description,
            goal: w.goal,
            scheduledDate: scheduledDate.toISOString().slice(0, 10),
            status: 'draft',
          });
        }

        return waves.length;
      } catch (err) {
        throw new Error(getErrorMessage(err));
      }
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['campaign_waves', variables.campaign.id] });
    },
  });
}

export function useGenerateWavePosts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { campaign: Campaign; wave: CampaignWave }) => {
      try {
        const { campaign, wave } = input;

        await db.campaignWaves.update(wave.id, { status: 'generating' });
        qc.invalidateQueries({ queryKey: ['campaign_waves', campaign.id] });

        // Delete existing posts for this wave
        const existing = await db.wavePosts.list({ where: { waveId: wave.id } });
        for (const p of existing) await db.wavePosts.delete(p.id);

        const platforms: Platform[] = ['instagram', 'x', 'facebook', 'linkedin'];
        const results = await Promise.all(
          platforms.map((p) =>
            generateWavePost(
              campaign,
              { name: wave.name, type: wave.type, description: wave.description || '', goal: wave.goal || '' },
              p
            ).then((res) => ({ platform: p, ...res }))
          )
        );

        for (const r of results) {
          await db.wavePosts.create({
            waveId: wave.id,
            campaignId: campaign.id,
            userId: campaign.user_id,
            platform: r.platform,
            content: r.content,
            hashtags: r.hashtags,
            status: 'draft',
          });
        }

        await db.campaignWaves.update(wave.id, { status: 'ready' });
      } catch (err) {
        await db.campaignWaves.update(input.wave.id, { status: 'draft' }).catch(() => {});
        throw new Error(getErrorMessage(err));
      }
    },
    onSettled: (_, __, variables) => {
      qc.invalidateQueries({ queryKey: ['campaign_waves', variables.campaign.id] });
      qc.invalidateQueries({ queryKey: ['wave_posts', variables.wave.id] });
    },
  });
}

export function useDeleteWave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, campaignId }: { id: string; campaignId: string }) => {
      const posts = await db.wavePosts.list({ where: { waveId: id } });
      for (const p of posts) await db.wavePosts.delete(p.id);
      await db.campaignWaves.delete(id);
      return campaignId;
    },
    onSuccess: (campaignId) => {
      qc.invalidateQueries({ queryKey: ['campaign_waves', campaignId] });
    },
  });
}
