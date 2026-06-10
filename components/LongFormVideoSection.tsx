import { useState } from 'react';
import { Linking, Image } from 'react-native';
import {
  YStack,
  XStack,
  Card,
  H4,
  SizableText,
  Paragraph,
  Button,
  Badge,
  Spinner,
  BlinkSelect,
  Label,
  Input,
  TextArea,
  toast,
  Sparkles,
  Trash2,
  Wand2,
  Download,
  Play,
  RefreshCw,
  ImagePlus,
  Check,
  X,
} from '@/components/ui';
import { VideoClipPlayer } from './VideoClipPlayer';
import {
  useVideoProjects,
  useVideoScenes,
  useCreateVideoProject,
  useGenerateAllScenes,
  useGenerateScene,
  useDeleteVideoProject,
  useSetSceneScreenshot,
  useUpdateScenePrompt,
  useUpdateProjectVoiceover,
} from '@/lib/hooks';
import {
  extractSceneScreenshot,
  setSceneScreenshot,
  generateVoiceover,
  VOICEOVER_VOICES,
  type VoiceoverVoice,
} from '@/lib/agents';
import { pickAndUploadScreenshot } from '@/lib/screenshots';
import {
  VIDEO_MODELS,
  ASPECT_RATIOS,
  VIDEO_PRESETS,
  type Campaign,
  type VideoScript,
  type VideoProject,
  type VideoScene,
} from '@/lib/types';
import { describeGenerationError } from '@/lib/errors';
import { mergeScenes } from '@/lib/mergeVideo';

interface Props {
  campaign: Campaign;
  script: VideoScript | null;
}

export function LongFormVideoSection({ campaign, script }: Props) {
  const { data: projects = [] } = useVideoProjects(campaign.id);
  const createMut = useCreateVideoProject();
  const deleteMut = useDeleteVideoProject();

  const [duration, setDuration] = useState<number>(30);
  const [aspectRatio, setAspectRatio] = useState<string>('9:16');
  const [model, setModel] = useState<string>('fal-ai/veo3.1/fast');

  const preset = VIDEO_PRESETS.find((p) => p.value === duration) || VIDEO_PRESETS[1];

  async function handleCreateProject() {
    try {
      await createMut.mutateAsync({
        campaign,
        script,
        targetDuration: duration,
        numScenes: preset.scenes,
        sceneDuration: preset.sceneDuration,
        aspectRatio,
        model,
      });
      toast('Storyboard généré !', {
        message: `${preset.scenes} scènes prêtes. Clique sur "Générer toutes les scènes" pour créer les clips.`,
        variant: 'success',
      });
    } catch (err: any) {
      toast('Erreur de planification', {
        message: err?.message || 'Impossible de planifier les scènes.',
        variant: 'error',
      });
    }
  }

  if (!script?.storyboard && !script?.hook) {
    return (
      <YStack padding="$5" gap="$4">
        <Card backgroundColor="$color2" borderColor="$color4" borderWidth={1} padding="$4">
          <YStack gap="$3" alignItems="center">
            <Wand2 size={36} color="$color9" />
            <H4 color="$color12" textAlign="center">Génère d'abord le script</H4>
            <Paragraph size="$3" color="$color10" textAlign="center">
              La vidéo long format découpe ton script en {preset.scenes} scènes cinématiques, chacune générée séparément par l'IA puis jouée en séquence.
            </Paragraph>
          </YStack>
        </Card>
      </YStack>
    );
  }

  return (
    <YStack padding="$5" gap="$4">
      {/* Création projet */}
      <Card backgroundColor="$color2" borderColor="$color4" borderWidth={1} padding="$4">
        <YStack gap="$3">
          <XStack alignItems="center" gap="$2">
            <Wand2 size={20} color="#7C5CFF" />
            <SizableText size="$5" fontWeight="700" color="$color12">
              Nouvelle vidéo longue
            </SizableText>
          </XStack>

          <Paragraph size="$2" color="$color10">
            L'agent IA découpe le script en scènes, puis génère chaque clip individuellement.
          </Paragraph>

          <YStack gap="$3">
            <YStack gap="$2">
              <Label color="$color12" fontWeight="600">Durée totale</Label>
              <BlinkSelect
                items={VIDEO_PRESETS.map((p) => ({ label: p.label, value: String(p.value) }))}
                value={String(duration)}
                onValueChange={(v) => setDuration(Number(v))}
                placeholder="Durée"
              />
            </YStack>

            <YStack gap="$2">
              <Label color="$color12" fontWeight="600">Format</Label>
              <BlinkSelect
                items={ASPECT_RATIOS}
                value={aspectRatio}
                onValueChange={setAspectRatio}
                placeholder="Format vidéo"
              />
            </YStack>

            <YStack gap="$2">
              <Label color="$color12" fontWeight="600">Modèle IA</Label>
              <BlinkSelect
                items={VIDEO_MODELS.map((m) => ({ label: `${m.label} — ${m.description}`, value: m.value }))}
                value={model}
                onValueChange={setModel}
                placeholder="Modèle"
              />
            </YStack>
          </YStack>

          <Button
            size="$5"
            backgroundColor="#7C5CFF"
            color="white"
            fontWeight="700"
            icon={createMut.isPending ? <Spinner size="small" color="white" /> : <Sparkles size={18} color="white" />}
            disabled={createMut.isPending}
            opacity={createMut.isPending ? 0.7 : 1}
            onPress={handleCreateProject}
            pressStyle={{ scale: 0.97 }}
          >
            {createMut.isPending ? 'Planification…' : `Planifier ${preset.scenes} scènes`}
          </Button>
        </YStack>
      </Card>

      {/* Liste des projets */}
      {projects.length > 0 && (
        <YStack gap="$3">
          <SizableText size="$4" fontWeight="700" color="$color12">
            Projets vidéo ({projects.length})
          </SizableText>
          {(projects as VideoProject[]).map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onDelete={async () => {
                if (typeof window !== 'undefined' && !window.confirm(`Supprimer le montage « ${p.title} » ?`)) {
                  return;
                }
                try {
                  await deleteMut.mutateAsync({ id: p.id, campaignId: campaign.id });
                  toast('Montage supprimé', { message: 'Le projet a été retiré.', variant: 'success' });
                } catch (err: any) {
                  if (__DEV__) console.error('[deleteVideoProject] RAW ERROR →', err);
                  toast('Suppression impossible', { message: describeGenerationError(err), variant: 'error' });
                }
              }}
            />
          ))}
        </YStack>
      )}
    </YStack>
  );
}

