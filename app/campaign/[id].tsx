import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  YStack,
  XStack,
  ScrollView,
  H2,
  H4,
  SizableText,
  Paragraph,
  Button,
  Card,
  Spinner,
  AppHeader,
  Badge,
  Divider,
  BlinkToggleGroup,
  toast,
  Sparkles,
  Copy,
  Trash2,
  ExternalLink,
  Film,
  MessageSquare,
  RefreshCw,
  Check,
  AlertCircle,
} from '@/components/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useCampaign,
  useVideoScript,
  useSocialPosts,
  useGenerateContent,
  useDeleteCampaign,
  useStuckGenerationGuard,
} from '@/lib/hooks';
import { PLATFORM_META, type Platform, type SocialPost } from '@/lib/types';
import { describeGenerationError } from '@/lib/errors';
import { useGenerationStore, type AgentStepKey, type AgentStepState } from '@/lib/stores/generation';
import { AIClipsSection } from '@/components/AIClipsSection';
import { LongFormVideoSection } from '@/components/LongFormVideoSection';
import { CampaignPlanSection } from '@/components/CampaignPlanSection';

export default function CampaignDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [section, setSection] = useState<'video' | 'clips' | 'longform' | 'posts' | 'plan'>('video');

  const { data: campaign, isLoading } = useCampaign(id || '');
  const { data: script } = useVideoScript(id || '');
  const { data: posts } = useSocialPosts(id || '');

  const generateMut = useGenerateContent();
  const deleteMut = useDeleteCampaign();

  // Self-heal a phantom 'generating' status left over from a crashed/reloaded run.
  useStuckGenerationGuard(campaign);

  const isGenerating = campaign?.status === 'generating' || generateMut.isPending;

  async function handleGenerate() {
    if (!campaign) return;
    try {
      await generateMut.mutateAsync(campaign);
      toast('Contenu généré !', { message: 'Scripts et posts prêts.', variant: 'success' });
    } catch (err: any) {
      toast('Erreur de génération', { message: describeGenerationError(err), variant: 'error' });
    }
  }

  async function handleDelete() {
    if (!id) return;
    try {
      await deleteMut.mutateAsync(id);
      router.back();
    } catch (err: any) {
      toast('Erreur', { message: err?.message || 'Impossible de supprimer.', variant: 'error' });
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0E0E1A' }} edges={['top']}>
        <YStack flex={1} justifyContent="center" alignItems="center" gap="$3" backgroundColor="$color1">
          <Spinner size="large" color="$color9" />
        </YStack>
      </SafeAreaView>
    );
  }

  if (!campaign) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0E0E1A' }} edges={['top']}>
        <YStack flex={1} backgroundColor="$color1">
          <AppHeader title="Campagne" variant="back" onBack={() => router.back()} />
          <YStack flex={1} justifyContent="center" alignItems="center" gap="$3" padding="$5">
            <Film size={48} color="$color9" />
            <H4 color="$color12" textAlign="center">Campagne introuvable</H4>
            <Paragraph size="$3" color="$color10" textAlign="center">
              Cette campagne n&apos;existe plus ou n&apos;a pas pu être chargée.
            </Paragraph>
            <Button
              size="$4"
              backgroundColor="#FF4D8F"
              color="white"
              fontWeight="700"
              onPress={() => router.replace('/')}
              pressStyle={{ scale: 0.97 }}
            >
              Retour à la liste
            </Button>
          </YStack>
        </YStack>
      </SafeAreaView>
    );
  }

  const hasContent = !!script || (posts && posts.length > 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0E0E1A' }} edges={['top']}>
      <YStack flex={1} backgroundColor="$color1">
        <AppHeader
          title={campaign.product_name}
          variant="back"
          onBack={() => router.back()}
          right={
            <Button
              chromeless
              icon={<Trash2 size={20} color="$red10" />}
              onPress={handleDelete}
            />
          }
        />

        <ScrollView flex={1} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Pitch card */}
          <YStack padding="$5" gap="$3">
            <Card backgroundColor="$color2" borderColor="$color4" borderWidth={1} padding="$4">
              <YStack gap="$2">
                <XStack alignItems="center" gap="$2">
                  <Badge variant="info">{campaign.tone || 'professionnel'}</Badge>
                  {campaign.product_url ? (
                    <Button
                      size="$2"
                      chromeless
                      icon={<ExternalLink size={14} />}
                      onPress={() => campaign.product_url && Linking.openURL(campaign.product_url)}
                    >
                      Ouvrir PWA
                    </Button>
                  ) : null}
                </XStack>
                <Paragraph size="$3" color="$color12">{campaign.pitch}</Paragraph>
                {campaign.target_audience ? (
                  <SizableText size="$2" color="$color10">
                    🎯 {campaign.target_audience}
                  </SizableText>
                ) : null}
              </YStack>
            </Card>

            {/* Generate button */}
            <Button
              size="$5"
              backgroundColor={hasContent ? '$color3' : '#FF4D8F'}
              borderWidth={hasContent ? 1 : 0}
              borderColor="$color5"
              color={hasContent ? '$color12' : 'white'}
              fontWeight="700"
              icon={
                isGenerating ? (
                  <Spinner size="small" color={hasContent ? '$color12' : 'white'} />
                ) : hasContent ? (
                  <RefreshCw size={18} color="$color12" />
                ) : (
                  <Sparkles size={20} color="white" />
                )
              }
              disabled={isGenerating}
              onPress={handleGenerate}
              pressStyle={{ scale: 0.97 }}
            >
              {isGenerating
                ? 'Les agents travaillent…'
                : hasContent
                ? 'Régénérer le contenu'
                : 'Lancer les agents IA'}
            </Button>

            {isGenerating ? <AgentProgressList campaignId={campaign.id} /> : null}
          </YStack>

          {hasContent ? (
            <>
              <YStack paddingHorizontal="$5" paddingBottom="$3">
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <BlinkToggleGroup
                    options={[
                      { label: '🎬 Script', value: 'video' },
                      { label: '🎥 Clip', value: 'clips' },
                      { label: '🎦 Long format', value: 'longform' },
                      { label: '💬 Posts', value: 'posts' },
                      { label: '🗓️ Planning', value: 'plan' },
                    ]}
                    value={section}
                    onValueChange={(v) => setSection(v as any)}
                  />
                </ScrollView>
              </YStack>

              <Divider />

              {section === 'video' ? (
                <VideoSection script={script} />
              ) : section === 'clips' ? (
                <AIClipsSection campaign={campaign} script={script || null} />
              ) : section === 'longform' ? (
                <LongFormVideoSection campaign={campaign} script={script || null} />
              ) : section === 'posts' ? (
                <PostsSection posts={posts || []} />
              ) : (
                <CampaignPlanSection campaign={campaign} />
              )}
            </>
          ) : !isGenerating ? (
            <YStack padding="$5" alignItems="center" gap="$3">
              <Sparkles size={48} color="$color9" />
              <H4 color="$color12" textAlign="center">Lance la génération</H4>
              <Paragraph size="$3" color="$color10" textAlign="center">
                Les 6 agents IA vont produire en parallèle un script vidéo, une voix off et 4 posts adaptés à chaque réseau social.
              </Paragraph>
            </YStack>
          ) : null}
        </ScrollView>
      </YStack>
    </SafeAreaView>
  );
}

