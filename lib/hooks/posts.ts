import { useQuery } from '@tanstack/react-query';
import { db } from '../db';
import { normalizePost } from '../normalizers';

// ─── Social Posts ─────────────────────────────────────────────────────────────

export function useSocialPosts(campaignId: string) {
  return useQuery({
    queryKey: ['social_posts', campaignId],
    queryFn: async () => {
      const rows = await db.socialPosts.list({ where: { campaignId } });
      return rows.map(normalizePost);
    },
    enabled: !!campaignId,
  });
}
