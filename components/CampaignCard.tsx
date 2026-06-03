import { useRouter } from 'expo-router';
import { Card, YStack, XStack, SizableText, Badge } from '@blinkdotnew/mobile-ui';

interface Props {
  id: string;
  product_name: string;
  pitch: string;
  status: 'draft' | 'generating' | 'ready';
  created_at?: string;
}

function formatRelative(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'));
  const diffMs = Date.now() - date.getTime();
  const diffH = Math.round(diffMs / 36e5);
  if (diffH < 1) return "à l'instant";
  if (diffH < 24) return `il y a ${diffH}h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `il y a ${diffD}j`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

const STATUS_META = {
  draft: { label: 'Brouillon', variant: 'default' as const },
  generating: { label: 'Génération…', variant: 'info' as const },
  ready: { label: 'Prêt', variant: 'success' as const },
};

export function CampaignCard({ id, product_name, pitch, status, created_at }: Props) {
  const router = useRouter();
  const meta = STATUS_META[status] ?? STATUS_META.draft;

  return (
    <Card
      elevation={2}
      borderWidth={1}
      pressStyle={{ scale: 0.98, opacity: 0.9 }}
      onPress={() => router.push(`/campaign/${id}`)}
      backgroundColor="$color2"
      borderColor="$color4"
    >
      <Card.Header padding="$4">
        <YStack gap="$2">
          <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
            <YStack flex={1} gap="$1">
              <SizableText size="$6" fontWeight="700" color="$color12">
                {product_name}
              </SizableText>
              <SizableText size="$2" color="$color10">
                {formatRelative(created_at)}
              </SizableText>
            </YStack>
            <Badge variant={meta.variant}>{meta.label}</Badge>
          </XStack>
          <SizableText size="$3" color="$color11" numberOfLines={2}>
            {pitch}
          </SizableText>
        </YStack>
      </Card.Header>
    </Card>
  );
}
