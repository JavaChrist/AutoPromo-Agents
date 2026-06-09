import { useState, useEffect, useRef } from 'react';
import { Linking, Image } from 'react-native';
import {
  YStack,
  XStack,
  Card,
  SizableText,
  H4,
  Paragraph,
  Button,
  Badge,
  Spinner,
  Progress,
  BlinkSelect,
  Label,
  toast,
  Sparkles,
  Trash2,
  Download,
  Wand2,
  Check,
  ImagePlus,
  X,
} from '@blinkdotnew/mobile-ui';
import { VideoClipPlayer } from './VideoClipPlayer';
import { useVideoClips, useGenerateVideoClip, useDeleteVideoClip } from '@/lib/hooks';
import { describeGenerationError, isAuthError } from '@/lib/blink';
import { pickAndUploadScreenshot } from '@/lib/screenshots';
import { VIDEO_MODELS, ASPECT_RATIOS, MODEL_DURATIONS, type VideoModel, type Campaign, type VideoScript, type VideoClip } from '@/lib/types';

interface Props {
  campaign: Campaign;
  script: VideoScript | null;
}

export function AIClipsSection({ campaign, script }: Props) {
  const { data: clips = [] } = useVideoClips(campaign.id);
  const generateMut = useGenerateVideoClip();
  const deleteMut = useDeleteVideoClip();

  const [model, setModel] = useState<string>('fal-ai/veo3.1/fast');
  const [aspectRatio, setAspectRatio] = useState<string>('9:16');
  const [duration, setDuration] = useState<string>('8s');
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [uploadingShot, setUploadingShot] = useState(false);

  const durationOptions = MODEL_DURATIONS[model as VideoModel] ?? MODEL_DURATIONS['fal-ai/veo3.1/fast'];

  // Each model supports different durations — keep the selection valid on switch.
  useEffect(() => {
    if (!durationOptions.some((d) => d.value === duration)) {
      setDuration(durationOptions[0].value);
    }
  }, [model]); // eslint-disable-line react-hooks/exhaustive-deps

  const isGenerating = generateMut.isPending;

  async function handlePickScreenshot() {
    try {
      setUploadingShot(true);
      const publicUrl = await pickAndUploadScreenshot(campaign.id);
      if (!publicUrl) return;
      setScreenshotUrl(publicUrl);
      toast('Capture ajoutée', { message: 'La vidéo démarrera depuis ton écran d’appli.', variant: 'success' });
    } catch (err: any) {
      if (__DEV__) console.error('[uploadScreenshot] RAW ERROR →', err);
      toast('Upload impossible', { message: describeGenerationError(err), variant: 'error' });
    } finally {
      setUploadingShot(false);
    }
  }

  async function handleGenerate() {
    try {
      await generateMut.mutateAsync({
        campaign,
        script,
        model,
        aspectRatio,
        duration,
        imageUrl: screenshotUrl ?? undefined,
      });
      toast('Clip vidéo prêt !', { message: 'Ton clip IA a été généré avec succès.', variant: 'success' });
    } catch (err: any) {
      if (isAuthError(err)) {
        toast('Connexion requise', { message: 'Connecte-toi pour utiliser les agents IA.', variant: 'error' });
      } else {
        toast('Erreur de génération', { message: describeGenerationError(err), variant: 'error' });
      }
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
              L'agent clip utilise le storyboard du script pour créer un prompt cinématique de haute qualité avant d'appeler Veo ou Sora.
            </Paragraph>
          </YStack>
        </Card>
      </YStack>
    );
  }

  return (
    <YStack padding="$5" gap="$4">

      {/* ── Formulaire de génération ── */}
      <Card backgroundColor="$color2" borderColor="$color4" borderWidth={1} padding="$4">
        <YStack gap="$3">
          <XStack alignItems="center" gap="$2">
            <Wand2 size={20} color="#7C5CFF" />
            <SizableText size="$5" fontWeight="700" color="$color12">
              Nouveau clip IA
            </SizableText>
          </XStack>

          <YStack gap="$3">
            <YStack gap="$2">
              <Label color="$color12" fontWeight="600">Modèle</Label>
              <BlinkSelect
                items={VIDEO_MODELS.map((m) => ({ label: `${m.label} — ${m.description}`, value: m.value }))}
                value={model}
                onValueChange={setModel}
                placeholder="Choisir le modèle"
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
              <Label color="$color12" fontWeight="600">Durée</Label>
              <BlinkSelect
                items={durationOptions}
                value={duration}
                onValueChange={setDuration}
                placeholder="Durée"
              />
            </YStack>

            {/* Capture d'écran → image-to-video pour un rendu fidèle à l'appli */}
            <YStack gap="$2">
              <Label color="$color12" fontWeight="600">
                Capture d'écran de ton appli (optionnel)
              </Label>

              {screenshotUrl ? (
                <YStack gap="$2">
                  <YStack
                    borderRadius="$3"
                    overflow="hidden"
                    borderWidth={1}
                    borderColor="$color5"
                    backgroundColor="$color3"
                  >
                    <Image
                      source={{ uri: screenshotUrl }}
                      style={{ width: '100%', height: 180 }}
                      resizeMode="contain"
                    />
                  </YStack>
                  <XStack gap="$2">
                    <Button
                      flex={1}
                      size="$3"
                      icon={uploadingShot ? <Spinner size="small" /> : <ImagePlus size={14} />}
                      disabled={uploadingShot}
                      onPress={handlePickScreenshot}
                    >
                      Changer
                    </Button>
                    <Button
                      flex={1}
                      size="$3"
                      icon={<X size={14} color="$red10" />}
                      onPress={() => setScreenshotUrl(null)}
                    >
                      Retirer
                    </Button>
                  </XStack>
                </YStack>
              ) : (
                <Button
                  size="$3"
                  icon={uploadingShot ? <Spinner size="small" /> : <ImagePlus size={16} />}
                  disabled={uploadingShot}
                  onPress={handlePickScreenshot}
                >
                  {uploadingShot ? 'Upload en cours…' : 'Ajouter une capture d’écran'}
                </Button>
              )}

              <SizableText size="$1" color="$color10">
                📱 La vidéo démarrera depuis cette image (image-to-video) : l'interface
                montrée sera exactement celle de ton appli, animée par l'IA.
              </SizableText>
            </YStack>
          </YStack>

          {/* Progression de l'agent pendant la génération */}
          {isGenerating && <GenerationProgress estimatedMs={60000} />}

          <Button
            size="$5"
            backgroundColor="#7C5CFF"
            color="white"
            fontWeight="700"
            icon={isGenerating ? <Spinner size="small" color="white" /> : <Sparkles size={18} color="white" />}
            disabled={isGenerating}
            opacity={isGenerating ? 0.7 : 1}
            onPress={handleGenerate}
            pressStyle={{ scale: 0.97 }}
          >
            {isGenerating ? 'Génération en cours (30-60s)…' : 'Générer le clip vidéo'}
          </Button>

          <SizableText size="$1" color="$color10" textAlign="center">
            💡 Le clip s'inspire du storyboard de ton script. ~2.5 crédits/clip.
          </SizableText>

          <YStack
            backgroundColor="$color3"
            borderRadius="$3"
            padding="$3"
            borderWidth={1}
            borderColor="$color5"
            gap="$1"
          >
            <SizableText size="$2" color="$color12" fontWeight="700">
              ⏱️ Besoin d'une vidéo de 30 à 120s ?
            </SizableText>
            <SizableText size="$1" color="$color10">
              Un clip IA fait au maximum ~8‑12s (limite des modèles Veo/Sora/Kling).
              Pour une vidéo plus longue, utilise l'onglet « 🎦 Long format » : il
              assemble plusieurs scènes (jusqu'à 120s).
            </SizableText>
          </YStack>
        </YStack>
      </Card>

      {/* ── Liste des clips générés ── */}
      {clips.length > 0 && (
        <YStack gap="$3">
          <SizableText size="$4" fontWeight="700" color="$color12">
            Clips générés ({clips.length})
          </SizableText>
          {(clips as VideoClip[]).map((clip) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              onDelete={async () => {
                if (typeof window !== 'undefined' && !window.confirm('Supprimer ce clip ?')) return;
                try {
                  await deleteMut.mutateAsync({ id: clip.id, campaignId: campaign.id });
                  toast('Clip supprimé', { message: 'Le clip a été retiré.', variant: 'success' });
                } catch (err: any) {
                  if (__DEV__) console.error('[deleteVideoClip] RAW ERROR →', err);
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

/**
 * Time-based progress UI for the (blocking) video generation call.
 * The API doesn't stream a real percentage, so we ease toward ~95% over an
 * estimated duration and let the success/error path replace this block.
 */
function GenerationProgress({ estimatedMs = 60000 }: { estimatedMs?: number }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - startRef.current), 250);
    return () => clearInterval(id);
  }, []);

  // Asymptotic ramp: fast at first, never quite reaching 100% until it's done.
  const ratio = 1 - Math.exp((-3 * elapsed) / estimatedMs);
  const progress = Math.min(95, Math.round(ratio * 95));
  const seconds = Math.floor(elapsed / 1000);

  const steps = [
    { label: '🎨 Analyse du storyboard', done: progress > 12 },
    { label: '🖊️ Rédaction du prompt cinématique (EN)', done: progress > 28 },
    { label: '🎬 Génération vidéo par le moteur IA…', done: progress > 88 },
    { label: '💾 Sauvegarde du clip', done: false },
  ];
  const activeIndex = steps.findIndex((s) => !s.done);

  return (
    <YStack
      backgroundColor="$color3"
      borderRadius="$4"
      padding="$3"
      gap="$3"
      borderWidth={1}
      borderColor="$color5"
    >
      <XStack justifyContent="space-between" alignItems="center">
        <SizableText size="$2" color="$color12" fontWeight="700">
          Génération en cours…
        </SizableText>
        <SizableText size="$2" color="$color10">
          {progress}% • {seconds}s
        </SizableText>
      </XStack>

      <Progress value={progress} size="$2" backgroundColor="$color5">
        <Progress.Indicator animation="bouncy" backgroundColor="#7C5CFF" />
      </Progress>

      <YStack gap="$1.5">
        {steps.map((step, i) => (
          <AgentStep key={i} label={step.label} active={i === activeIndex} done={step.done} />
        ))}
      </YStack>

      <SizableText size="$1" color="$color10">
        ⏳ La génération vidéo peut prendre 30 à 60s. Garde cet onglet ouvert.
      </SizableText>
    </YStack>
  );
}

function AgentStep({ label, active, done }: { label: string; active?: boolean; done?: boolean }) {
  return (
    <XStack alignItems="center" gap="$2">
      {done ? (
        <Check size={14} color="#22C55E" />
      ) : active ? (
        <Spinner size="small" color="$accent10" />
      ) : (
        <SizableText size="$3" color="$color8">◦</SizableText>
      )}
      <SizableText size="$2" color={done || active ? '$color12' : '$color10'}>
        {label}
      </SizableText>
    </XStack>
  );
}

function ClipCard({ clip, onDelete }: { clip: VideoClip; onDelete: () => void }) {
  const modelLabel = VIDEO_MODELS.find((m) => m.value === clip.model)?.label || clip.model;
  // SDK returns camelCase fields
  const videoUrl = (clip as any).videoUrl || clip.video_url;
  const aspectRatio = (clip as any).aspectRatio || clip.aspect_ratio || '9:16';
  const duration = (clip as any).duration || '8s';

  return (
    <Card backgroundColor="$color2" borderColor="$color4" borderWidth={1} padding="$3">
      <YStack gap="$3">
        <XStack justifyContent="space-between" alignItems="center" gap="$2">
          <XStack gap="$2" alignItems="center" flex={1} flexWrap="wrap">
            <Badge
              variant={
                clip.status === 'ready' ? 'success' :
                clip.status === 'generating' ? 'info' :
                clip.status === 'failed' ? 'error' : 'default'
              }
            >
              {clip.status === 'ready' ? 'Prêt' :
               clip.status === 'generating' ? 'Génération…' :
               clip.status === 'failed' ? 'Échec' : 'En attente'}
            </Badge>
            <SizableText size="$2" color="$color10">
              {modelLabel} • {aspectRatio} • {duration}
            </SizableText>
          </XStack>
          <Button chromeless size="$2" icon={<Trash2 size={16} color="$red10" />} onPress={onDelete} />
        </XStack>

        {clip.status === 'generating' && (
          <YStack
            backgroundColor="$color3"
            borderRadius="$3"
            padding="$5"
            alignItems="center"
            gap="$2"
            aspectRatio={aspectToNum(aspectRatio)}
          >
            <Spinner size="large" color="$accent10" />
            <SizableText size="$2" color="$color11">Génération en cours…</SizableText>
          </YStack>
        )}

        {clip.status === 'ready' && videoUrl && (
          <YStack gap="$2">
            <VideoClipPlayer url={videoUrl} aspectRatio={aspectRatio} />
            <Button
              size="$3"
              icon={<Download size={14} />}
              onPress={() => Linking.openURL(videoUrl)}
            >
              Télécharger
            </Button>
            {clip.prompt && (
              <YStack gap="$1" marginTop="$1">
                <SizableText size="$1" color="$color10" fontWeight="600" letterSpacing={0.5}>
                  PROMPT IA
                </SizableText>
                <SizableText size="$2" color="$color11" numberOfLines={4}>
                  {clip.prompt}
                </SizableText>
              </YStack>
            )}
          </YStack>
        )}

        {clip.status === 'failed' && (
          <YStack
            backgroundColor="$red2"
            borderColor="$red6"
            borderWidth={1}
            borderRadius="$3"
            padding="$3"
            gap="$1"
          >
            <SizableText size="$3" color="$red10" fontWeight="700">Échec de la génération</SizableText>
            {clip.error && <SizableText size="$2" color="$red10">{clip.error}</SizableText>}
          </YStack>
        )}
      </YStack>
    </Card>
  );
}

function aspectToNum(ar: string): number {
  const parts = (ar || '9:16').split(':').map(Number);
  return parts.length === 2 && parts[1] ? parts[0] / parts[1] : 9 / 16;
}
