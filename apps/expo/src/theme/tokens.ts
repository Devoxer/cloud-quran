export type ThemeName = 'light' | 'sepia' | 'dark';

export interface ThemeTokens {
  surface: {
    primary: string;
    secondary: string;
  };
  text: {
    quran: string;
    translation: string;
    ui: string;
  };
  accent: {
    highlight: string;
    audio: string;
    bookmark: string;
  };
  border: string;
  status: {
    error: string;
    errorText: string;
  };
}

export const KFGQPC_FONT_FAMILY = 'KFGQPC HAFS Uthmanic Script';

export type TypographyVariant = keyof typeof typography;

export const typography = {
  quran: {
    fontFamily: KFGQPC_FONT_FAMILY,
    fontSize: 28,
    fontWeight: '400' as const,
    lineHeightMultiplier: 2.0,
  },
  translation: {
    fontFamily: 'serif',
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeightMultiplier: 1.6,
  },
  verseNumber: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '500' as const,
    lineHeightMultiplier: 1.0,
  },
  surahTitleArabic: {
    fontFamily: KFGQPC_FONT_FAMILY,
    fontSize: 22,
    fontWeight: '700' as const,
    lineHeightMultiplier: 1.4,
  },
  surahTitleEnglish: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '500' as const,
    lineHeightMultiplier: 1.4,
  },
  ui: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeightMultiplier: 1.4,
  },
  uiCaption: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeightMultiplier: 1.3,
  },
  transliteration: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '400' as const,
    fontStyle: 'italic' as const,
    lineHeightMultiplier: 1.5,
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
  '5xl': 96,
} as const;

export const animation = {
  fade: 250,
  slide: 300,
  highlight: 150,
  theme: 400,
} as const;

const lightTheme: ThemeTokens = {
  surface: {
    primary: '#FAF8F5',
    secondary: '#F0EDE8',
  },
  text: {
    quran: '#1A1A1A',
    translation: '#4A4A4A',
    ui: '#6B6B6B',
  },
  accent: {
    highlight: '#FFF3CD',
    audio: '#2E7D5A',
    bookmark: '#C9956B',
  },
  border: '#E8E4DF',
  status: {
    error: '#C0392B',
    errorText: '#FFFFFF',
  },
};

const sepiaTheme: ThemeTokens = {
  surface: {
    primary: '#F5E6D3',
    secondary: '#EBD9C4',
  },
  text: {
    quran: '#2C1810',
    translation: '#5C3D2E',
    ui: '#7A5C4A',
  },
  accent: {
    highlight: '#FFE8B0',
    audio: '#2E7D5A',
    bookmark: '#A67B5B',
  },
  border: '#D4C4B0',
  status: {
    error: '#C0392B',
    errorText: '#FFFFFF',
  },
};

const darkTheme: ThemeTokens = {
  surface: {
    primary: '#1C1C1E',
    secondary: '#2C2C2E',
  },
  text: {
    quran: '#E8E0D8',
    translation: '#A89B8E',
    ui: '#8A7D70',
  },
  accent: {
    highlight: '#3D3520',
    audio: '#4CAF7A',
    bookmark: '#C9956B',
  },
  border: '#3A3A3C',
  status: {
    error: '#C0392B',
    errorText: '#FFFFFF',
  },
};

export const themes: Record<ThemeName, ThemeTokens> = {
  light: lightTheme,
  sepia: sepiaTheme,
  dark: darkTheme,
};
