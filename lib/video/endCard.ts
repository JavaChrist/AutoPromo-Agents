import { postJSON } from '../api';

/**
 * Generates a static end-card clip (logo / URL / CTA) from an image, rendered
 * locally with ffmpeg (no generative model). Returns the hosted MP4 URL, ready
 * to be concatenated with the Veo scene clips (same 9:16 720x1280 H.264 format).
 */
export async function generateEndCard(
  imageUrl: string,
  options?: { duration?: number; zoom?: boolean }
): Promise<string> {
  const { video_url } = await postJSON<{ video_url: string }>('/api/ai/endcard', {
    imageUrl,
    duration: options?.duration,
    zoom: options?.zoom,
  });
  return video_url;
}
