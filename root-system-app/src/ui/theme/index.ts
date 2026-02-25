// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Design Tokens
// Same aesthetic as the web app. Ported to React Native.
// ═══════════════════════════════════════════════════════════════════════════

export const Colors = {
  // Greens
  greenDeep:   '#2D5016',
  greenMid:    '#4A7C2E',
  greenLeaf:   '#6B9B4A',
  greenAccent: '#8FBF6A',
  sage:        '#5C7A3E',

  // Earths
  brown:       '#6B4226',
  earth:       '#8B6340',
  terracotta:  '#B85C38',

  // Golds
  gold:        '#C4982E',
  goldLight:   '#D4AA50',
  amber:       '#E8C547',

  // Reds
  wine:        '#8A2535',
  redAccent:   '#C44455',

  // Neutrals
  ink:         '#2A1F14',
  inkMid:      '#5C4A35',
  dim:         '#8B7355',
  moonsilver:  '#C8B99A',
  cream:       '#F5F0E8',
  warmWhite:   '#FFF8F0',

  // Functional
  background:  '#1A1208',   // deep dark background (app is dark-themed)
  surface:     '#2A1F14',   // card / panel background
  surfaceAlt:  '#1F1A0E',   // slightly deeper surface
  border:      'rgba(196,152,46,0.15)',
  borderMid:   'rgba(196,152,46,0.3)',

  // Status
  warnAmber:   '#D4882E',
  mauve:       '#8B6080',
  teal:        '#3A7A6A',
};

export const Typography = {
  // Font families — loaded via expo-font
  serif:       'CormorantGaramond-Regular',
  serifItalic: 'CormorantGaramond-Italic',
  serifBold:   'CormorantGaramond-Bold',
  body:        'CrimsonText-Regular',
  bodyItalic:  'CrimsonText-Italic',
  bodySemi:    'CrimsonText-SemiBold',

  // Sizes
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
  sm: 3,
  md: 6,
  lg: 12,
  full: 999,
};

// Common shadow for cards
export const CardShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.3,
  shadowRadius: 4,
  elevation: 4,
};
