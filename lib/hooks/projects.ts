import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getErrorMessage } from '../errors';
import { db } from '../db';
import { normalizeProject, normalizeScene } from '../normalizers';
import type { Campaign, VideoScript, VideoProject, VideoScene } from '../types';
import { planVideoScenes, generateSceneClip, setSceneScreenshot, extractSceneScreenshot } from '../agents';
import { deleteBlob } from '../deleteBlob';

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

        // No AI storyboard: create an empty project shell. The user describes each
        // scene by hand (optionally seeding them later with the "Suggérer" button).
        const projectRow = await db.videoProjects.create({
          campaignId: campaign.id,
          userId: campaign.user_id,
          title: `${campaign.product_name} — ${targetDuration}s`,
          targetDuration,
          aspectRatio,
          model,
          voiceoverFull: script?.voiceover ?? '',
          status: 'draft',
        });

        // Create N empty scenes, ready to be described and generated manually.
        for (let i = 1; i <= numScenes; i++) {
          await db.videoScenes.create({
            projectId: projectRow.id,
            userId: campaign.user_id,
            sceneIndex: i,
            title: `Scène ${i}`,
            description: '',
            prompt: '',
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

/**
 * Optional helper: ask the AI to propose a title/description/cinematic prompt for
 * each (empty) scene of a project. Purely opt-in — the manual workflow never
 * requires it. Any screenshot already attached to a scene is preserved.
 */
export function useSuggestScenes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      campaign: Campaign;
      script: VideoScript | null;
      project: VideoProject;
      scenes: VideoScene[];
    }) => {
      try {
        const { campaign, script, project, scenes } = input;
        if (scenes.length === 0) return;
        const sceneDuration = scenes[0]?.duration || '8s';

        const plan = await planVideoScenes(campaign, script, {
          numScenes: scenes.length,
          sceneDuration,
          totalDuration: project.target_duration,
        });

        const ordered = [...scenes].sort((a, b) => a.scene_index - b.scene_index);
        for (let i = 0; i < ordered.length; i++) {
          const p = plan.find((x) => x.scene_index === ordered[i].scene_index) ?? plan[i];
          if (!p) continue;
          // Keep any screenshot the user already attached to this scene.
          const { imageUrl } = extractSceneScreenshot(ordered[i].prompt || '');
          await db.videoScenes.update(ordered[i].id, {
            title: p.title,
            description: p.description,
            prompt: setSceneScreenshot(p.prompt, imageUrl ?? null),
          });
        }
      } catch (err) {
        throw new Error(getErrorMessage(err));
      }
    },
    onSettled: (_, __, variables) => {
      qc.invalidateQueries({ queryKey: ['video_scenes', variables.project.id] });
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

        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === 'rejected'
        );
        const failed = rejected.length;
        // Surface the real upstream reason (e.g. the fal.ai 422 detail) instead
        // of a generic message, so the user knows what to fix.
        const reason = failed > 0 ? getErrorMessage(rejected[0].reason) : '';

        await db.videoProjects.update(project.id, {
          status: failed === scenes.length ? 'failed' : 'ready',
        });

        if (failed > 0 && failed < scenes.length) {
          throw new Error(`${failed} scène(s) sur ${scenes.length} ont échoué.${reason ? ` Raison : ${reason}` : ''}`);
        }
        if (failed === scenes.length) {
          throw new Error(`Toutes les scènes ont échoué.${reason ? ` Raison : ${reason}` : ''}`);
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

/** Manually edit a scene's cinematic prompt (preserving any attached screenshot). */
export function useUpdateScenePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sceneId: string; projectId: string; prompt: string }) => {
      await db.videoScenes.update(input.sceneId, { prompt: input.prompt });
    },
    onSettled: (_, __, variables) => {
      qc.invalidateQueries({ queryKey: ['video_scenes', variables.projectId] });
    },
  });
}

/** Persist the assembled (ffmpeg-merged) final video URL onto the project. */
export function useSaveMergedVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { projectId: string; campaignId: string; mergedUrl: string }) => {
      await db.videoProjects.update(input.projectId, {
        mergedUrl: input.mergedUrl,
        status: 'ready',
      });
    },
    onSettled: (_, __, variables) => {
      qc.invalidateQueries({ queryKey: ['video_projects', variables.campaignId] });
    },
  });
}

/** Remove the saved merged video: delete the Blob file and clear the DB column. */
export function useDeleteMergedVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { projectId: string; campaignId: string; mergedUrl?: string | null }) => {
      if (input.mergedUrl) await deleteBlob(input.mergedUrl);
      await db.videoProjects.update(input.projectId, { mergedUrl: null });
    },
    onSettled: (_, __, variables) => {
      qc.invalidateQueries({ queryKey: ['video_projects', variables.campaignId] });
    },
  });
}

/** Manually edit the project's voiceover text (used for the TTS voice-over). */
export function useUpdateProjectVoiceover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { projectId: string; campaignId: string; voiceover: string }) => {
      await db.videoProjects.update(input.projectId, { voiceoverFull: input.voiceover });
    },
    onSettled: (_, __, variables) => {
      qc.invalidateQueries({ queryKey: ['video_projects', variables.campaignId] });
    },
  });
}

export function useDeleteVideoProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, campaignId }: { id: string; campaignId: string }) => {
      const [project, scenes] = await Promise.all([
        db.videoProjects.get(id),
        db.videoScenes.list({ where: { projectId: id } }),
      ]);

      // Collect Blob-hosted files to clean up: the merged video + any scene
      // screenshots (fal.ai scene clips are external and left untouched).
      const blobUrls: string[] = [];
      const mergedUrl = project?.merged_url ?? project?.mergedUrl;
      if (mergedUrl) blobUrls.push(mergedUrl);
      for (const s of scenes) {
        const { imageUrl } = extractSceneScreenshot(s.prompt || '');
        if (imageUrl) blobUrls.push(imageUrl);
      }
      if (blobUrls.length > 0) await deleteBlob(blobUrls);

      for (const s of scenes) await db.videoScenes.delete(s.id);
      await db.videoProjects.delete(id);
      return campaignId;
    },
    onSuccess: (campaignId) => {
      qc.invalidateQueries({ queryKey: ['video_projects', campaignId] });
    },
  });
}