function ProjectCard({ project, onDelete }: { project: VideoProject; onDelete: () => void }) {
  const { data: scenes = [] } = useVideoScenes(project.id);
  const generateAllMut = useGenerateAllScenes();
  const generateOneMut = useGenerateScene();
  const setShotMut = useSetSceneScreenshot();
  const [playingSceneIdx, setPlayingSceneIdx] = useState<number | null>(null);
  const [uploadingSceneId, setUploadingSceneId] = useState<string | null>(null);

  const readyScenes = scenes.filter((s: VideoScene) => s.status === 'ready' && s.video_url);
  const allReady = scenes.length > 0 && readyScenes.length === scenes.length;
  const anyGenerating = scenes.some((s: VideoScene) => s.status === 'generating') || generateAllMut.isPending;
  const failedScenes = scenes.filter((s: VideoScene) => s.status === 'failed');

  const updateVoiceoverMut = useUpdateProjectVoiceover();

  const [merging, setMerging] = useState(false);
  const [mergeStep, setMergeStep] = useState<string | null>(null);
  const [mergedUrl, setMergedUrl] = useState<string | null>(null);
  const [voice, setVoice] = useState<string>('none');

  // Editable voiceover text (persisted to the project on save).
  const [voiceoverDraft, setVoiceoverDraft] = useState<string>(project.voiceover_full || '');
  const voiceoverText = voiceoverDraft.trim();

  // Optional on-screen text overlays burned into the final video.
  const [overlayTitle, setOverlayTitle] = useState<string>('');
  const [overlayCta, setOverlayCta] = useState<string>('');
  const [overlayUrl, setOverlayUrl] = useState<string>('');

  async function handleSaveVoiceover() {
    try {
      await updateVoiceoverMut.mutateAsync({
        projectId: project.id,
        campaignId: project.campaign_id,
        voiceover: voiceoverDraft,
      });
      toast('Voix off enregistrée', { message: 'Le texte de la voix off a été mis à jour.', variant: 'success' });
    } catch (err: any) {
      toast('Erreur', { message: describeGenerationError(err), variant: 'error' });
    }
  }

  async function handleMerge() {
    const urls = [...readyScenes]
      .sort((a: VideoScene, b: VideoScene) => a.scene_index - b.scene_index)
      .map((s: VideoScene) => s.video_url as string)
      .filter(Boolean);
    if (urls.length < 2) {
      toast('Pas assez de scènes', { message: 'Il faut au moins 2 scènes prêtes.', variant: 'error' });
      return;
    }
    setMerging(true);
    try {
      // 1. Voix off (optionnelle) : TTS du texte du script
      let audioUrl: string | undefined;
      if (voice !== 'none' && voiceoverText) {
        setMergeStep('🎙️ Génération de la voix off…');
        audioUrl = await generateVoiceover(voiceoverText, voice as VoiceoverVoice);
      }

      // 2. Assemblage + mixage + incrustations côté serveur
      setMergeStep(audioUrl ? '🎬 Assemblage + mixage de la voix…' : '🎬 Assemblage des scènes…');
      const overlays = {
        title: overlayTitle.trim() || undefined,
        cta: overlayCta.trim() || undefined,
        url: overlayUrl.trim() || undefined,
      };
      const hasOverlays = !!(overlays.title || overlays.cta || overlays.url);
      const { url, overlayApplied, overlayWarning } = await mergeScenes(urls, project.title, {
        audioUrl,
        overlays: hasOverlays ? overlays : undefined,
        totalDuration: project.target_duration,
        aspectRatio: project.aspect_ratio,
      });
      setMergedUrl(url);
      if (hasOverlays && overlayWarning) {
        toast('Vidéo assemblée (sans incrustation)', { message: overlayWarning, variant: 'error' });
      } else {
        toast('Vidéo assemblée !', {
          message:
            hasOverlays && overlayApplied
              ? 'Montage avec voix off et texte incrusté prêt.'
              : audioUrl
                ? 'Montage complet avec voix off prêt.'
                : 'Ton montage complet est prêt.',
          variant: 'success',
        });
      }
    } catch (err: any) {
      toast('Fusion impossible', { message: describeGenerationError(err), variant: 'error' });
    } finally {
      setMerging(false);
      setMergeStep(null);
    }
  }

  async function handleGenerateAll() {
    try {
      await generateAllMut.mutateAsync({ project, scenes });
      toast('Vidéo prête !', { message: 'Toutes les scènes sont générées.', variant: 'success' });
    } catch (err: any) {
      toast('Partiellement échoué', { message: describeGenerationError(err), variant: 'error' });
    }
  }

  async function handleSetScreenshot(scene: VideoScene) {
    try {
      setUploadingSceneId(scene.id);
      const url = await pickAndUploadScreenshot(project.id);
      if (!url) return;
      await setShotMut.mutateAsync({
        sceneId: scene.id,
        projectId: project.id,
        prompt: scene.prompt || '',
        imageUrl: url,
      });
      toast('Capture liée à la scène', {
        message: `La scène #${scene.scene_index} démarrera depuis cette page de ton appli.`,
        variant: 'success',
      });
    } catch (err: any) {
      if (__DEV__) console.error('[setSceneScreenshot] RAW ERROR →', err);
      toast('Upload impossible', { message: describeGenerationError(err), variant: 'error' });
    } finally {
      setUploadingSceneId(null);
    }
  }

  async function handleRemoveScreenshot(scene: VideoScene) {
    try {
      await setShotMut.mutateAsync({
        sceneId: scene.id,
        projectId: project.id,
        prompt: scene.prompt || '',
        imageUrl: null,
      });
    } catch (err: any) {
      toast('Erreur', { message: describeGenerationError(err), variant: 'error' });
    }
  }

  async function handleRegenerateScene(scene: VideoScene) {
    if (!scene.prompt) return;
    try {
      await generateOneMut.mutateAsync({
        sceneId: scene.id,
        projectId: project.id,
        prompt: scene.prompt,
        model: project.model,
        aspectRatio: project.aspect_ratio,
        duration: scene.duration,
      });
    } catch (err: any) {
      toast('Erreur', { message: describeGenerationError(err), variant: 'error' });
    }
  }

  return (
    <Card backgroundColor="$color2" borderColor="$color4" borderWidth={1} padding="$3">
      <YStack gap="$3">
        {/* Header */}
        <XStack justifyContent="space-between" alignItems="center" gap="$2">
          <YStack flex={1} gap="$1">
            <SizableText size="$5" fontWeight="700" color="$color12">
              {project.title}
            </SizableText>
            <XStack gap="$2" alignItems="center" flexWrap="wrap">
              <Badge
                variant={
                  project.status === 'ready' ? 'success' :
                  project.status === 'generating' ? 'info' :
                  project.status === 'failed' ? 'error' : 'default'
                }
              >
                {project.status === 'ready' ? 'Prêt' :
                 project.status === 'generating' ? 'Génération' :
                 project.status === 'failed' ? 'Échec' :
                 project.status === 'planning' ? 'Storyboard' : 'Brouillon'}
              </Badge>
              <SizableText size="$2" color="$color10">
                {project.aspect_ratio} • {readyScenes.length}/{scenes.length} scènes
              </SizableText>
            </XStack>
          </YStack>
          <Button chromeless size="$2" icon={<Trash2 size={16} color="$red10" />} onPress={onDelete} />
        </XStack>

        {/* Bouton générer tout */}
        {scenes.length > 0 && !allReady && (
          <Button
            size="$4"
            backgroundColor={anyGenerating ? '$color3' : '#FF4D8F'}
            color={anyGenerating ? '$color12' : 'white'}
            fontWeight="700"
            icon={anyGenerating ? <Spinner size="small" /> : <Sparkles size={16} color="white" />}
            disabled={anyGenerating}
            onPress={handleGenerateAll}
            pressStyle={{ scale: 0.97 }}
          >
            {anyGenerating
              ? `Génération… ${readyScenes.length}/${scenes.length}`
              : failedScenes.length > 0
              ? `Retry ${failedScenes.length} scène(s) échouée(s)`
              : `Générer les ${scenes.length} scènes (parallèle)`}
          </Button>
        )}

        {/* Player séquentiel si tout est prêt */}
        {allReady && readyScenes.length > 0 && (
          <SequentialPlayer
            scenes={readyScenes}
            aspectRatio={project.aspect_ratio}
            currentIndex={playingSceneIdx}
            onSceneChange={setPlayingSceneIdx}
          />
        )}

        {/* Assemblage automatique en un seul MP4 (serveur) */}
        {allReady && readyScenes.length > 1 && (
          <YStack
            backgroundColor="$color2"
            borderRadius="$3"
            padding="$3"
            gap="$2"
            borderWidth={1}
            borderColor="$accent6"
          >
            {/* Voix off optionnelle (texte éditable → TTS, mixée au montage) */}
            <YStack gap="$2">
              <Label color="$color12" fontWeight="600">🎙️ Voix off</Label>
              <BlinkSelect
                items={[
                  { label: 'Sans voix off', value: 'none' },
                  ...VOICEOVER_VOICES.map((v) => ({ label: v.label, value: v.value })),
                ]}
                value={voice}
                onValueChange={setVoice}
                placeholder="Voix off"
              />
              {voice !== 'none' ? (
                <YStack gap="$2">
                  <SizableText size="$1" color="$color10">
                    Texte lu par la voix off (modifiable) :
                  </SizableText>
                  <TextArea
                    value={voiceoverDraft}
                    onChangeText={setVoiceoverDraft}
                    placeholder="Saisis ou colle ici le texte que la voix off doit lire (en français)…"
                    minHeight={90}
                    size="$3"
                    backgroundColor="$color1"
                    color="$color12"
                  />
                  <XStack gap="$2" alignItems="center">
                    <Button
                      size="$2"
                      icon={updateVoiceoverMut.isPending ? <Spinner size="small" /> : <Check size={14} />}
                      disabled={updateVoiceoverMut.isPending}
                      onPress={handleSaveVoiceover}
                    >
                      Enregistrer le texte
                    </Button>
                    {!voiceoverText ? (
                      <SizableText size="$1" color="$red10" flex={1}>
                        Texte vide — saisis-le pour générer la voix off.
                      </SizableText>
                    ) : null}
                  </XStack>
                </YStack>
              ) : null}
            </YStack>

            {/* Incrustation de texte (brûlée dans la vidéo via ffmpeg) */}
            <YStack gap="$2">
              <Label color="$color12" fontWeight="600">🅰️ Texte à incruster (optionnel)</Label>
              <SizableText size="$1" color="$color10">
                Affiché par-dessus la vidéo (les modèles IA ne savent pas écrire de texte lisible).
                Le titre reste en haut ; l'accroche et l'URL apparaissent en bas sur les dernières secondes.
              </SizableText>
              <Input
                value={overlayTitle}
                onChangeText={setOverlayTitle}
                placeholder="Titre / marque (ex. RideCloud)"
                size="$3"
              />
              <Input
                value={overlayCta}
                onChangeText={setOverlayCta}
                placeholder="Accroche / CTA (ex. Téléchargez l'app)"
                size="$3"
              />
              <Input
                value={overlayUrl}
                onChangeText={setOverlayUrl}
                placeholder="URL (ex. ridecloud.app)"
                size="$3"
                autoCapitalize="none"
              />
            </YStack>

            <Button
              size="$4"
              backgroundColor={merging ? '$color3' : '#7C5CFF'}
              color={merging ? '$color12' : 'white'}
              fontWeight="700"
              icon={merging ? <Spinner size="small" color="$color12" /> : <Sparkles size={16} color="white" />}
              disabled={merging}
              onPress={handleMerge}
              pressStyle={{ scale: 0.97 }}
            >
              {merging
                ? mergeStep || 'Assemblage en cours…'
                : `Assembler les ${readyScenes.length} scènes en 1 vidéo`}
            </Button>

            {mergedUrl && (
              <YStack gap="$2">
                <SizableText size="$2" color="$color12" fontWeight="700">
                  ✅ Vidéo complète
                </SizableText>
                <VideoClipPlayer url={mergedUrl} aspectRatio={project.aspect_ratio} />
                <Button
                  size="$3"
                  icon={<Download size={14} />}
                  onPress={() => mergedUrl && Linking.openURL(mergedUrl)}
                >
                  Télécharger la vidéo complète
                </Button>
              </YStack>
            )}

            <SizableText size="$1" color="$color10">
              ⚙️ Fusion réalisée côté serveur (disponible sur la version déployée).
            </SizableText>
          </YStack>
        )}

        {/* Liste des scènes */}
        <YStack gap="$2">
          <SizableText size="$2" color="$color10" fontWeight="600" letterSpacing={0.5}>
            STORYBOARD ({scenes.length} SCÈNES)
          </SizableText>
          <SizableText size="$1" color="$color10">
            📱 Ajoute une capture d'écran à chaque scène pour montrer les vraies pages de
            ton appli : la scène démarrera depuis cette image (image-to-video).
          </SizableText>
          {scenes.map((scene: VideoScene) => (
            <SceneRow
              key={scene.id}
              scene={scene}
              onRegenerate={() => handleRegenerateScene(scene)}
              isRegenerating={generateOneMut.isPending && generateOneMut.variables?.sceneId === scene.id}
              onAddScreenshot={() => handleSetScreenshot(scene)}
              onRemoveScreenshot={() => handleRemoveScreenshot(scene)}
              isUploadingScreenshot={uploadingSceneId === scene.id}
            />
          ))}
        </YStack>
      </YStack>
    </Card>
  );
}

