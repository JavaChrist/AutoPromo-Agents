/**
 * Dev-only maintenance helpers, exposed on `window` in development.
 *
 * Usage (browser console):
 *   await cleanupCampaigns()                    // DRY-RUN: lists what would be deleted
 *   await cleanupCampaigns({ confirm: true })   // actually deletes everything except "RideCloud"
 *   await cleanupCampaigns({ keep: 'RideCloud', confirm: true })
 *
 * Deletion is cascading (scripts, posts, clips, projects, scenes, waves) and
 * mirrors useDeleteCampaign. This file has no effect in production builds.
 */
import { db } from './db';
import { DEMO_USER_ID } from './constants';

function campaignName(c: any): string {
  return String(c?.productName ?? c?.product_name ?? '').trim();
}

async function deleteCampaignCascade(id: string): Promise<void> {
  const [scripts, posts, clips, projects, waves, wavePosts] = await Promise.all([
    db.videoScripts.list({ where: { campaignId: id } }),
    db.socialPosts.list({ where: { campaignId: id } }),
    db.videoClips.list({ where: { campaignId: id } }),
    db.videoProjects.list({ where: { campaignId: id } }),
    db.campaignWaves.list({ where: { campaignId: id } }),
    db.wavePosts.list({ where: { campaignId: id } }),
  ]);

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
}

export async function cleanupCampaigns(
  opts: { keep?: string; confirm?: boolean } = {}
): Promise<void> {
  const keep = (opts.keep ?? 'RideCloud').trim().toLowerCase();

  const all = await db.campaigns.list({ where: { userId: DEMO_USER_ID }, limit: 200 });
  const toDelete = all.filter((c: any) => campaignName(c).toLowerCase() !== keep);
  const kept = all.filter((c: any) => campaignName(c).toLowerCase() === keep);

  console.log(`[cleanup] ${all.length} campagne(s) trouvée(s).`);
  console.log(`[cleanup] CONSERVÉES (${kept.length}):`, kept.map(campaignName));
  console.log(
    `[cleanup] À SUPPRIMER (${toDelete.length}):`,
    toDelete.map((c: any) => `${campaignName(c)} (${c.id})`)
  );

  if (!opts.confirm) {
    console.warn(
      '[cleanup] DRY-RUN — rien n\'a été supprimé. Pour exécuter : await cleanupCampaigns({ confirm: true })'
    );
    return;
  }

  if (kept.length === 0) {
    console.error(
      `[cleanup] ANNULÉ : aucune campagne nommée "${opts.keep ?? 'RideCloud'}" trouvée. Vérifie le nom exact avant de supprimer.`
    );
    return;
  }

  for (const c of toDelete) {
    await deleteCampaignCascade(c.id);
    console.log('[cleanup] ✅ supprimée :', campaignName(c), c.id);
  }
  console.log(`[cleanup] Terminé. ${toDelete.length} campagne(s) supprimée(s).`);
}

/**
 * Resets any campaign stuck in the persisted `status: 'generating'` state
 * (e.g. a generation that crashed or was reloaded mid-run). This unblocks the
 * perpetual spinner. Usage (browser console):
 *   await resetStuckGenerations()
 */
export async function resetStuckGenerations(): Promise<void> {
  const all = await db.campaigns.list({ where: { userId: DEMO_USER_ID }, limit: 200 });
  const stuck = all.filter((c: any) => c.status === 'generating');

  console.log(`[reset] ${stuck.length} campagne(s) bloquée(s) en "generating".`);
  if (stuck.length === 0) return;

  for (const c of stuck) {
    // Mark as ready if it already has a script, otherwise back to draft.
    const scripts = await db.videoScripts.list({ where: { campaignId: c.id } });
    const nextStatus = scripts.length > 0 ? 'ready' : 'draft';
    await db.campaigns.update(c.id, { status: nextStatus });
    console.log(`[reset] ✅ ${campaignName(c)} (${c.id}) → ${nextStatus}`);
  }
  console.log('[reset] Terminé. Recharge la page (Ctrl+Shift+R).');
}

if (__DEV__ && typeof window !== 'undefined') {
  (window as any).cleanupCampaigns = cleanupCampaigns;
  (window as any).resetStuckGenerations = resetStuckGenerations;
}