const AGENT_ITEMS: { key: AgentStepKey; label: string }[] = [
  { key: 'script', label: '🎬 Agent scénariste' },
  { key: 'script', label: '🗣️ Agent voix off' },
  { key: 'instagram', label: '📷 Agent Instagram' },
  { key: 'x', label: '𝕏 Agent X' },
  { key: 'facebook', label: '👍 Agent Facebook' },
  { key: 'linkedin', label: '💼 Agent LinkedIn' },
];

function AgentProgressList({ campaignId }: { campaignId: string }) {
  const trackedId = useGenerationStore((s) => s.campaignId);
  const steps = useGenerationStore((s) => s.steps);

  // When the store tracks THIS campaign we show real per-agent state. Otherwise
  // (page reloaded, or a run started elsewhere) we fall back to "running" since
  // the persisted status === 'generating' is what brought us here.
  const tracking = trackedId === campaignId;
  const stateFor = (key: AgentStepKey): AgentStepState => (tracking ? steps[key] : 'running');

  const done = AGENT_ITEMS.filter((it) => stateFor(it.key) === 'done').length;

  return (
    <YStack
      backgroundColor="$color2"
      borderRadius="$4"
      padding="$3"
      gap="$2"
      borderWidth={1}
      borderColor="$color4"
    >
      <XStack justifyContent="space-between" alignItems="center" paddingBottom="$1">
        <SizableText size="$2" color="$color12" fontWeight="700">
          Les agents travaillent…
        </SizableText>
        <SizableText size="$2" color="$color10">
          {done}/{AGENT_ITEMS.length}
        </SizableText>
      </XStack>
      {AGENT_ITEMS.map((it, i) => (
        <AgentStatus key={i} label={it.label} state={stateFor(it.key)} />
      ))}
    </YStack>
  );
}

