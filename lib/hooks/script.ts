import { useQuery } from '@tanstack/react-query';
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
