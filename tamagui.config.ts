import { config } from '@tamagui/config';
import { createTamagui } from 'tamagui';

/**
 * App-wide Tamagui configuration (replaces the config previously provided by
 * `@blinkdotnew/mobile-ui`). Using the official `@tamagui/config` preset gives
 * us the `$color1..$color12` palette, spacing/size tokens and the animation
 * drivers the screens rely on.
 */
export const tamaguiConfig = createTamagui(config);

export type AppTamaguiConfig = typeof tamaguiConfig;

// The `TamaguiCustomConfig` interface is declared in `@tamagui/web`; augmenting
// that exact module is required for declaration merging (so tokens, themes and
// animation keys like `animation="bouncy"` are type-checked across the app).
declare module '@tamagui/web' {
  interface TamaguiCustomConfig extends AppTamaguiConfig {}
}

export default tamaguiConfig;
