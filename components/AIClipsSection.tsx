import { useState } from 'react';
import { Linking } from 'react-native';
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
  BlinkSelect,
  Label,
  toast,
  Sparkles,
  Trash2,
  Download,
  Wand2,
} from '@blinkdotnew/mobile-ui';
import { VideoClipPlayer } from './VideoClipPlayer';
import { useVideoClips, useGenerateVideoClip, useDeleteVideoClip } from '@/lib/hooks';
import { VIDEO_MODELS, ASPECT_RATIOS, DURATIONS, type Campaign, type VideoScript, type VideoClip } from '@/lib/types';

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

  const isGenerating = generateMut.isPending;

  async function handleGenerate() {
    try {
      await generateMut.mutateAsync({ campaign, script, model, aspectRatio, duration });
      toast('Clip vidéo prêt !', { message: 'Ton clip IA a été généré avec succès.', variant: 'success' });
    } catch (err: any) {
      const msg = err?.message || '';
      const isAuth = msg.includes('401') || msg.includes('Unauthorized') || msg.includes('BlinkAuthError');
      if (isAuth) {
        toast('Connexion requise', { message: 'Connecte-toi pour utiliser les agents IA.', variant: 'error' });
      } else {
        toast('Erreur de génération', { message: msg || 'Réessaye dans quelques instants.', variant: 'error' });
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
                items={DURATIONS}
                value={duration}
                onValueChange={setDuration}
                placeholder="Durée"
              />
            </YStack>
          </YStack>

          {/* Étapes de l'agent pendant la génération */}
          {isGenerating && (
            <YStack
              backgroundColor="$color3"
              borderRadius="$4"
              padding="$3"
              gap="$2"
              borderWidth={1}
              borderColor="$color5"
            >
              <AgentStep active label="🎨 Analyse du storyboard en cours…" />
              <AgentStep label="🖊️ Rédaction du prompt cinématique (EN)" />
              <AgentStep label="🎬 Envoi au moteur vidéo IA (30-60s)…" />
              <AgentStep label="💾 Sauvegarde du clip" />
            </YStack>
          )}

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
              onDelete={() => deleteMut.mutate({ id: clip.id, campaignId: campaign.id })}
            />
          ))}
        </YStack>
      )}
    </YStack>
  );
}

function AgentStep({ label, active }: { label: string; active?: boolean }) {
  return (
    <XStack alignItems="center" gap="$2">
      {active ? <Spinner size="small" color="$accent10" /> : <SizableText size="$3">◦</SizableText>}
      <SizableText size="$2" color={active ? '$color12' : '$color10'}>{label}</SizableText>
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
