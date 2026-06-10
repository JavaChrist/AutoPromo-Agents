/**
 * Local UI kit — drop-in replacement for `@blinkdotnew/mobile-ui`.
 *
 * `mobile-ui` was just a thin wrapper around Tamagui (already a dependency here)
 * plus a handful of custom components. This module re-exports the Tamagui
 * primitives + lucide icons directly and re-implements the custom pieces
 * (Badge, BlinkSelect, AppHeader, toast, FloatingActionButton, EmptyState,
 * Divider, BlinkToggleGroup) so the screens keep working by only swapping the
 * import path.
 */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable } from 'react-native';
import {
  YStack,
  XStack,
  SizableText,
  H4,
  Paragraph,
  Button,
  Separator,
  Circle,
  ScrollView as TGScrollView,
} from 'tamagui';
import { ChevronDown, ChevronLeft, Check } from '@tamagui/lucide-icons';

// ─── Tamagui primitives (re-exported as-is) ──────────────────────────────────
export {
  YStack,
  XStack,
  ScrollView,
  SizableText,
  Text,
  Paragraph,
  H1,
  H2,
  H3,
  H4,
  H5,
  H6,
  Heading,
  Input,
  TextArea,
  Button,
  Label,
  Card,
  Spinner,
  Progress,
  Separator,
  View,
  Circle,
  Square,
  Theme,
  styled,
  createTamagui,
  TamaguiProvider,
  TamaguiProvider as BlinkProvider,
} from 'tamagui';

export { config as tamaguiDefaultConfig } from '@tamagui/config';

// ─── Icons (lucide via Tamagui) ──────────────────────────────────────────────
export * from '@tamagui/lucide-icons';

// ─── Badge ────────────────────────────────────────────────────────────────────
type BadgeVariant = 'default' | 'info' | 'success' | 'error' | 'warning';

const BADGE_COLORS: Record<BadgeVariant, { bg: string; border: string; text: string }> = {
  default: { bg: '#1C1C2A', border: '#33334A', text: '#CFCFE0' },
  info: { bg: '#15233A', border: '#3E6FB0', text: '#9DC2FF' },
  success: { bg: '#10301F', border: '#1E7D4F', text: '#7CF2B0' },
  error: { bg: '#3A1620', border: '#C2415F', text: '#FF9DB4' },
  warning: { bg: '#332714', border: '#B0832E', text: '#FFD79D' },
};

export function Badge({ children, variant = 'default' }: { children: React.ReactNode; variant?: BadgeVariant }) {
  const c = BADGE_COLORS[variant] ?? BADGE_COLORS.default;
  return (
    <XStack
      backgroundColor={c.bg}
      borderColor={c.border}
      borderWidth={1}
      borderRadius={999}
      paddingHorizontal="$2.5"
      paddingVertical="$1"
      alignItems="center"
      alignSelf="flex-start"
    >
      <SizableText size="$1" color={c.text} fontWeight="700">
        {children}
      </SizableText>
    </XStack>
  );
}

// ─── BlinkSelect (modal dropdown — clip-free on web & native) ─────────────────
export interface SelectItem {
  label: string;
  value: string;
}

