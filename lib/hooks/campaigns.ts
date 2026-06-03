import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DEMO_USER_ID, getErrorMessage } from '../blink';
import { db } from '../db';
import { normalizeCampaign } from '../normalizers';
import type { Campaign, Platform } from '../types';
import { generateFullCampaign } from '../agents';

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
      await db.campaigns.update(campaign.id, { status: 'generating' });
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['campaign', campaign.id] });

      try {
        const { script, posts } = await generateFullCampaign(campaign);

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
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['campaign', campaign.id] });
      qc.invalidateQueries({ queryKey: ['video_script', campaign.id] });
      qc.invalidateQueries({ queryKey: ['social_posts', campaign.id] });
    },
  });
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
