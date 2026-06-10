# AutoPromo Agent Suite

Application web (Expo / React Native Web) qui génère automatiquement, à partir d'un simple pitch produit, une **campagne de promotion complète** : script vidéo, posts pour les réseaux sociaux (Instagram, X, Facebook, LinkedIn), clips vidéo IA, vidéos long format multi-scènes, voix off et plan de campagne en plusieurs vagues.

## Architecture

L'app est 100 % autonome (plus de dépendance à Blink) et repose sur :

- **Frontend** : Expo Router + React Native Web, UI [Tamagui](https://tamagui.dev) (barrel local `components/ui`).
- **Base de données** : [Supabase](https://supabase.com) (Postgres). Couche d'accès `lib/db.ts` (adaptateur type `db.table.list/get/create/update/delete`).
- **Agents IA** : routes serverless Vercel sous `api/ai/` appelées par `lib/agents.ts`.
  - **Texte** (scripts, posts, plans) → Google **Gemini** (`/api/ai/text`).
  - **Vidéo** (clips, scènes, image-to-video) → **fal.ai** (Veo 3.1 / Sora 2 / Kling) (`/api/ai/video`).
  - **Voix off** (TTS) → **OpenAI**, hébergée sur Vercel Blob (`/api/ai/speech`).
- **Montage vidéo** : `api/merge.ts` (ffmpeg) concatène les scènes, mixe la voix off et **incruste du texte** (titre / CTA / URL) via Satori + filtre `overlay`.
- **Stockage de fichiers** : Vercel Blob (captures d'écran, audio, vidéos assemblées).

## Variables d'environnement

### Local (`.env.local`) — pour le développement
```env
EXPO_PUBLIC_SUPABASE_URL=https://<projet>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<clé publique Supabase>
```
> En dev local, l'app appelle automatiquement le backend `/api` **déployé** (les clés IA ne sont donc pas nécessaires en local).

### Vercel (Project Settings → Environment Variables) — pour la production
| Variable | Usage |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Clé publique Supabase |
| `GOOGLE_API_KEY` (ou `GEMINI_API_KEY`) | Gemini — génération de texte. Clé créée sur [AI Studio](https://aistudio.google.com/apikey). Envoyée via l'en-tête `x-goog-api-key` (compatible clés `AIza…` et `AQ.…`). |
| `FAL_KEY` | fal.ai — génération vidéo (compte à approvisionner sur [fal.ai/dashboard/billing](https://fal.ai/dashboard/billing)) |
| `OPENAI_API_KEY` | OpenAI — voix off (TTS) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob — stockage des captures, audio et montages |

Options facultatives : `GEMINI_MODEL` (défaut `gemini-2.5-flash`), `OPENAI_TTS_MODEL` (défaut `tts-1`), `EXPO_PUBLIC_API_BASE` (forcer l'URL du backend).

## Démarrage

```bash
npm install
# Renseigner .env.local (voir ci-dessus)
npm run dev
```
L'app est disponible sur `http://localhost:3000`.

### Base de données Supabase
Le schéma (8 tables) est géré par migrations Supabase :
`campaigns`, `video_scripts`, `social_posts`, `video_clips`, `video_projects`, `video_scenes`, `campaign_waves`, `wave_posts`.

## Commandes

- `npm run dev` — serveur de dev web (port 3000)
- `npm start` — serveur de dev (QR code mobile)
- `npm run build:web` — build web de production (`expo export`)
- `npm run lint` — lint (ESLint / eslint-config-expo)
- `npm run doctor` — diagnostic Expo

## Structure du projet

```
├── app/                  # Écrans (Expo Router) : index, new, campaign/[id]
├── api/                  # Routes serverless Vercel
│   ├── ai/               #   text (Gemini), video (fal.ai), speech (OpenAI)
│   ├── merge.ts          #   montage ffmpeg + voix off + incrustation
│   └── upload.ts         #   upload des captures (Vercel Blob)
├── components/
│   ├── ui/               # Kit UI local (Tamagui + icônes lucide + composants custom)
│   └── *.tsx             # Sections (clips, long format, plan de campagne…)
├── lib/
│   ├── agents.ts         # Agents IA (appellent le backend, mêmes signatures)
│   ├── api.ts            # Helper fetch + réessais sur erreurs transitoires
│   ├── db.ts             # Adaptateur Supabase
│   ├── supabase.ts       # Client Supabase
│   ├── hooks/            # Hooks React Query (campaigns, clips, projects, waves…)
│   ├── normalizers.ts    # snake_case ↔ camelCase
│   └── types.ts          # Types + presets (modèles vidéo, durées, plateformes)
├── tamagui.config.ts     # Configuration Tamagui
└── vercel.json           # Build + config des fonctions (maxDuration, includeFiles)
```

## Déploiement

Le projet se déploie sur **Vercel** (build `expo export --platform web`, sortie `dist/`). Un push sur `main` déclenche un déploiement automatique. Penser à renseigner les variables d'environnement de production avant le premier déploiement.

## Notes & limites

- Les **modèles de vidéo IA ne savent pas écrire de texte lisible** : tout texte « dans » un clip (marque, CTA) ressort déformé. Utiliser l'**incrustation** du montage pour afficher un texte net, ou des **captures d'écran** (image-to-video) pour montrer la vraie interface.
- La génération **vidéo est payante** (fal.ai) : surveiller le solde du compte fal.
- Sécurité : l'app fonctionne en mono-utilisateur démo (RLS Supabase permissif). À durcir si une vraie authentification est ajoutée.
