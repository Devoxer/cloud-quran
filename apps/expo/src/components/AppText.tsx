import { I18nManager, StyleSheet, Text, type TextProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { KFGQPC_FONT_FAMILY, type TypographyVariant, typography } from '@/theme/tokens';
import { useUIStore } from '@/theme/useUIStore';

export type AppTextProps = TextProps & {
  variant?: TypographyVariant;
};

export function AppText({ style, variant = 'ui', ...rest }: AppTextProps) {
  const { tokens } = useTheme();
  const fontSize = useUIStore((s) => s.fontSize);
  const typo = typography[variant];

  const colorMap: Record<TypographyVariant, string> = {
    quran: tokens.text.quran,
    translation: tokens.text.translation,
    verseNumber: tokens.text.ui,
    surahTitleArabic: tokens.text.quran,
    surahTitleEnglish: tokens.text.ui,
    ui: tokens.text.ui,
    uiCaption: tokens.text.ui,
  };

  const isArabic = variant === 'quran' || variant === 'surahTitleArabic';
  const isQuran = variant === 'quran';
  const resolvedFontSize = isQuran ? fontSize : typo.fontSize;
  const lineHeight = Math.round(resolvedFontSize * typo.lineHeightMultiplier);

  const fontFamily = isArabic ? KFGQPC_FONT_FAMILY : undefined;

  return (
    <Text
      style={[
        {
          color: colorMap[variant],
          fontSize: resolvedFontSize,
          fontWeight: typo.fontWeight,
          lineHeight,
          fontFamily,
        },
        isArabic && styles.rtl,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  rtl: {
    writingDirection: 'rtl',
    textAlign: I18nManager.isRTL ? 'left' : 'right',
  },
});
