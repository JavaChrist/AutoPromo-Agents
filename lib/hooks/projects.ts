import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getErrorMessage } from '../blink';
import { db } from '../db';
import { normalizeProject, normalizeScene } from '../normalizers';
import type { Campaign, VideoScript, VideoProject, VideoScene } from '../types';
import { planVideoScenes, generateSceneClip, setSceneScreenshot } from '../agents';

// ─── Long-form video projects ────────────────────────────────────────────────

export function useVideoProjects(campaignId: string) {
  return useQuery({
    queryKey: ['video_projects', campaignId],
    queryFn: async () => {
      const rows = await db.videoProjects.list({
        where: { campaignId },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(normalizeProject);
    },
    enabled: !!campaignId,
  });
}

export function useVideoScenes(projectId: string) {
  return useQuery({
    queryKey: ['video_scenes', projectId],
    queryFn: async () => {
      const rows = await db.videoScenes.list({
        where: { projectId },
        orderBy: { sceneIndex: 'asc' },
      });
      return rows.map(normalizeScene).sort((a: VideoScene, b: VideoScene) => a.scene_index - b.scene_index);
    },
    enabled: !!projectId,
  });
}

export function useCreateVideoProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      campaign: Campaign;
      script: VideoScript | null;
      targetDuration: number;
      numScenes: number;
      sceneDuration: string;
      aspectRatio: string;
      model: string;
    }) => {
      try {
        const { campaign, script, targetDuration, numScenes, sceneDuration, aspectRatio, model } = input;

        // 1. Plan scenes with AI
        const scenes = await planVideoScenes(campaign, script, {
          numScenes,
          sceneDuration,
          totalDuration: targetDuration,
        });

        // 2. Create project
        const projectRow = await db.videoProjects.create({
          campaignId: campaign.id,
          userId: campaign.user_id,
          title: `${campaign.product_name} — ${targetDuration}s`,
          targetDuration,
          aspectRatio,
          model,
          voiceoverFull: script?.voiceover,
          status: 'planning',
        });

        // 3. Create scene rows (pending status)
        for (const s of scenes) {
          await db.videoScenes.create({
            projectId: projectRow.id,
            userId: campaign.user_id,
            sceneIndex: s.scene_index,
            title: s.title,
            description: s.description,
            prompt: s.prompt,
            duration: sceneDuration,
            status: 'pending',
          });
        }

        return projectRow.id as string;
      } catch (err) {
        throw new Error(getErrorMessage(err));
      }
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['video_projects', variables.campaign.id] });
    },
  });
}

export function useGenerateScene() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sceneId: string;
      projectId: string;
      prompt: string;
      model: string;
      aspectRatio: string;
      duration: string;
    }) => {
      try {
        // Mark as generating
        await db.videoScenes.update(input.sceneId, { status: 'generating', error: null });
        qc.invalidateQueries({ queryKey: ['video_scenes', input.projectId] });

        const videoUrl = await generateSceneClip(input.prompt, {
          model: input.model,
          aspect_ratio: input.aspectRatio,
          duration: input.duration,
        });

        await db.videoScenes.update(input.sceneId, {
          videoUrl,
          status: 'ready',
        });
      } catch (err) {
        if (__DEV__) {
          console.error('[generateScene] RAW ERROR →', err);
          console.error('[generateScene] details →', {
            message: (err as any)?.message,
            status: (err as any)?.status ?? (err as any)?.details?.status,
            details: (err as any)?.details,
            body: (err as any)?.details?.body,
          });
        }
        const msg = getErrorMessage(err);
        await db.videoScenes.update(input.sceneId, { status: 'failed', error: msg }).catch(() => {});
        throw new Error(msg);
      }
    },
    onSettled: (_, __, variables) => {
      qc.invalidateQueries({ queryKey: ['video_scenes', variables.projectId] });
    },
  });
}

export function useGenerateAllScenes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      project: VideoProject;
      scenes: VideoScene[];
    }) => {
      const { project, scenes } = input;

      try {
        await db.videoProjects.update(project.id, { status: 'generating' });
        qc.invalidateQueries({ queryKey: ['video_projects', project.campaign_id] });

        // Generate all scenes in parallel
        const results = await Promise.allSettled(
          scenes.map(async (scene) => {
            if (!scene.prompt) return;
            await db.videoScenes.update(scene.id, { status: 'generating', error: null });
            qc.invalidateQueries({ queryKey: ['video_scenes', project.id] });

            try {
              const videoUrl = await generateSceneClip(scene.prompt, {
                model: project.model,
                aspect_ratio: project.aspect_ratio,
                duration: scene.duration,
              });
              await db.videoScenes.update(scene.id, { videoUrl, status: 'ready' });
            } catch (err) {
              const msg = getErrorMessage(err);
              await db.videoScenes.update(scene.id, { status: 'failed', error: msg });
              throw err;
            }
          })
        );

        const failed = results.filter((r) => r.status === 'rejected').length;
        await db.videoProjects.update(project.id, {
          status: failed === scenes.length ? 'failed' : 'ready',
        });

        if (failed > 0 && failed < scenes.length) {
          throw new Error(`${failed} scène(s) sur ${scenes.length} ont échoué.`);
        }
        if (failed === scenes.length) {
          throw new Error('Toutes les scènes ont échoué.');
        }
      } catch (err) {
        throw new Error(getErrorMessage(err));
      }
    },
    onSettled: (_, __, variables) => {
      qc.invalidateQueries({ queryKey: ['video_projects', variables.project.campaign_id] });
      qc.invalidateQueries({ queryKey: ['video_scenes', variables.project.id] });
    },
  });
}

/** Attach or remove (imageUrl: null) a screenshot on a scene — the scene will be generated in image-to-video mode. */
export function useSetSceneScreenshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sceneId: string;
      projectId: string;
      prompt: string;
      imageUrl: string | null;
    }) => {
      await db.videoScenes.update(input.sceneId, {
        prompt: setSceneScreenshot(input.prompt, input.imageUrl),
      });
    },
    onSettled: (_, __, variables) => {
      qc.invalidateQueries({ queryKey: ['video_scenes', variables.projectId] });
    },
  });
}

export function useDeleteVideoProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, campaignId }: { id: string; campaignId: string }) => {
      const scenes = await db.videoScenes.list({ where: { projectId: id } });
      for (const s of scenes) await db.videoScenes.delete(s.id);
      await db.videoProjects.delete(id);
      return campaignId;
    },
    onSuccess: (campaignId) => {
      qc.invalidateQueries({ queryKey: ['video_projects', campaignId] });
    },
  });
}
