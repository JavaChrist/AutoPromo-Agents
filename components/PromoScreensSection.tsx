import { useState } from 'react';
import { Linking, Image } from 'react-native';
import {
  YStack,
  XStack,
  Card,
  SizableText,
  Paragraph,
  Button,
  Label,
  TextArea,
  BlinkSelect,
  Badge,
  Spinner,
  toast,
  Sparkles,
  Wand2,
  Trash2,
  ImagePlus,
  Download,
  X,
  Plus,
  Film,
} from '@/components/ui';
import { VideoClipPlayer } from './VideoClipPlayer';
import {
  useVideoProjects,
  useCreateSlideshowProject,
  useUpdateSlideshowStoryboard,
  useSaveMergedVideo,
  useDeleteMergedVideo,
  useDeleteVideoProject,
} from '@/lib/hooks';
import {
  generateSceneClip,
  generateVoiceover,
  planPromoStoryboard,
  VOICEOVER_VOICES,
  type VoiceoverVoice,
} from '@/lib/agents';
import {
  parseStoryboard,
  newSegmentId,
  buildPromoVideo,
  PROMO_PROJECT_MODEL,
  type PromoStoryboard,
  type PromoSegment,
  type PromoRenderSegment,
} from '@/lib/promo';
import { pickAndUploadScreenshot, pickAndUploadAudio } from '@/lib/screenshots';
import { ASPECT_RATIOS, type Campaign, type VideoProject } from '@/lib/types';
import { describeGenerationError } from '@/lib/errors';

const AMBIANCE_MODEL = 'fal-ai/veo3.1/fast';

interface Props {
  campaign: Campaign;
}

export function PromoScreensSection({ campaign }: Props) {
  const { data: allProjects = [] } = useVideoProjects(campaign.id);
  const projects = (allProjects as VideoProject[]).filter((p) => p.model === PROMO_PROJECT_MODEL);
  const createMut = useCreateSlideshowProject();

  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [voice, setVoice] = useState<string>('nova');

  async function handleCreate() {
    try {
      await createMut.mutateAsync({ campaign, aspectRatio, targetDuration: 60, voice });
      toast('Projet créé', { message: 'Génère un scénario puis ajoute tes captures.', variant: 'success' });
    } catch (err: any) {
      toast('Erreur', { message: describeGenerationError(err), variant: 'error' });
    }
  }

  return (
    <YStack padding="$5" gap="$4">
      <Card backgroundColor="$color2" borderColor="$color4" borderWidth={1} padding="$4">
        <YStack gap="$3">
          <XStack alignItems="center" gap="$2">
            <Film size={20} color="#7C5CFF" />
            <SizableText size="$5" fontWeight="700" color="$color12">
              Nouvelle promo écrans
            </SizableText>
          </XStack>
          <Paragraph size="$2" color="$color10">
            Une vidéo narrative : de courtes scènes d'ambiance (IA ou tes médias) alternées avec tes
            VRAIS écrans qui défilent (scroll + zoom), voix off et musique. Aucun texte incrusté.
          </Paragraph>

          <YStack gap="$2">
            <Label color="$color12" fontWeight="600">Format</Label>
            <BlinkSelect items={ASPECT_RATIOS} value={aspectRatio} onValueChange={setAspectRatio} placeholder="Format" />
          </YStack>
          <YStack gap="$2">
            <Label color="$color12" fontWeight="600">Voix off</Label>
            <BlinkSelect
              items={VOICEOVER_VOICES.map((v) => ({ label: v.label, value: v.value }))}
              value={voice}
              onValueChange={setVoice}
              placeholder="Voix"
            />
          </YStack>

          <Button
            size="$5"
            backgroundColor="#7C5CFF"
            color="white"
            fontWeight="700"
            icon={createMut.isPending ? <Spinner size="small" color="white" /> : <Plus size={18} color="white" />}
            disabled={createMut.isPending}
            onPress={handleCreate}
            pressStyle={{ scale: 0.97 }}
          >
            {createMut.isPending ? 'Création…' : 'Créer une promo écrans'}
          </Button>
        </YStack>
      </Card>

      {projects.map((p) => (
        <PromoProjectCard key={p.id} project={p} campaign={campaign} />
      ))}
    </YStack>
  );
}

