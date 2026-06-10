import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DEMO_USER_ID } from '../constants';
import { getErrorMessage } from '../errors';
import { db } from '../db';
import { normalizeCampaign } from '../normalizers';
import type { Campaign, Platform } from '../types';
import { generateFullCampaign } from '../agents';
import { useGenerationStore } from '../stores/generation';

// ─── Campaigns ──────────────────────────────────────────────────────────────

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const rows = await db.campaigns.list({
        where: { userId: DEMO_USER_ID },
        orderBy: { createdAt: 'desc' },
        limit: 50,
      });
      return rows.map(normalizeCampaign);
    },
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: ['campaign', id],
    queryFn: async () => {
      const row = await db.campaigns.get(id);
      return row ? normalizeCampaign(row) : null;
    },
    enabled: !!id,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<Campaign, 'id' | 'user_id' | 'status'>) => {
      const row = await db.campaigns.create({
        userId: DEMO_USER_ID,
        status: 'draft',
        productName: input.product_name,
        pitch: input.pitch,
        targetAudience: input.target_audience,
        productUrl: input.product_url,
        tone: input.tone,
      });
      return row.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

export function useGenerateContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (campaign: Campaign) => {
      useGenerationStore.getState().start(campaign.id);
      await db.campaigns.update(campaign.id, { status: 'generating' });
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['campaign', campaign.id] });

      try {
        const { script, posts } = await generateFullCampaign(campaign, (key, state) => {
          useGenerationStore.getState().setStep(key, state);
        });

        // Replace existing scripts
        const existingScripts = await db.videoScripts.list({ where: { campaignId: campaign.id } });
        for (const s of existingScripts) await db.videoScripts.delete(s.id);

        await db.videoScripts.create({
          campaignId: campaign.id,
          userId: campaign.user_id,
          hook: script.hook,
          storyboard: script.storyboard,
          voiceover: script.voiceover,
          cta: script.cta,
          durationSec: script.duration_sec,
        });

        // Replace existing posts
        const existingPosts = await db.socialPosts.list({ where: { campaignId: campaign.id } });
        for (const p of existingPosts) await db.socialPosts.delete(p.id);

        const platforms: Platform[] = ['instagram', 'x', 'facebook', 'linkedin'];
        for (const platform of platforms) {
          await db.socialPosts.create({
            campaignId: campaign.id,
            userId: campaign.user_id,
            platform,
            content: posts[platform].content,
            hashtags: posts[platform].hashtags,
            status: 'draft',
          });
        }

        await db.campaigns.update(campaign.id, { status: 'ready' });
      } catch (err) {
        await db.campaigns.update(campaign.id, { status: 'draft' }).catch(() => {});
        // Re-throw with readable message
        const msg = getErrorMessage(err);
        throw new Error(msg);
      }
    },
    onSettled: (_, __, campaign) => {
      useGenerationStore.getState().finish();
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['campaign', campaign.id] });
      qc.invalidateQueries({ queryKey: ['video_script', campaign.id] });
      qc.invalidateQueries({ queryKey: ['social_posts', campaign.id] });
    },
  });
}

// ─── Stuck generation self-heal ───────────────────────────────────────────────

/**
 * Clears a phantom `status: 'generating'` left over from a crashed/reloaded run.
 *
 * Safe by design: a generation started in this browser session always sets the
 * generation store first, so if the store is tracking this campaign we never
 * reset. Only a status with no active run (i.e. left over from a previous
 * session) is healed, after a short grace delay to absorb any mount-time race.
 */
export function useStuckGenerationGuard(campaign: Campaign | null | undefined): void {
  const qc = useQueryClient();
  const trackedId = useGenerationStore((s) => s.campaignId);
  const status = campaign?.status;
  const id = campaign?.id;

  useEffect(() => {
    if (!id || status !== 'generating') return;
    if (trackedId === id) return; // a real run is in progress — don't touch it

    const timer = setTimeout(async () => {
      if (useGenerationStore.getState().campaignId === id) return; // a run started meanwhile
      try {
        const scripts = await db.videoScripts.list({ where: { campaignId: id } });
        const next = scripts.length > 0 ? 'ready' : 'draft';
        await db.campaigns.update(id, { status: next });
        qc.invalidateQueries({ queryKey: ['campaign', id] });
        qc.invalidateQueries({ queryKey: ['campaigns'] });
      } catch {
        // best-effort: ignore failures, the user can retry/regenerate
      }
    }, 12000);

    return () => clearTimeout(timer);
  }, [id, status, trackedId, qc]);
}

// ─── Delete Campaign ──────────────────────────────────────────────────────────

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const [scripts, posts, clips, projects, waves, wavePosts] = await Promise.all([
        db.videoScripts.list({ where: { campaignId: id } }),
        db.socialPosts.list({ where: { campaignId: id } }),
        db.videoClips.list({ where: { campaignId: id } }),
        db.videoProjects.list({ where: { campaignId: id } }),
        db.campaignWaves.list({ where: { campaignId: id } }),
        db.wavePosts.list({ where: { campaignId: id } }),
      ]);

      // Delete scenes for each project
      for (const project of projects) {
        const scenes = await db.videoScenes.list({ where: { projectId: project.id } });
        for (const s of scenes) await db.videoScenes.delete(s.id);
      }

      await Promise.all([
        ...scripts.map((s: any) => db.videoScripts.delete(s.id)),
        ...posts.map((p: any) => db.socialPosts.delete(p.id)),
        ...clips.map((c: any) => db.videoClips.delete(c.id)),
        ...projects.map((p: any) => db.videoProjects.delete(p.id)),
        ...wavePosts.map((p: any) => db.wavePosts.delete(p.id)),
        ...waves.map((w: any) => db.campaignWaves.delete(w.id)),
      ]);
      await db.campaigns.delete(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}
