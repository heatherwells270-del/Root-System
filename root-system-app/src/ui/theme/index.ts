// ═══════════════════════════════════════════════════════════════════════════
// ROOTS — Design Tokens
// Light, grounded, plain. Cream background. Forest green. No gold, no black.
// ═══════════════════════════════════════════════════════════════════════════

export const Colors = {
  // ── Core palette ──────────────────────────────────────────────────────────
  background:  '#F5F2EB',   // cream — always the app background
  surface:     '#FFFFFF',   // white — card / panel background
  surfaceAlt:  '#F0EDE6',   // slightly deeper cream — alt sections

  // Forest greens
  primary:     '#2D4A3E',   // forest green — main brand color, buttons, nav
  primaryMid:  '#3D6456',   // mid green — secondary actions, active states
  primaryLight:'#EBF0ED',   // very light green tint — tags, chips, badges

  // Dusk purple
  secondary:   '#5B4B6E',   // dusk purple — accent, links, highlights
  secondaryLight: '#EDE9F3',// light purple tint — tag backgrounds

  // Text
  text:        '#1A2E27',   // near-black green — primary body text
  textMid:     '#2D4A3E',   // forest green — headings
  textMuted:   '#5A6B62',   // muted green — captions, labels, placeholders
  textOnDark:  '#F5F2EB',   // cream — text on green / dark backgrounds

  // Borders
  border:      'rgba(45,74,62,0.12)',  // subtle green border
  borderMid:   'rgba(45,74,62,0.25)', // medium green border

  // Status
  error:       '#A63D3D',   // muted red — errors, warnings
  warning:     '#C4873B',   // amber — warnings, pending states
  success:     '#2D7A45',   // mid green — success states

  // ── Backward-compat aliases (screens updated progressively) ───────────────
  // These old names are preserved so unchanged screens don't crash.
  // Each maps to the closest equivalent in the new palette.

  // Old greens → primary / primaryMid
  greenDeep:   '#2D4A3E',   // was dark green; now = primary
  greenMid:    '#3D6456',   // → primaryMid
  greenLeaf:   '#3D6456',   // → primaryMid
  greenAccent: '#5A6B62',   // → textMuted
  sage:        '#5A6B62',   // → textMuted

  // Old earths / browns → text / textMuted
  brown:       '#1A2E27',   // → text
  earth:       '#5A6B62',   // → textMuted
  terracotta:  '#A63D3D',   // → error

  // Old golds → primary (GOLD IS BANNED — maps to forest green)
  gold:        '#2D4A3E',   // → primary
  goldLight:   '#3D6456',   // → primaryMid
  amber:       '#C4873B',   // → warning

  // Old reds → error
  wine:        '#A63D3D',   // → error
  redAccent:   '#A63D3D',   // → error

  // Old neutrals
  ink:         '#1A2E27',   // → text
  inkMid:      '#2D4A3E',   // → textMid
  dim:         '#5A6B62',   // → textMuted
  moonsilver:  '#5A6B62',   // → textMuted
  cream:       '#F5F2EB',   // → background (NOTE: was used as text-on-dark — fix in each screen)
  warmWhite:   '#FFFFFF',   // → surface

  // Old functional
  warnAmber:   '#C4873B',   // → warning
  mauve:       '#5B4B6E',   // → secondary
  teal:        '#3D6456',   // → primaryMid
};

export const Typography = {
  // ── Font families ─────────────────────────────────────────────────────────
  // System fonts — no external font loading required.
  // iOS: Georgia (serif) / SF Pro (sans-serif)
  // Android: Noto Serif (serif) / Roboto (sans-serif)
  //
  // When using serif/serifBold/serifItalic in StyleSheet:
  //   fontFamily: Typography.serif, fontWeight: 'bold' (for serifBold)
  //   fontFamily: Typography.serif, fontStyle: 'italic' (for serifItalic)
  // When using bodySemi:
  //   fontFamily: Typography.body, fontWeight: '600'

  serif:       'serif',          // Georgia / Noto Serif
  serifItalic: 'serif',          // + fontStyle: 'italic' in StyleSheet
  serifBold:   'serif',          // + fontWeight: 'bold' in StyleSheet
  body:        'sans-serif',     // Roboto / SF Pro
  bodyItalic:  'sans-serif',     // + fontStyle: 'italic' in StyleSheet
  bodySemi:    'sans-serif',     // + fontWeight: '600' in StyleSheet

  // ── Sizes ─────────────────────────────────────────────────────────────────
  xs:   11,
  sm:   13,
  base: 16,
  md:   18,
  lg:   22,
  xl:   28,
  xxl:  36,
  hero: 48,
};

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
};

export const Radius = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 999,
};

// Shadow for cards on cream background
export const CardShadow = {
  shadowColor: '#1A2E27',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.08,
  shadowRadius: 3,
  elevation: 2,
};