export function BlinkSelect({
  items,
  value,
  onValueChange,
  placeholder,
}: {
  items: SelectItem[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => i.value === value);

  return (
    <>
      <Pressable onPress={() => setOpen(true)}>
        <XStack
          backgroundColor="$color3"
          borderColor="$color5"
          borderWidth={1}
          borderRadius="$4"
          paddingHorizontal="$3"
          paddingVertical="$3"
          alignItems="center"
          justifyContent="space-between"
          gap="$2"
        >
          <SizableText size="$3" color={selected ? '$color12' : '$color10'} flex={1} numberOfLines={1}>
            {selected ? selected.label : placeholder || 'Choisir…'}
          </SizableText>
          <ChevronDown size={18} color="#8A8AA3" />
        </XStack>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 }}
          onPress={() => setOpen(false)}
        >
          <YStack
            backgroundColor="$color2"
            borderColor="$color5"
            borderWidth={1}
            borderRadius="$5"
            maxHeight={420}
            overflow="hidden"
          >
            <TGScrollView>
              {items.map((it) => {
                const active = it.value === value;
                return (
                  <Pressable
                    key={it.value}
                    onPress={() => {
                      onValueChange(it.value);
                      setOpen(false);
                    }}
                  >
                    <XStack
                      paddingHorizontal="$4"
                      paddingVertical="$3"
                      alignItems="center"
                      justifyContent="space-between"
                      gap="$3"
                      backgroundColor={active ? '$color4' : 'transparent'}
                    >
                      <SizableText size="$3" color="$color12" flex={1}>
                        {it.label}
                      </SizableText>
                      {active ? <Check size={16} color="#7CF2B0" /> : null}
                    </XStack>
                  </Pressable>
                );
              })}
            </TGScrollView>
          </YStack>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── BlinkToggleGroup (segmented control) ─────────────────────────────────────
export function BlinkToggleGroup({
  options,
  value,
  onValueChange,
}: {
  options: SelectItem[];
  value?: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <XStack backgroundColor="$color3" borderRadius="$4" padding="$1" gap="$1" flexWrap="wrap">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onValueChange(o.value)} style={{ flexGrow: 1 }}>
            <YStack
              paddingVertical="$2"
              paddingHorizontal="$3"
              borderRadius="$3"
              alignItems="center"
              backgroundColor={active ? '$color1' : 'transparent'}
            >
              <SizableText size="$2" color={active ? '$color12' : '$color10'} fontWeight={active ? '700' : '500'}>
                {o.label}
              </SizableText>
            </YStack>
          </Pressable>
        );
      })}
    </XStack>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────
export function Divider({ label }: { label?: string }) {
  if (!label) return <Separator borderColor="$color4" />;
  return (
    <XStack alignItems="center" gap="$3">
      <Separator flex={1} borderColor="$color4" />
      <SizableText size="$2" color="$color10">
        {label}
      </SizableText>
      <Separator flex={1} borderColor="$color4" />
    </XStack>
  );
}

// ─── AppHeader ────────────────────────────────────────────────────────────────
export function AppHeader({
  title,
  subtitle,
  variant,
  onBack,
  left,
  right,
}: {
  title?: string;
  subtitle?: string;
  variant?: 'simple' | 'back' | 'profile' | 'centered';
  onBack?: () => void;
  left?: React.ReactNode;
  right?: React.ReactNode;
}) {
  const showBack = variant === 'back' || !!onBack;
  return (
    <XStack
      alignItems="center"
      gap="$3"
      paddingHorizontal="$4"
      paddingVertical="$3"
      borderBottomWidth={1}
      borderColor="$color4"
    >
      {showBack ? (
        <Pressable onPress={onBack} accessibilityLabel="Retour">
          <Circle size={38} backgroundColor="$color3" alignItems="center" justifyContent="center">
            <ChevronLeft size={20} color="#CFCFE0" />
          </Circle>
        </Pressable>
      ) : (
        left ?? null
      )}
      <YStack flex={1}>
        {title ? (
          <SizableText size="$6" fontWeight="700" color="$color12" numberOfLines={1}>
            {title}
          </SizableText>
        ) : null}
        {subtitle ? (
          <SizableText size="$2" color="$color10" numberOfLines={1}>
            {subtitle}
          </SizableText>
        ) : null}
      </YStack>
      {right ?? null}
    </XStack>
  );
}

