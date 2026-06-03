import { Platform, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

interface Props {
  url: string;
  aspectRatio: string; // "9:16" | "16:9" | "1:1"
}

function aspectToNumber(ar: string): number {
  const parts = (ar || '9:16').split(':').map(Number);
  if (parts.length !== 2 || !parts[0] || !parts[1]) return 9 / 16;
  return parts[0] / parts[1];
}

export function VideoClipPlayer({ url, aspectRatio }: Props) {
  const ar = aspectToNumber(aspectRatio);

  // Hooks must run unconditionally; the player is only used on native.
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });

  if (Platform.OS === 'web') {
    return (
      <View style={{ width: '100%', aspectRatio: ar }}>
        {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
        {/* @ts-ignore — video is valid HTML on web */}
        <video
          src={url}
          controls
          playsInline
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 12,
            backgroundColor: '#000',
            display: 'block',
          }}
        />
      </View>
    );
  }

  return (
    <VideoView
      player={player}
      style={{ width: '100%', aspectRatio: ar, borderRadius: 12 }}
      nativeControls
      contentFit="contain"
    />
  );
}