function SceneRow({
  scene,
  onRegenerate,
  isRegenerating,
  onAddScreenshot,
  onRemoveScreenshot,
  isUploadingScreenshot,
}: {
  scene: VideoScene;
  onRegenerate: () => void;
  isRegenerating: boolean;
  onAddScreenshot: () => void;
  onRemoveScreenshot: () => void;
  isUploadingScreenshot: boolean;
}) {
  const isBusy = scene.status === 'generating' || isRegenerating;
  const { prompt: cleanPrompt, imageUrl: screenshotUrl } = extractSceneScreenshot(scene.prompt || '');

  const updatePromptMut = useUpdateScenePrompt();
  const [editing, setEditing] = useState(false);
  const [promptDraft, setPromptDraft] = useState(cleanPrompt);

  async function handleSavePrompt() {
    try {
      const full = setSceneScreenshot(promptDraft, screenshotUrl ?? null);
      await updatePromptMut.mutateAsync({ sceneId: scene.id, projectId: scene.project_id, prompt: full });
      setEditing(false);
      toast('Prompt enregistré', {
        message: `Scène #${scene.scene_index} mise à jour. Régénère-la pour appliquer.`,
        variant: 'success',
      });
    } catch (err: any) {
      toast('Erreur', { message: describeGenerationError(err), variant: 'error' });
    }
  }

  return (
    <YStack
      backgroundColor="$color3"
      borderRadius="$3"
      padding="$3"
      gap="$2"
      borderWidth={1}
      borderColor="$color4"
    >
      <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
        <YStack flex={1} gap="$1">
          <XStack alignItems="center" gap="$2">
            <SizableText size="$3" fontWeight="700" color="$color12">
              #{scene.scene_index} {scene.title}
            </SizableText>
            <Badge
              variant={
                scene.status === 'ready' ? 'success' :
                scene.status === 'generating' ? 'info' :
                scene.status === 'failed' ? 'error' : 'default'
              }
            >
              {scene.status === 'ready' ? '✓' :
               scene.status === 'generating' ? '⋯' :
               scene.status === 'failed' ? '!' : '○'}
            </Badge>
          </XStack>
          {scene.description ? (
            <SizableText size="$2" color="$color11">
              {scene.description}
            </SizableText>
          ) : null}
        </YStack>
        {scene.status === 'ready' && scene.video_url ? (
          <Button
            chromeless
            size="$2"
            icon={<RefreshCw size={14} color="$color10" />}
            onPress={onRegenerate}
            disabled={isBusy}
          />
        ) : null}
      </XStack>

      {/* Édition manuelle du prompt de la scène */}
      {editing ? (
        <YStack gap="$2">
          <TextArea
            value={promptDraft}
            onChangeText={setPromptDraft}
            placeholder="Décris la scène (prompt cinématique, en anglais de préférence pour de meilleurs rendus)…"
            minHeight={110}
            size="$3"
            backgroundColor="$color1"
            color="$color12"
          />
          <XStack gap="$2">
            <Button
              size="$2"
              icon={updatePromptMut.isPending ? <Spinner size="small" /> : <Check size={14} />}
              disabled={updatePromptMut.isPending}
              onPress={handleSavePrompt}
            >
              Enregistrer
            </Button>
            <Button
              size="$2"
              chromeless
              disabled={updatePromptMut.isPending}
              onPress={() => {
                setPromptDraft(cleanPrompt);
                setEditing(false);
              }}
            >
              Annuler
            </Button>
          </XStack>
        </YStack>
      ) : (
        <XStack alignItems="center" justifyContent="space-between" gap="$2">
          <SizableText size="$1" color="$color10" flex={1} numberOfLines={2}>
            {cleanPrompt || 'Aucun prompt — clique sur Modifier pour en écrire un.'}
          </SizableText>
          <Button size="$2" chromeless disabled={isBusy} onPress={() => setEditing(true)}>
            ✏️ Modifier
          </Button>
        </XStack>
      )}

      {/* Capture d'écran attachée à la scène (image-to-video) */}
      {screenshotUrl ? (
        <XStack gap="$2" alignItems="center">
          <YStack
            borderRadius="$2"
            overflow="hidden"
            borderWidth={1}
            borderColor="$color5"
            backgroundColor="$color2"
          >
            <Image
              source={{ uri: screenshotUrl }}
              style={{ width: 72, height: 72 }}
              resizeMode="cover"
            />
          </YStack>
          <YStack flex={1} gap="$1">
            <SizableText size="$1" color="$color11" fontWeight="600">
              📱 Capture liée — la scène démarre sur cette page
            </SizableText>
            <XStack gap="$2">
              <Button
                size="$2"
                icon={isUploadingScreenshot ? <Spinner size="small" /> : <ImagePlus size={12} />}
                disabled={isUploadingScreenshot || isBusy}
                onPress={onAddScreenshot}
              >
                Changer
              </Button>
              <Button
                size="$2"
                chromeless
                icon={<X size={12} color="$red10" />}
                disabled={isBusy}
                onPress={onRemoveScreenshot}
              >
                Retirer
              </Button>
            </XStack>
          </YStack>
        </XStack>
      ) : (
        <Button
          size="$2"
          icon={isUploadingScreenshot ? <Spinner size="small" /> : <ImagePlus size={12} />}
          disabled={isUploadingScreenshot || isBusy}
          onPress={onAddScreenshot}
        >
          {isUploadingScreenshot ? 'Upload…' : 'Ajouter une capture de cette page'}
        </Button>
      )}

      {scene.status === 'ready' && scene.video_url && (
        <VideoClipPlayer url={scene.video_url} aspectRatio="9:16" />
      )}

      {isBusy && (
        <XStack alignItems="center" gap="$2">
          <Spinner size="small" color="$accent10" />
          <SizableText size="$2" color="$color10">Génération du clip…</SizableText>
        </XStack>
      )}

      {scene.status === 'failed' && scene.error && (
        <YStack
          backgroundColor="$red2"
          borderColor="$red6"
          borderWidth={1}
          borderRadius="$2"
          padding="$2"
          gap="$1"
        >
          <SizableText size="$2" color="$red10">{scene.error}</SizableText>
          <Button size="$2" onPress={onRegenerate} disabled={isBusy}>
            Réessayer
          </Button>
        </YStack>
      )}
    </YStack>
  );
}

