import { useRouter } from 'expo-router';
import {
  YStack,
  XStack,
  ScrollView,
  SizableText,
  H2,
  Paragraph,
  Spinner,
  FloatingActionButton,
  EmptyState,
  Plus,
  Sparkles,
  Zap,
  Megaphone,
} from '@/components/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCampaigns } from '@/lib/hooks';
import { CampaignCard } from '@/components/CampaignCard';

export default function Home() {
  const router = useRouter();
  const { data: campaigns, isLoading } = useCampaigns();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0E0E1A' }} edges={['top']}>
      <YStack flex={1} backgroundColor="$color1">
        {/* Header */}
        <YStack paddingHorizontal="$5" paddingTop="$3" paddingBottom="$4" gap="$2">
          <XStack alignItems="center" gap="$2">
            <Megaphone size={22} color="#FF4D8F" />
            <SizableText size="$3" color="$color10" fontWeight="600" letterSpacing={1}>
              AUTOPROMO AGENT SUITE
            </SizableText>
          </XStack>
          <H2 color="$color12" lineHeight="$8">Campagnes</H2>
          <Paragraph size="$3" color="$color10">
            Génère vidéo + posts pour Instagram, X, Facebook et LinkedIn en un clic.
          </Paragraph>

          {/* Stats Row */}
          <XStack gap="$3" marginTop="$3">
            <StatPill icon={<Sparkles size={14} color="#FF4D8F" />} label="Agents IA" value="5" />
            <StatPill icon={<Zap size={14} color="#7C5CFF" />} label="Réseaux" value="4" />
            <StatPill label="Campagnes" value={String(campaigns?.length ?? 0)} />
          </XStack>
        </YStack>

        {/* Content */}
        {isLoading ? (
          <YStack flex={1} justifyContent="center" alignItems="center" gap="$3">
            <Spinner size="large" color="$color9" />
            <SizableText size="$3" color="$color10">Chargement des campagnes…</SizableText>
          </YStack>
        ) : !campaigns?.length ? (
          <YStack flex={1} justifyContent="center" padding="$5">
            <EmptyState
              icon={<Megaphone size={48} color="#FF4D8F" />}
              title="Aucune campagne"
              description="Crée ta première campagne pour générer automatiquement script vidéo, voix off et posts sociaux."
              actionLabel="Nouvelle campagne"
              onAction={() => router.push('/new')}
            />
          </YStack>
        ) : (
          <ScrollView
            flex={1}
            contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 12 }}
          >
            {campaigns.map((c: import('@/lib/types').Campaign) => (
              <CampaignCard
                key={c.id}
                id={c.id}
                product_name={c.product_name}
                pitch={c.pitch}
                status={c.status}
                created_at={c.created_at}
              />
            ))}
          </ScrollView>
        )}

        <FloatingActionButton
          icon={<Plus size={24} color="white" />}
          onPress={() => router.push('/new')}
          position="bottom-right"
          size="lg"
        />
      </YStack>
    </SafeAreaView>
  );
}

function StatPill({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <XStack
      backgroundColor="$color3"
      paddingHorizontal="$3"
      paddingVertical="$2"
      borderRadius="$3"
      alignItems="center"
      gap="$2"
      borderWidth={1}
      borderColor="$color4"
    >
      {icon}
      <SizableText size="$4" fontWeight="700" color="$color12">
        {value}
      </SizableText>
      <SizableText size="$2" color="$color10">
        {label}
      </SizableText>
    </XStack>
  );
}
