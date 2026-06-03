import { useState } from 'react';
import { Linking } from 'react-native';
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
  toast,
  Sparkles,
  Trash2,
  Wand2,
  Download,
  Play,
  RefreshCw,
} from '@blinkdotnew/mobile-ui';
import { VideoClipPlayer } from './VideoClipPlayer';
import {
  useVideoProjects,
  useVideoScenes,
  useCreateVideoProject,
  useGenerateAllScenes,
  useGenerateScene,
  useDeleteVideoProject,
} from '@/lib/hooks';
import {
  VIDEO_MODELS,
  ASPECT_RATIOS,
  VIDEO_PRESETS,
  type Campaign,
  type VideoScript,
  type VideoProject,
  type VideoScene,
} from '@/lib/types';

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

          <SizableText size="$1" color="$color10" textAlign="center">
            💡 Coût estimé : ~{(2.5 * preset.scenes).toFixed(1)} crédits pour {preset.scenes} clips
          </SizableText>
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
              onDelete={() => deleteMut.mutate({ id: p.id, campaignId: campaign.id })}
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
  const [playingSceneIdx, setPlayingSceneIdx] = useState<number | null>(null);

  const readyScenes = scenes.filter((s: VideoScene) => s.status === 'ready' && s.video_url);
  const allReady = scenes.length > 0 && readyScenes.length === scenes.length;
  const anyGenerating = scenes.some((s: VideoScene) => s.status === 'generating') || generateAllMut.isPending;
  const failedScenes = scenes.filter((s: VideoScene) => s.status === 'failed');

  async function handleGenerateAll() {
    try {
      await generateAllMut.mutateAsync({ project, scenes });
      toast('Vidéo prête !', { message: 'Toutes les scènes sont générées.', variant: 'success' });
    } catch (err: any) {
      toast('Partiellement échoué', { message: err?.message || 'Certaines scènes ont échoué.', variant: 'error' });
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
      toast('Erreur', { message: err?.message || 'Échec', variant: 'error' });
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

        {/* Liste des scènes */}
        <YStack gap="$2">
          <SizableText size="$2" color="$color10" fontWeight="600" letterSpacing={0.5}>
            STORYBOARD ({scenes.length} SCÈNES)
          </SizableText>
          {scenes.map((scene: VideoScene) => (
            <SceneRow
              key={scene.id}
              scene={scene}
              onRegenerate={() => handleRegenerateScene(scene)}
              isRegenerating={generateOneMut.isPending && generateOneMut.variables?.sceneId === scene.id}
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
}: {
  scene: VideoScene;
  onRegenerate: () => void;
  isRegenerating: boolean;
}) {
  const isBusy = scene.status === 'generating' || isRegenerating;

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
        💡 Télécharge chaque scène et assemble-les dans CapCut / iMovie / Premiere pour un montage final
      </SizableText>
    </YStack>
  );
}