function SequentialPlayer({
  scenes,
  aspectRatio,
  currentIndex,
  onSceneChange,
}: {
  scenes: VideoScene[];
  aspectRatio: string;
  currentIndex: number | null;
  onSceneChange: (idx: number | null) => void;
}) {
  const activeIdx = currentIndex ?? 0;
  const current = scenes[activeIdx];

  if (!current?.video_url) return null;

  return (
    <YStack
      gap="$2"
      backgroundColor="$color1"
      borderRadius="$3"
      padding="$2"
      borderWidth={1}
      borderColor="$accent6"
    >
      <XStack alignItems="center" gap="$2">
        <Play size={14} color="#7C5CFF" />
        <SizableText size="$2" color="$color12" fontWeight="700">
          Lecture • Scène {activeIdx + 1}/{scenes.length}
        </SizableText>
      </XStack>
      <VideoClipPlayer url={current.video_url} aspectRatio={aspectRatio} />
      <XStack gap="$2">
        <Button
          flex={1}
          size="$2"
          disabled={activeIdx === 0}
          opacity={activeIdx === 0 ? 0.4 : 1}
          onPress={() => onSceneChange(activeIdx - 1)}
        >
          ← Précédent
        </Button>
        <Button
          flex={1}
          size="$2"
          disabled={activeIdx >= scenes.length - 1}
          opacity={activeIdx >= scenes.length - 1 ? 0.4 : 1}
          onPress={() => onSceneChange(activeIdx + 1)}
        >
          Suivant →
        </Button>
      </XStack>
      <Button
        size="$2"
        chromeless
        icon={<Download size={14} />}
        onPress={() => current.video_url && Linking.openURL(current.video_url)}
      >
        Télécharger cette scène
      </Button>
      <SizableText size="$1" color="$color10" textAlign="center">
        💡 Utilise le bouton « Assembler les scènes en 1 vidéo » ci-dessous pour obtenir le MP4 complet automatiquement
      </SizableText>
    </YStack>
  );
}
