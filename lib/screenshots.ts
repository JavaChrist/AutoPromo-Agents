import * as ImagePicker from 'expo-image-picker';

/**
 * Screenshots are hosted on Vercel Blob (via /api/upload) and NOT on Blink
 * storage: Blink rewrites uploads to `…/<uuid>.blob`, and the AI video models
 * reject any image_url whose path doesn't end with .png/.jpg/etc.
 *
 * In local dev (expo on localhost) there is no /api server, so we call the
 * deployed endpoint directly (CORS is open on it).
 */
const PROD_BASE = 'https://auto-promo-agents.vercel.app';

function apiBase(): string {
  if (process.env.EXPO_PUBLIC_API_BASE) return process.env.EXPO_PUBLIC_API_BASE;
  if (typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
    return PROD_BASE;
  }
  return '';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('Lecture du fichier impossible'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Opens the image picker and uploads the chosen screenshot.
 * Returns its public URL (ending with the image extension), or null if cancelled.
 */
export async function pickAndUploadScreenshot(_pathPrefix: string): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
  });
  if (res.canceled || !res.assets?.length) return null;

  const asset = res.assets[0];
  const blob = await (await fetch(asset.uri)).blob();
  if (blob.size > 4 * 1024 * 1024) {
    throw new Error('Image trop lourde (max 4 Mo). Réduis la taille de la capture.');
  }

  const ext = (asset.mimeType?.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const data = await blobToBase64(blob);

  const response = await fetch(`${apiBase()}/api/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, ext }),
  });

  const text = await response.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("L'API d'upload n'est pas disponible. Redéploie le site sur Vercel.");
  }
  if (!response.ok) throw new Error(json?.error || "Échec de l'upload de la capture.");
  return json.url as string;
}

/** Uploads an already-read file (base64) to Blob and returns its public URL. */
async function uploadBase64(data: string, ext: string): Promise<string> {
  const response = await fetch(`${apiBase()}/api/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, ext }),
  });
  const text = await response.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("L'API d'upload n'est pas disponible. Redéploie le site sur Vercel.");
  }
  if (!response.ok) throw new Error(json?.error || "Échec de l'upload.");
  return json.url as string;
}

/**
 * Web-only: opens a native file picker for an audio file (MP3) and uploads it.
 * Returns the public URL, or null if cancelled. Kept small (Vercel body limit).
 */
export function pickAndUploadAudio(): Promise<string | null> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error("L'import audio n'est disponible que sur le web pour l'instant."));
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/mpeg,audio/mp4,.mp3,.m4a';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      if (file.size > 4 * 1024 * 1024) {
        return reject(new Error('Musique trop lourde (max ~4 Mo). Utilise un extrait plus court/compressé.'));
      }
      try {
        const ext = (file.name.split('.').pop() || 'mp3').toLowerCase().replace('mpeg', 'mp3');
        const buf = await file.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = typeof btoa !== 'undefined' ? btoa(binary) : Buffer.from(bytes).toString('base64');
        const url = await uploadBase64(base64, ext === 'm4a' ? 'm4a' : 'mp3');
        resolve(url);
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}