function PromoProjectCard({ project, campaign }: { project: VideoProject; campaign: Campaign }) {
  const updateMut = useUpdateSlideshowStoryboard();
  const saveMergedMut = useSaveMergedVideo();
  const deleteMergedMut = useDeleteMergedVideo();
  const deleteProjectMut = useDeleteVideoProject();

  const [sb, setSb] = useState<PromoStoryboard>(() => parseStoryboard(project.voiceover_full));
  const [planning, setPlanning] = useState(false);
  const [busySeg, setBusySeg] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeStep, setMergeStep] = useState<string | null>(null);
  const [mergedUrl, setMergedUrl] = useState<string | null>(project.merged_url || null);
  const [numSegments, setNumSegments] = useState('5');

  async function persist(next: PromoStoryboard) {
    setSb(next);
    try {
      await updateMut.mutateAsync({ projectId: project.id, campaignId: project.campaign_id, storyboard: next });
    } catch (err: any) {
      toast('Sauvegarde impossible', { message: describeGenerationError(err), variant: 'error' });
    }
  }

  function patchSegment(id: string, patch: Partial<PromoSegment>): PromoStoryboard {
    return { ...sb, segments: sb.segments.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
  }

  async function handlePlan() {
    setPlanning(true);
    try {
      const n = Math.max(2, Math.min(10, Number(numSegments) || 5));
      const plan = await planPromoStoryboard(campaign, { numSegments: n });
      const segments: PromoSegment[] = plan.map((p) => ({
        id: newSegmentId(),
        type: p.type,
        voice: p.voice,
        prompt: p.type === 'ambiance' ? p.prompt : undefined,
        shots: p.type === 'app_demo' ? [] : undefined,
        clipStatus: p.type === 'ambiance' ? 'idle' : undefined,
      }));
      await persist({ ...sb, segments });
      toast('Scénario généré', { message: 'Ajuste les répliques et ajoute tes captures.', variant: 'success' });
    } catch (err: any) {
      toast('Scénario impossible', { message: describeGenerationError(err), variant: 'error' });
    } finally {
      setPlanning(false);
    }
  }

  function addSegment(type: PromoSegment['type']) {
    const seg: PromoSegment = {
      id: newSegmentId(),
      type,
      voice: '',
      shots: type === 'app_demo' ? [] : undefined,
      clipStatus: type === 'ambiance' ? 'idle' : undefined,
    };
    void persist({ ...sb, segments: [...sb.segments, seg] });
  }

  function removeSegment(id: string) {
    void persist({ ...sb, segments: sb.segments.filter((s) => s.id !== id) });
  }

  function moveSegment(id: string, dir: -1 | 1) {
    const idx = sb.segments.findIndex((s) => s.id === id);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= sb.segments.length) return;
    const segments = [...sb.segments];
    [segments[idx], segments[to]] = [segments[to], segments[idx]];
    void persist({ ...sb, segments });
  }

  async function generateAmbiance(seg: PromoSegment) {
    if (!seg.prompt?.trim()) {
      toast('Décris la scène', { message: "Ajoute une description d'ambiance avant de générer.", variant: 'error' });
      return;
    }
    setBusySeg(seg.id);
    setSb((prev) => ({ ...prev, segments: prev.segments.map((s) => (s.id === seg.id ? { ...s, clipStatus: 'generating', clipError: undefined } : s)) }));
    try {
      const url = await generateSceneClip(seg.prompt, {
        model: AMBIANCE_MODEL,
        aspect_ratio: project.aspect_ratio,
        duration: '8s',
      });
      await persist(patchSegment(seg.id, { mediaUrl: url, mediaKind: 'ai', clipStatus: 'ready', clipError: undefined }));
    } catch (err: any) {
      await persist(patchSegment(seg.id, { clipStatus: 'failed', clipError: describeGenerationError(err) }));
      toast('Génération impossible', { message: describeGenerationError(err), variant: 'error' });
    } finally {
      setBusySeg(null);
    }
  }

  async function importAmbianceImage(seg: PromoSegment) {
    setBusySeg(seg.id);
    try {
      const url = await pickAndUploadScreenshot(project.id);
      if (url) await persist(patchSegment(seg.id, { mediaUrl: url, mediaKind: 'image', clipStatus: 'ready', clipError: undefined }));
    } catch (err: any) {
      toast('Import impossible', { message: describeGenerationError(err), variant: 'error' });
    } finally {
      setBusySeg(null);
    }
  }

  async function addShot(seg: PromoSegment) {
    setBusySeg(seg.id);
    try {
      const url = await pickAndUploadScreenshot(project.id);
      if (url) await persist(patchSegment(seg.id, { shots: [...(seg.shots || []), url] }));
    } catch (err: any) {
      toast('Import impossible', { message: describeGenerationError(err), variant: 'error' });
    } finally {
      setBusySeg(null);
    }
  }

  function removeShot(seg: PromoSegment, i: number) {
    void persist(patchSegment(seg.id, { shots: (seg.shots || []).filter((_, j) => j !== i) }));
  }

  async function importMusic() {
    try {
      const url = await pickAndUploadAudio();
      if (url) await persist({ ...sb, musicUrl: url });
      if (url) toast('Musique ajoutée', { variant: 'success' });
    } catch (err: any) {
      toast('Import musique impossible', { message: describeGenerationError(err), variant: 'error' });
    }
  }

  function validate(): string | null {
    if (sb.segments.length === 0) return 'Ajoute au moins un segment.';
    for (let i = 0; i < sb.segments.length; i++) {
      const s = sb.segments[i];
      if (s.type === 'ambiance' && !s.mediaUrl) return `Segment ${i + 1} (ambiance) : génère un plan IA ou importe une image.`;
      if (s.type === 'app_demo' && (!s.shots || s.shots.length === 0)) return `Segment ${i + 1} (démo) : ajoute au moins une capture.`;
    }
    return null;
  }

  async function handleAssemble() {
    const err = validate();
    if (err) {
      toast('Storyboard incomplet', { message: err, variant: 'error' });
      return;
    }
    setMerging(true);
    try {
      const render: PromoRenderSegment[] = [];
      for (let i = 0; i < sb.segments.length; i++) {
        const s = sb.segments[i];
        setMergeStep(`🎙️ Voix off ${i + 1}/${sb.segments.length}…`);
        let audioUrl: string | undefined;
        if (s.voice?.trim()) {
          audioUrl = await generateVoiceover(s.voice.trim(), (sb.voice || 'nova') as VoiceoverVoice);
        }
        render.push({
          type: s.type,
          audioUrl,
          videoUrl: s.type === 'ambiance' && s.mediaKind !== 'image' ? s.mediaUrl : undefined,
          imageUrl: s.type === 'ambiance' && s.mediaKind === 'image' ? s.mediaUrl : undefined,
          shots: s.type === 'app_demo' ? s.shots : undefined,
        });
      }
      setMergeStep('🎬 Montage de la vidéo…');
      const { url } = await buildPromoVideo(render, {
        aspectRatio: project.aspect_ratio,
        fileName: campaign.product_name,
        musicUrl: sb.musicUrl,
      });
      setMergedUrl(url);
      try {
        await saveMergedMut.mutateAsync({ projectId: project.id, campaignId: project.campaign_id, mergedUrl: url });
      } catch {
        toast('Montage non enregistré', { message: 'La vidéo est prête mais son enregistrement a échoué.', variant: 'error' });
      }
      toast('Vidéo prête !', { message: 'Ta promo est assemblée.', variant: 'success' });
    } catch (err: any) {
      toast('Montage impossible', { message: describeGenerationError(err), variant: 'error' });
    } finally {
      setMerging(false);
      setMergeStep(null);
    }
  }

  async function handleDeleteMerged() {
    if (typeof window !== 'undefined' && !window.confirm('Supprimer la vidéo montée ?')) return;
    try {
      await deleteMergedMut.mutateAsync({ projectId: project.id, campaignId: project.campaign_id, mergedUrl });
      setMergedUrl(null);
      toast('Vidéo supprimée', { variant: 'success' });
    } catch (err: any) {
      toast('Suppression impossible', { message: describeGenerationError(err), variant: 'error' });
    }
  }

  async function handleDeleteProject() {
    if (typeof window !== 'undefined' && !window.confirm(`Supprimer le projet « ${project.title} » ?`)) return;
    try {
      await deleteProjectMut.mutateAsync({ id: project.id, campaignId: project.campaign_id });
      toast('Projet supprimé', { variant: 'success' });
    } catch (err: any) {
      toast('Suppression impossible', { message: describeGenerationError(err), variant: 'error' });
    }
  }

  return (
    <Card backgroundColor="$color2" borderColor="$color4" borderWidth={1} padding="$3">
      <YStack gap="$3">
        <XStack justifyContent="space-between" alignItems="center">
          <YStack flex={1} gap="$1">
            <SizableText size="$5" fontWeight="700" color="$color12">{project.title}</SizableText>
            <SizableText size="$2" color="$color10">
              {project.aspect_ratio} • {sb.segments.length} segment(s)
            </SizableText>
          </YStack>
          <Button chromeless size="$2" icon={<Trash2 size={16} color="$red10" />} onPress={handleDeleteProject} />
        </XStack>

        {/* Scénario IA */}
        <YStack gap="$2" backgroundColor="$color3" borderRadius="$3" padding="$3" borderWidth={1} borderColor="$color4">
          <Label color="$color12" fontWeight="600">🎬 Scénario</Label>
          <XStack gap="$2" alignItems="center">
            <YStack width={130}>
              <BlinkSelect
                items={[3, 4, 5, 6, 7, 8].map((n) => ({ label: `${n} segments`, value: String(n) }))}
                value={numSegments}
                onValueChange={setNumSegments}
                placeholder="Segments"
              />
            </YStack>
            <Button
              flex={1}
              size="$3"
              icon={planning ? <Spinner size="small" /> : <Wand2 size={14} />}
              disabled={planning}
              onPress={handlePlan}
            >
              {planning ? 'Génération…' : sb.segments.length ? 'Regénérer le scénario' : 'Générer un scénario (IA)'}
            </Button>
          </XStack>
        </YStack>

        {/* Segments */}
        {sb.segments.map((seg, idx) => (
          <SegmentRow
            key={seg.id}
            seg={seg}
            index={idx}
            total={sb.segments.length}
            aspectRatio={project.aspect_ratio}
            busy={busySeg === seg.id}
            onChangeVoice={(v) => setSb((prev) => ({ ...prev, segments: prev.segments.map((s) => (s.id === seg.id ? { ...s, voice: v } : s)) }))}
            onChangePrompt={(v) => setSb((prev) => ({ ...prev, segments: prev.segments.map((s) => (s.id === seg.id ? { ...s, prompt: v } : s)) }))}
            onSave={() => persist(sb)}
            onGenerateAmbiance={() => generateAmbiance(seg)}
            onImportImage={() => importAmbianceImage(seg)}
            onAddShot={() => addShot(seg)}
            onRemoveShot={(i) => removeShot(seg, i)}
            onMove={(dir) => moveSegment(seg.id, dir)}
            onRemove={() => removeSegment(seg.id)}
          />
        ))}

        <XStack gap="$2">
          <Button flex={1} size="$3" icon={<Plus size={14} />} onPress={() => addSegment('ambiance')}>
            + Ambiance
          </Button>
          <Button flex={1} size="$3" icon={<Plus size={14} />} onPress={() => addSegment('app_demo')}>
            + Démo écrans
          </Button>
        </XStack>

        {/* Musique */}
        <XStack gap="$2" alignItems="center" backgroundColor="$color3" borderRadius="$3" padding="$3" borderWidth={1} borderColor="$color4">
          <SizableText size="$2" color="$color12" fontWeight="600" flex={1}>
            🎵 Musique de fond {sb.musicUrl ? '(ajoutée)' : '(aucune)'}
          </SizableText>
          <Button size="$2" icon={<ImagePlus size={12} />} onPress={importMusic}>
            {sb.musicUrl ? 'Changer' : 'Importer un MP3'}
          </Button>
          {sb.musicUrl ? (
            <Button size="$2" chromeless icon={<X size={12} color="$red10" />} onPress={() => persist({ ...sb, musicUrl: undefined })} />
          ) : null}
        </XStack>

        {/* Assembler */}
        <Button
          size="$5"
          backgroundColor={merging ? '$color3' : '#FF4D8F'}
          color={merging ? '$color12' : 'white'}
          fontWeight="700"
          icon={merging ? <Spinner size="small" color="$color12" /> : <Sparkles size={18} color="white" />}
          disabled={merging}
          onPress={handleAssemble}
          pressStyle={{ scale: 0.97 }}
        >
          {merging ? mergeStep || 'Montage…' : 'Assembler la vidéo'}
        </Button>
        <SizableText size="$1" color="$color10">
          ⚙️ Montage réalisé côté serveur (disponible sur la version déployée).
        </SizableText>

        {/* Vidéo finale */}
        {mergedUrl && (
          <YStack gap="$2" backgroundColor="$color2" borderRadius="$3" padding="$3" borderWidth={1} borderColor="$green6">
            <SizableText size="$2" color="$color12" fontWeight="700">✅ Vidéo assemblée</SizableText>
            <VideoClipPlayer url={mergedUrl} aspectRatio={project.aspect_ratio} />
            <XStack gap="$2">
              <Button flex={1} size="$3" icon={<Download size={14} />} onPress={() => mergedUrl && Linking.openURL(mergedUrl)}>
                Télécharger
              </Button>
              <Button
                flex={1}
                size="$3"
                chromeless
                icon={deleteMergedMut.isPending ? <Spinner size="small" /> : <Trash2 size={14} color="$red10" />}
                disabled={deleteMergedMut.isPending}
                onPress={handleDeleteMerged}
              >
                Supprimer
              </Button>
            </XStack>
          </YStack>
        )}
      </YStack>
    </Card>
  );
}

