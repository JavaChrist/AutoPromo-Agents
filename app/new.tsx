import { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  YStack,
  XStack,
  ScrollView,
  H2,
  Paragraph,
  SizableText,
  Input,
  Button,
  Label,
  BlinkSelect,
  AppHeader,
  toast,
  Sparkles,
} from '@/components/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCreateCampaign, useGenerateContent } from '@/lib/hooks';
import { DEMO_USER_ID } from '@/lib/constants';
import { describeGenerationError } from '@/lib/errors';
import type { Campaign } from '@/lib/types';

const TONES = [
  { label: 'Professionnel', value: 'professionnel' },
  { label: 'Convivial', value: 'convivial' },
  { label: 'Motivant', value: 'motivant' },
  { label: 'Apaisant', value: 'apaisant' },
  { label: 'Humoristique', value: 'humoristique' },
];

export default function NewCampaign() {
  const router = useRouter();
  const createMut = useCreateCampaign();
  const generateMut = useGenerateContent();

  const [productName, setProductName] = useState('');
  const [pitch, setPitch] = useState('');
  const [audience, setAudience] = useState('');
  const [url, setUrl] = useState('');
  const [tone, setTone] = useState('professionnel');
  const [busy, setBusy] = useState(false);

  const canSubmit = productName.trim().length > 1 && pitch.trim().length > 10;

  async function handleSubmit(andGenerate: boolean) {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const id = await createMut.mutateAsync({
        product_name: productName.trim(),
        pitch: pitch.trim(),
        target_audience: audience.trim() || undefined,
        product_url: url.trim() || undefined,
        tone,
      });

      if (andGenerate) {
        const campaign: Campaign = {
          id,
          user_id: DEMO_USER_ID,
          product_name: productName.trim(),
          pitch: pitch.trim(),
          target_audience: audience.trim() || undefined,
          product_url: url.trim() || undefined,
          tone,
          status: 'draft',
        };
        // Navigate immediately, generation runs in background
        router.replace(`/campaign/${id}`);
        generateMut.mutate(campaign, {
          onSuccess: () => {
            toast('Campagne prête !', { message: 'Tous les contenus ont été générés.', variant: 'success' });
          },
          onError: (err: any) => {
            toast('Erreur de génération', { message: describeGenerationError(err), variant: 'error' });
          },
        });
      } else {
        router.replace(`/campaign/${id}`);
      }
    } catch (err: any) {
      toast('Erreur', { message: err?.message || 'Impossible de créer la campagne.', variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0E0E1A' }} edges={['top']}>
      <YStack flex={1} backgroundColor="$color1">
        <AppHeader
          title="Nouvelle campagne"
          variant="back"
          onBack={() => router.back()}
        />

        <ScrollView flex={1} contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 20 }}>
          <YStack gap="$2">
            <H2 color="$color12">Parlez-nous de votre PWA</H2>
            <Paragraph size="$3" color="$color10">
              Les agents IA utiliseront ces infos pour générer un script vidéo et 4 posts adaptés à chaque réseau.
            </Paragraph>
          </YStack>

          <YStack gap="$4">
            <Field label="Nom du produit *" hint="Ex: FitTrack, CookMate…">
              <Input
                placeholder="Mon application"
                value={productName}
                onChangeText={setProductName}
                size="$4"
              />
            </Field>

            <Field label="Pitch *" hint="1-2 phrases qui décrivent la valeur de votre PWA">
              <Input
                placeholder="Application qui permet de…"
                value={pitch}
                onChangeText={setPitch}
                multiline
                numberOfLines={4}
                size="$4"
                minHeight={100}
                textAlignVertical="top"
                paddingTop="$3"
              />
            </Field>

            <Field label="Cible" hint="Ex: Sportifs 25-45 ans, Étudiants…">
              <Input
                placeholder="Audience principale"
                value={audience}
                onChangeText={setAudience}
                size="$4"
              />
            </Field>

            <Field label="URL de la PWA" hint="Pour les CTA des posts">
              <Input
                placeholder="https://monapp.com"
                value={url}
                onChangeText={setUrl}
                size="$4"
                autoCapitalize="none"
                keyboardType="url"
              />
            </Field>

            <Field label="Ton de communication">
              <BlinkSelect
                items={TONES}
                value={tone}
                onValueChange={setTone}
                placeholder="Choisir un ton"
              />
            </Field>
          </YStack>

          <YStack gap="$3" marginTop="$4">
            <Button
              size="$5"
              backgroundColor="#FF4D8F"
              color="white"
              fontWeight="700"
              disabled={!canSubmit || busy}
              opacity={!canSubmit || busy ? 0.5 : 1}
              onPress={() => handleSubmit(true)}
              icon={<Sparkles size={20} color="white" />}
              pressStyle={{ scale: 0.97 }}
            >
              {busy ? 'Création…' : 'Créer & Générer le contenu'}
            </Button>

            <Button
              size="$4"
              chromeless
              disabled={!canSubmit || busy}
              opacity={!canSubmit || busy ? 0.5 : 1}
              onPress={() => handleSubmit(false)}
            >
              Créer sans générer
            </Button>
          </YStack>
        </ScrollView>
      </YStack>
    </SafeAreaView>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <YStack gap="$2">
      <Label color="$color12" fontWeight="600">{label}</Label>
      {children}
      {hint ? (
        <SizableText size="$2" color="$color10">
          {hint}
        </SizableText>
      ) : null}
    </YStack>
  );
}
