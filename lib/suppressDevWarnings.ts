/**
 * Dev-only suppression of known, harmless React DOM warnings emitted by the
 * Tamagui components on react-native-web.
 *
 * These props (`zIndex`, `elevate`, `bordered`) are forwarded to the DOM by
 * Tamagui's internal components, not by our own code, and React only warns about
 * them in development. The matching below is intentionally narrow so that real
 * warnings are never hidden.
 */
if (__DEV__ && typeof console !== 'undefined') {
  // React DOM warnings leaked by the pre-compiled Tamagui UI lib (not our code).
  const IGNORED_DOM: { needle: string; props: string[] }[] = [
    { needle: 'does not recognize the', props: ['zIndex'] },
    { needle: 'for a non-boolean attribute', props: ['elevate', 'bordered'] },
  ];

  // Plain-substring messages that are benign in this app.
  const IGNORED_MESSAGES: string[] = [];

  const matches = (args: unknown[]): boolean => {
    const format = typeof args[0] === 'string' ? args[0] : '';
    const interpolated = args.slice(1).map((a) => String(a)).join(' ');
    if (IGNORED_MESSAGES.some((m) => format.includes(m) || interpolated.includes(m))) return true;
    return IGNORED_DOM.some(
      (rule) => format.includes(rule.needle) && rule.props.some((p) => interpolated.includes(p))
    );
  };

  if (typeof console.error === 'function') {
    const originalError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      if (matches(args)) return;
      originalError(...args);
    };
  }

  if (typeof console.warn === 'function') {
    const originalWarn = console.warn.bind(console);
    console.warn = (...args: unknown[]) => {
      if (matches(args)) return;
      originalWarn(...args);
    };
  }
}

export {};