function SegmentRow({
  seg,
  index,
  total,
  aspectRatio,
  busy,
  onChangeVoice,
  onChangePrompt,
  onSave,
  onGenerateAmbiance,
  onImportImage,
  onAddShot,
  onRemoveShot,
  onMove,
  onRemove,
}: {
  seg: PromoSegment;
  index: number;
  total: number;
  aspectRatio: string;
  busy: boolean;
  onChangeVoice: (v: string) => void;
  onChangePrompt: (v: string) => void;
  onSave: () => void;
  onGenerateAmbiance: () => void;
  onImportImage: () => void;
  onAddShot: () => void;
  onRemoveShot: (i: number) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const isAmbiance = seg.type === 'ambiance';
  return (
    <YStack backgroundColor="$color3" borderRadius="$3" padding="$3" gap="$2" borderWidth={1} borderColor="$color4">
      <XStack justifyContent="space-between" alignItems="center" gap="$2">
        <XStack alignItems="center" gap="$2" flex={1}>
          <Badge variant={isAmbiance ? 'info' : 'success'}>
            #{index + 1} {isAmbiance ? '🎥 Ambiance' : '📱 Démo écrans'}
          </Badge>
        </XStack>
        <XStack gap="$1">
          <Button size="$2" chromeless disabled={index === 0} opacity={index === 0 ? 0.4 : 1} onPress={() => onMove(-1)}>↑</Button>
          <Button size="$2" chromeless disabled={index === total - 1} opacity={index === total - 1 ? 0.4 : 1} onPress={() => onMove(1)}>↓</Button>
          <Button size="$2" chromeless icon={<X size={14} color="$red10" />} onPress={onRemove} />
        </XStack>
      </XStack>

      {/* Voix off du segment */}
      <Label size="$2" color="$color12" fontWeight="600">🗣️ Voix off (ce segment)</Label>
      <TextArea
        value={seg.voice}
        onChangeText={onChangeVoice}
        onBlur={onSave}
        placeholder="La phrase lue pendant ce segment (en français)…"
        minHeight={70}
        size="$3"
        backgroundColor="$color1"
        color="$color12"
      />

      {isAmbiance ? (
        <YStack gap="$2">
          <Label size="$2" color="$color12" fontWeight="600">🎬 Description de la scène (pour l'IA)</Label>
          <TextArea
            value={seg.prompt || ''}
            onChangeText={onChangePrompt}
            onBlur={onSave}
            placeholder="Ex. Two men chatting next to a car in a sunny street, natural light, slow camera push-in…"
            minHeight={70}
            size="$3"
            backgroundColor="$color1"
            color="$color12"
          />
          <XStack gap="$2">
            <Button
              flex={1}
              size="$3"
              icon={busy && seg.clipStatus === 'generating' ? <Spinner size="small" /> : <Wand2 size={14} />}
              disabled={busy}
              onPress={onGenerateAmbiance}
            >
              {seg.mediaKind === 'ai' && seg.mediaUrl ? 'Regénérer (IA)' : 'Générer le plan (IA)'}
            </Button>
            <Button flex={1} size="$3" icon={busy ? <Spinner size="small" /> : <ImagePlus size={14} />} disabled={busy} onPress={onImportImage}>
              Importer une image
            </Button>
          </XStack>
          {seg.clipStatus === 'failed' && seg.clipError ? (
            <SizableText size="$1" color="$red10">{seg.clipError}</SizableText>
          ) : null}
          {seg.mediaUrl ? (
            seg.mediaKind === 'image' ? (
              <Image source={{ uri: seg.mediaUrl }} style={{ width: '100%', height: 160, borderRadius: 8 }} resizeMode="cover" />
            ) : (
              <VideoClipPlayer url={seg.mediaUrl} aspectRatio={aspectRatio} />
            )
          ) : null}
        </YStack>
      ) : (
        <YStack gap="$2">
          <SizableText size="$1" color="$color10">
            📱 Captures affichées en défilement (scroll + zoom). Astuce : mets le logo en dernier.
          </SizableText>
          <XStack flexWrap="wrap" gap="$2">
            {(seg.shots || []).map((url, i) => (
              <YStack key={i} gap="$1" alignItems="center">
                <Image source={{ uri: url }} style={{ width: 64, height: 110, borderRadius: 6 }} resizeMode="cover" />
                <XStack alignItems="center" gap="$1">
                  <SizableText size="$1" color="$color10">#{i + 1}</SizableText>
                  <Button size="$1" chromeless icon={<X size={10} color="$red10" />} onPress={() => onRemoveShot(i)} />
                </XStack>
              </YStack>
            ))}
          </XStack>
          <Button size="$3" icon={busy ? <Spinner size="small" /> : <ImagePlus size={14} />} disabled={busy} onPress={onAddShot}>
            Ajouter une capture
          </Button>
        </YStack>
      )}
    </YStack>
  );
}
