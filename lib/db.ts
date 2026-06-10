import { supabase } from './supabase';

/**
 * Thin Supabase-backed data layer that mimics the previous Blink `db` API so the
 * hooks/screens keep working unchanged:
 *
 *   db.campaigns.list({ where: { userId }, orderBy: { createdAt: 'desc' }, limit })
 *   db.videoScripts.get(id)
 *   db.socialPosts.create({ campaignId, userId, ... })
 *   db.videoScenes.update(id, { status: 'ready' })
 *   db.wavePosts.delete(id)
 *
 * Callers use camelCase keys (e.g. `campaignId`, `createdAt`); Postgres columns
 * are snake_case. We convert keys automatically in both directions. Reads return
 * snake_case rows — the `normalizers` already accept both casings.
 */

const camelToSnake = (s: string): string => s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());

/** Map a camelCase accessor (videoScripts) to its Postgres table (video_scripts). */
const tableName = (accessor: string): string => camelToSnake(accessor);

/** Convert an object's keys to snake_case, dropping `undefined` (keeps `null`). */
function toSnakeRow(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[camelToSnake(k)] = v;
  }
  return out;
}

interface ListOptions {
  where?: Record<string, any>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  limit?: number;
}

function throwIf(error: any, context: string): void {
  if (error) {
    throw new Error(`[db:${context}] ${error.message || JSON.stringify(error)}`);
  }
}

function makeTable(accessor: string) {
  const table = tableName(accessor);

  return {
    async list(options: ListOptions = {}): Promise<any[]> {
      let query = supabase.from(table).select('*');

      if (options.where) {
        for (const [key, value] of Object.entries(options.where)) {
          query = query.eq(camelToSnake(key), value as any);
        }
      }
      if (options.orderBy) {
        for (const [key, dir] of Object.entries(options.orderBy)) {
          query = query.order(camelToSnake(key), { ascending: dir === 'asc' });
        }
      }
      if (typeof options.limit === 'number') {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;
      throwIf(error, `${table}.list`);
      return data ?? [];
    },

    async get(id: string): Promise<any | null> {
      const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
      throwIf(error, `${table}.get`);
      return data ?? null;
    },

    async create(values: Record<string, any>): Promise<any> {
      const { data, error } = await supabase
        .from(table)
        .insert(toSnakeRow(values))
        .select('*')
        .single();
      throwIf(error, `${table}.create`);
      return data;
    },

    async update(id: string, values: Record<string, any>): Promise<any> {
      const { data, error } = await supabase
        .from(table)
        .update(toSnakeRow(values))
        .eq('id', id)
        .select('*')
        .single();
      throwIf(error, `${table}.update`);
      return data;
    },

    async delete(id: string): Promise<void> {
      const { error } = await supabase.from(table).delete().eq('id', id);
      throwIf(error, `${table}.delete`);
    },
  };
}

export const db = {
  campaigns: makeTable('campaigns'),
  videoScripts: makeTable('videoScripts'),
  socialPosts: makeTable('socialPosts'),
  videoClips: makeTable('videoClips'),
  videoProjects: makeTable('videoProjects'),
  videoScenes: makeTable('videoScenes'),
  campaignWaves: makeTable('campaignWaves'),
  wavePosts: makeTable('wavePosts'),
} as any;
