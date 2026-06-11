import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '../db';
import { normalizeScript } from '../normalizers';

// ─── Video Script ────────────────────────────────────────────────────────────

export function useVideoScript(campaignId: string) {
  return useQuery({
    queryKey: ['video_script', campaignId],
    queryFn: async () => {
      const rows = await db.videoScripts.list({
        where: { campaignId },
        limit: 1,
      });
      return rows[0] ? normalizeScript(rows[0]) : null;
    },
    enabled: !!campaignId,
  });
}

/** Manually edit the generated script (hook, storyboard, voiceover, cta). */
export function useUpdateVideoScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      campaignId: string;
      patch: Partial<{ hook: string; storyboard: string; voiceover: string; cta: string }>;
    }) => {
      await db.videoScripts.update(input.id, input.patch);
    },
    onSettled: (_, __, variables) => {
      qc.invalidateQueries({ queryKey: ['video_script', variables.campaignId] });
    },
  });
}