// ─── FloatingActionButton ─────────────────────────────────────────────────────
export function FloatingActionButton({
  icon,
  label,
  onPress,
  position = 'bottom-right',
  size = 'md',
}: {
  icon?: React.ReactNode;
  label?: string;
  onPress?: () => void;
  position?: 'bottom-right' | 'bottom-left' | 'bottom-center';
  size?: 'sm' | 'md' | 'lg';
}) {
  const dim = size === 'lg' ? 64 : size === 'sm' ? 44 : 56;
  const horizontal =
    position === 'bottom-left'
      ? { left: 20 }
      : position === 'bottom-center'
        ? { alignSelf: 'center' as const }
        : { right: 20 };

  return (
    <YStack position="absolute" bottom={28} zIndex={1000} {...horizontal}>
      <Pressable onPress={onPress} accessibilityLabel={label || 'Action'}>
        <XStack
          height={dim}
          minWidth={dim}
          borderRadius={dim / 2}
          backgroundColor="#FF4D8F"
          alignItems="center"
          justifyContent="center"
          gap="$2"
          paddingHorizontal={label ? 18 : 0}
          shadowColor="#000"
          shadowOpacity={0.35}
          shadowRadius={12}
          shadowOffset={{ width: 0, height: 6 }}
        >
          {icon}
          {label ? (
            <SizableText color="white" fontWeight="700">
              {label}
            </SizableText>
          ) : null}
        </XStack>
      </Pressable>
    </YStack>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <YStack alignItems="center" justifyContent="center" gap="$3" padding="$5">
      {icon}
      <H4 color="$color12" textAlign="center">
        {title}
      </H4>
      {description ? (
        <Paragraph size="$3" color="$color10" textAlign="center" maxWidth={380}>
          {description}
        </Paragraph>
      ) : null}
      {actionLabel && onAction ? (
        <Button marginTop="$2" onPress={onAction} theme="active">
          {actionLabel}
        </Button>
      ) : null}
    </YStack>
  );
}

// ─── Toast ──────────────────────────────────────────────────────────────────
type ToastVariant = 'default' | 'success' | 'error' | 'info' | 'warning';
interface ToastOptions {
  message?: string;
  variant?: ToastVariant;
  duration?: number;
}
interface ToastItem {
  id: number;
  title: string;
  message?: string;
  variant: ToastVariant;
}

const toastListeners = new Set<(item: ToastItem) => void>();

/** Imperative toast — `toast('Titre', { message, variant })`. */
export function toast(title: string, options?: ToastOptions | ToastVariant): void {
  const opts: ToastOptions = typeof options === 'string' ? { variant: options } : options || {};
  const item: ToastItem = {
    id: Date.now() + Math.random(),
    title,
    message: opts.message,
    variant: opts.variant || 'default',
  };
  toastListeners.forEach((l) => l(item));
}

export function BlinkToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener = (item: ToastItem) => {
      setItems((prev) => [...prev, item]);
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== item.id));
      }, 3800);
    };
    toastListeners.add(listener);
    return () => {
      toastListeners.delete(listener);
    };
  }, []);

  return (
    <>
      {children}
      <YStack
        position="absolute"
        top={0}
        left={0}
        right={0}
        paddingTop={52}
        paddingHorizontal="$4"
        gap="$2"
        alignItems="center"
        zIndex={100000}
        pointerEvents="box-none"
      >
        {items.map((item) => {
          const c = BADGE_COLORS[(item.variant === 'default' ? 'default' : item.variant) as BadgeVariant] ?? BADGE_COLORS.default;
          return (
            <YStack
              key={item.id}
              backgroundColor={c.bg}
              borderColor={c.border}
              borderWidth={1}
              borderRadius="$5"
              paddingHorizontal="$4"
              paddingVertical="$3"
              maxWidth={460}
              width="100%"
              gap="$1"
              shadowColor="#000"
              shadowOpacity={0.3}
              shadowRadius={12}
              shadowOffset={{ width: 0, height: 6 }}
            >
              <SizableText size="$4" fontWeight="700" color={c.text}>
                {item.title}
              </SizableText>
              {item.message ? (
                <SizableText size="$2" color="$color12">
                  {item.message}
                </SizableText>
              ) : null}
            </YStack>
          );
        })}
      </YStack>
    </>
  );
}
