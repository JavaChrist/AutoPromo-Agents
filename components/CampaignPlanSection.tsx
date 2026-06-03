import { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
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
  toast,
  Sparkles,
  Trash2,
  Copy,
  Calendar,
  Target,
} from '@blinkdotnew/mobile-ui';
import {
  useCampaignWaves,
  useWavePosts,
  useGenerateCampaignPlan,
  useGenerateWavePosts,
  useDeleteWave,
} from '@/lib/hooks';
import { WAVE_TYPES, PLATFORM_META, type Campaign, type CampaignWave, type WavePost, type Platform } from '@/lib/types';

interface Props {
  campaign: Campaign;
}

const NUM_WAVES_OPTIONS = [
  { label: '3 vagues (minimal)', value: '3' },
  { label: '4 vagues (recommandé)', value: '4' },
  { label: '5 vagues (complet)', value: '5' },
  { label: '6 vagues (full launch)', value: '6' },
];

const DURATION_OPTIONS = [
  { label: '7 jours', value: '7' },
  { label: '14 jours (recommandé)', value: '14' },
  { label: '21 jours', value: '21' },
  { label: '30 jours', value: '30' },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function CampaignPlanSection({ campaign }: Props) {
  const { data: waves = [] } = useCampaignWaves(campaign.id);
  const planMut = useGenerateCampaignPlan();

  const [numWaves, setNumWaves] = useState<string>('4');
  const [durationDays, setDurationDays] = useState<string>('14');
  const [startDate, setStartDate] = useState<string>(todayISO());

  async function handleGeneratePlan() {
    try {
      const count = await planMut.mutateAsync({
        campaign,
        numWaves: Number(numWaves),
        durationDays: Number(durationDays),
        startDate,
      });
      toast('Plan généré !', {
        message: `${count} vagues planifiées sur ${durationDays} jours.`,
        variant: 'success',
      });
    } catch (err: any) {
      toast('Erreur de planification', {
        message: err?.message || 'Impossible de générer le plan.',
        variant: 'error',
      });
    }
  }

  return (
    <YStack padding="$5" gap="$4">
      {/* Générateur de plan */}
      <Card backgroundColor="$color2" borderColor="$color4" borderWidth={1} padding="$4">
        <YStack gap="$3">
          <XStack alignItems="center" gap="$2">
            <Target size={20} color="#FF4D8F" />
            <SizableText size="$5" fontWeight="700" color="$color12">
              {waves.length > 0 ? 'Régénérer le plan' : 'Planifier la campagne'}
            </SizableText>
          </XStack>

          <Paragraph size="$2" color="$color10">
            L'agent stratège conçoit un arc narratif en plusieurs vagues (teaser, lancement, social proof…) sur la durée choisie.
          </Paragraph>

          <YStack gap="$3">
            <YStack gap="$2">
              <Label color="$color12" fontWeight="600">Nombre de vagues</Label>
              <BlinkSelect
                items={NUM_WAVES_OPTIONS}
                value={numWaves}
                onValueChange={setNumWaves}
                placeholder="Vagues"
              />
            </YStack>

            <YStack gap="$2">
              <Label color="$color12" fontWeight="600">Durée totale</Label>
              <BlinkSelect
                items={DURATION_OPTIONS}
                value={durationDays}
                onValueChange={setDurationDays}
                placeholder="Durée"
              />
            </YStack>

            <YStack gap="$2">
              <Label color="$color12" fontWeight="600">Date de lancement (J)</Label>
              <Input
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
                size="$4"
                autoCapitalize="none"
              />
              <SizableText size="$1" color="$color10">
                Format : 2026-01-15 — Les teasers seront placés avant cette date.
              </SizableText>
            </YStack>
          </YStack>

          <Button
            size="$5"
            backgroundColor="#FF4D8F"
            color="white"
            fontWeight="700"
            icon={planMut.isPending ? <Spinner size="small" color="white" /> : <Sparkles size={18} color="white" />}
            disabled={planMut.isPending}
            opacity={planMut.isPending ? 0.7 : 1}
            onPress={handleGeneratePlan}
            pressStyle={{ scale: 0.97 }}
          >
            {planMut.isPending ? 'Stratège en cours…' : waves.length > 0 ? 'Régénérer le plan' : 'Générer le plan'}
          </Button>
        </YStack>
      </Card>

      {/* Timeline des vagues */}
      {waves.length > 0 && (
        <YStack gap="$3">
          <XStack alignItems="center" gap="$2">
            <Calendar size={18} color="$color12" />
            <SizableText size="$4" fontWeight="700" color="$color12">
              Calendrier ({waves.length} vagues)
            </SizableText>
          </XStack>
          {waves.map((wave: CampaignWave, idx: number) => (
            <WaveCard
              key={wave.id}
              wave={wave}
              campaign={campaign}
              isFirst={idx === 0}
              isLast={idx === waves.length - 1}
            />
          ))}
        </YStack>
      )}
    </YStack>
  );
}

function WaveCard({
  wave,
  campaign,
  isFirst,
  isLast,
}: {
  wave: CampaignWave;
  campaign: Campaign;
  isFirst: boolean;
  isLast: boolean;
}) {
  const meta = WAVE_TYPES[wave.type] || { label: wave.type, emoji: '📢', description: '' };
  const generatePostsMut = useGenerateWavePosts();
  const deleteWaveMut = useDeleteWave();
  const { data: posts = [] } = useWavePosts(wave.id);

  const [expanded, setExpanded] = useState(false);
  const isGenerating = generatePostsMut.isPending && generatePostsMut.variables?.wave.id === wave.id;
  const hasReadyPosts = wave.status === 'ready' || posts.length > 0;

  async function handleGenerate() {
    try {
      await generatePostsMut.mutateAsync({ campaign, wave });
      setExpanded(true);
      toast('Posts générés !', {
        message: `4 posts adaptés (IG/X/FB/LinkedIn) pour "${wave.name}".`,
        variant: 'success',
      });
    } catch (err: any) {
      toast('Erreur', { message: err?.message || 'Échec', variant: 'error' });
    }
  }

  return (
    <XStack gap="$3">
      {/* Timeline indicator */}
      <YStack alignItems="center" width={24}>
        {!isFirst && <YStack width={2} height={16} backgroundColor="$color5" />}
        <YStack
          width={20}
          height={20}
          borderRadius="$10"
          backgroundColor={wave.status === 'ready' ? '#7C5CFF' : '$color5'}
          alignItems="center"
          justifyContent="center"
        >
          <SizableText size="$1" color="white" fontWeight="700">
            {wave.wave_index + 1}
          </SizableText>
        </YStack>
        {!isLast && <YStack flex={1} width={2} minHeight={20} backgroundColor="$color5" />}
      </YStack>

      {/* Wave content */}
      <Card flex={1} backgroundColor="$color2" borderColor="$color4" borderWidth={1} padding="$3">
        <YStack gap="$2">
          <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
            <YStack flex={1} gap="$1">
              <XStack alignItems="center" gap="$2" flexWrap="wrap">
                <SizableText size="$5">{meta.emoji}</SizableText>
                <SizableText size="$4" fontWeight="700" color="$color12">
                  {wave.name}
                </SizableText>
              </XStack>
              <XStack gap="$2" alignItems="center" flexWrap="wrap">
                <Badge variant="info">{meta.label}</Badge>
                {wave.scheduled_date && (
                  <SizableText size="$2" color="$color10">
                    📅 {formatDate(wave.scheduled_date)}
                  </SizableText>
                )}
              </XStack>
            </YStack>
            <Button
              chromeless
              size="$2"
              icon={<Trash2 size={14} color="$red10" />}
              onPress={() => deleteWaveMut.mutate({ id: wave.id, campaignId: campaign.id })}
            />
          </XStack>

          {wave.description && (
            <SizableText size="$2" color="$color11">
              {wave.description}
            </SizableText>
          )}

          {wave.goal && (
            <YStack
              backgroundColor="$color3"
              borderRadius="$2"
              padding="$2"
              borderLeftWidth={3}
              borderLeftColor="#FF4D8F"
            >
              <SizableText size="$1" color="$color10" fontWeight="600" letterSpacing={0.5}>
                🎯 OBJECTIF
              </SizableText>
              <SizableText size="$2" color="$color12">
                {wave.goal}
              </SizableText>
            </YStack>
          )}

          {/* Action button */}
          {!hasReadyPosts && !isGenerating && (
            <Button
              size="$3"
              backgroundColor="#7C5CFF"
              color="white"
              fontWeight="700"
              icon={<Sparkles size={14} color="white" />}
              onPress={handleGenerate}
              pressStyle={{ scale: 0.97 }}
            >
              Générer les 4 posts
            </Button>
          )}

          {isGenerating && (
            <XStack alignItems="center" gap="$2" padding="$2">
              <Spinner size="small" color="$accent10" />
              <SizableText size="$2" color="$color11">Génération des 4 posts adaptés…</SizableText>
            </XStack>
          )}

          {hasReadyPosts && posts.length > 0 && (
            <>
              <Button
                size="$3"
                chromeless
                onPress={() => setExpanded((e) => !e)}
              >
                {expanded ? '▼' : '▶'} {posts.length} posts générés
              </Button>
              {expanded && (
                <YStack gap="$2">
                  {posts.map((post: WavePost) => (
                    <PostMini key={post.id} post={post} />
                  ))}
                  {hasReadyPosts && (
                    <Button
                      size="$2"
                      chromeless
                      icon={<Sparkles size={12} />}
                      onPress={handleGenerate}
                    >
                      Régénérer les posts
                    </Button>
                  )}
                </YStack>
              )}
            </>
          )}
        </YStack>
      </Card>
    </XStack>
  );
}

function PostMini({ post }: { post: WavePost }) {
  const meta = PLATFORM_META[post.platform as Platform];

  async function handleCopy() {
    const text = post.hashtags ? `${post.content}\n\n${post.hashtags}` : post.content;
    await Clipboard.setStringAsync(text);
    toast('Copié !', { message: `Post ${meta.label} prêt.`, variant: 'success' });
  }

  return (
    <YStack
      backgroundColor="$color3"
      borderRadius="$3"
      padding="$2"
      gap="$2"
      borderWidth={1}
      borderColor="$color4"
    >
      <XStack justifyContent="space-between" alignItems="center">
        <XStack alignItems="center" gap="$2">
          <SizableText size="$3">{meta.emoji}</SizableText>
          <SizableText size="$3" fontWeight="700" color="$color12">
            {meta.label}
          </SizableText>
        </XStack>
        <SizableText size="$1" color="$color10">
          {post.content.length}{meta.charLimit ? `/${meta.charLimit}` : ''} car.
        </SizableText>
      </XStack>
      <SizableText size="$2" color="$color12" lineHeight="$2" numberOfLines={6}>
        {post.content}
      </SizableText>
      {post.hashtags && (
        <SizableText size="$1" color="$accent10" numberOfLines={2}>
          {post.hashtags}
        </SizableText>
      )}
      <Button
        size="$2"
        icon={<Copy size={12} />}
        onPress={handleCopy}
      >
        Copier
      </Button>
    </YStack>
  );
}