function AgentStatus({ label, state }: { label: string; state: AgentStepState }) {
  return (
    <XStack alignItems="center" gap="$2">
      {state === 'done' ? (
        <Check size={16} color="#22C55E" />
      ) : state === 'failed' ? (
        <AlertCircle size={16} color="#EF4444" />
      ) : state === 'running' ? (
        <Spinner size="small" color="$accent10" />
      ) : (
        <SizableText size="$3" color="$color8">◦</SizableText>
      )}
      <SizableText
        size="$2"
        color={state === 'done' ? '$color12' : state === 'failed' ? '$red10' : '$color11'}
      >
        {label}
      </SizableText>
    </XStack>
  );
}

function VideoSection({ script }: { script: any }) {
  if (!script) {
    return (
      <YStack padding="$5" alignItems="center">
        <SizableText size="$3" color="$color10">Pas encore de script généré.</SizableText>
      </YStack>
    );
  }
  return (
    <YStack padding="$5" gap="$4">
      <ContentBlock title="🎯 Hook (3 premières secondes)" content={script.hook} />
      <ContentBlock title="🎬 Storyboard" content={script.storyboard} />
      <ContentBlock
        title="🗣️ Voix off"
        content={script.voiceover}
        meta={`${script.duration_sec || 30}s • ${(script.voiceover || '').split(/\s+/).length} mots`}
      />
      <ContentBlock title="📣 Call to action" content={script.cta} />
    </YStack>
  );
}

function PostsSection({ posts }: { posts: SocialPost[] }) {
  const platforms: Platform[] = ['instagram', 'x', 'facebook', 'linkedin'];
  const byPlatform = posts.reduce((acc, p) => {
    acc[p.platform] = p;
    return acc;
  }, {} as Partial<Record<Platform, SocialPost>>);

  return (
    <YStack padding="$5" gap="$4">
      {platforms.map((p) => {
        const post = byPlatform[p];
        const meta = PLATFORM_META[p];
        return (
          <Card
            key={p}
            backgroundColor="$color2"
            borderColor="$color4"
            borderWidth={1}
            padding="$4"
          >
            <YStack gap="$3">
              <XStack justifyContent="space-between" alignItems="center">
                <XStack alignItems="center" gap="$2">
                  <SizableText size="$5">{meta.emoji}</SizableText>
                  <SizableText size="$5" fontWeight="700" color="$color12">{meta.label}</SizableText>
                </XStack>
                {post ? (
                  <SizableText size="$1" color="$color10">
                    {post.content.length}{meta.charLimit ? `/${meta.charLimit}` : ''} car.
                  </SizableText>
                ) : null}
              </XStack>

              {post ? (
                <>
                  <SizableText size="$3" color="$color12" lineHeight="$3">
                    {post.content}
                  </SizableText>
                  {post.hashtags ? (
                    <SizableText size="$2" color="$accent10">
                      {post.hashtags}
                    </SizableText>
                  ) : null}
                  <XStack gap="$2">
                    <Button
                      flex={1}
                      size="$3"
                      icon={<Copy size={14} />}
                      onPress={async () => {
                        const text = post.hashtags
                          ? `${post.content}\n\n${post.hashtags}`
                          : post.content;
                        await Clipboard.setStringAsync(text);
                        toast('Copié !', { message: `Post ${meta.label} prêt à coller.`, variant: 'success' });
                      }}
                    >
                      Copier
                    </Button>
                  </XStack>
                </>
              ) : (
                <SizableText size="$2" color="$color10">Pas encore généré.</SizableText>
              )}
            </YStack>
          </Card>
        );
      })}
    </YStack>
  );
}

function ContentBlock({
  title,
  content,
  meta,
}: {
  title: string;
  content?: string;
  meta?: string;
}) {
  if (!content) return null;
  return (
    <Card backgroundColor="$color2" borderColor="$color4" borderWidth={1} padding="$4">
      <YStack gap="$2">
        <XStack justifyContent="space-between" alignItems="center">
          <SizableText size="$4" fontWeight="700" color="$color12">
            {title}
          </SizableText>
          <Button
            size="$2"
            chromeless
            icon={<Copy size={14} />}
            onPress={async () => {
              await Clipboard.setStringAsync(content);
              toast('Copié !', { variant: 'success' });
            }}
          >
            Copier
          </Button>
        </XStack>
        <SizableText size="$3" color="$color12" lineHeight="$3">{content}</SizableText>
        {meta ? <SizableText size="$2" color="$color10">{meta}</SizableText> : null}
      </YStack>
    </Card>
  );
}
