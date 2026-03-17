import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LinearGradient } from 'expo-linear-gradient';

import type { MushafLine, MushafPageLayout } from 'quran-data';
import { SURAH_METADATA } from 'quran-data';

import { AppText } from '@/components/AppText';
import { useAudioStore } from '@/features/audio/stores/useAudioStore';
import { useUIStore } from '@/theme/useUIStore';
import { getPageFontFamily, loadPageFont, preloadAdjacentFonts } from '@/services/mushaf-fonts';
import { getPageLayout } from '@/services/mushaf-layout';
import { useTheme } from '@/theme/ThemeProvider';
import { KFGQPC_FONT_FAMILY, spacing } from '@/theme/tokens';

import { MushafPageHeader } from './MushafPageHeader';

/** Collect unique fontPage values from layout (cross-page words needing a different font) */
function collectFontPages(layout: MushafPageLayout): number[] {
  const pages = new Set<number>();
  for (const line of layout.lines) {
    if (line.words) {
      for (const word of line.words) {
        if (word.fontPage) pages.add(word.fontPage);
      }
    }
  }
  return [...pages];
}

interface MushafPageProps {
  pageNumber: number;
  onTap?: () => void;
  /** Override container width for font sizing (used in dual-page spread mode) */
  contentWidth?: number;
}

export function MushafPage({ pageNumber, onTap, contentWidth: contentWidthProp }: MushafPageProps) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const activeVerseKey = useAudioStore((s) => s.activeVerseKey);
  const isAudioPlaying = useAudioStore((s) => s.isPlaying);
  const seekToVerse = useAudioStore((s) => s.seekToVerse);
  const tapToSeek = useUIStore((s) => s.tapToSeek);
  const [fontFamily, setFontFamily] = useState<string | null>(null);
  const [layout, setLayout] = useState<MushafPageLayout | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const pageLayout = await getPageLayout(pageNumber);
      // Load the page's own font + any cross-page fonts needed
      const extraFontPages = collectFontPages(pageLayout);
      await Promise.all([
        loadPageFont(pageNumber),
        ...extraFontPages.map((fp) => loadPageFont(fp)),
      ]);
      setFontFamily(getPageFontFamily(pageNumber));
      setLayout(pageLayout);
      // Fire-and-forget preload of adjacent pages
      preloadAdjacentFonts(pageNumber);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load page');
    }
  }, [pageNumber]);

  useEffect(() => {
    setFontFamily(null);
    setLayout(null);
    loadData();
  }, [loadData]);

  // Responsive font size based on container width (5.9vw matching quran.com)
  const { width: screenWidth } = useWindowDimensions();
  const containerWidth = contentWidthProp ?? (Platform.OS === 'web' ? Math.min(screenWidth, 700) : screenWidth);
  const glyphFontSize = containerWidth * (Platform.OS === 'web' ? 0.059 : 0.065);

  const safeAreaStyle = { paddingTop: insets.top, paddingBottom: insets.bottom };

  if (error) {
    return (
      <View
        style={[styles.container, styles.errorContainer, safeAreaStyle, { backgroundColor: tokens.surface.primary }]}
        accessibilityLabel={`Page ${pageNumber}, loading error`}
      >
        <AppText variant="ui" style={{ color: tokens.text.ui }}>
          {error}
        </AppText>
        <Pressable
          onPress={loadData}
          style={styles.retryButton}
          accessibilityRole="button"
          accessibilityLabel="Retry loading page"
        >
          <AppText variant="ui" style={{ color: tokens.text.ui }}>
            Retry
          </AppText>
        </Pressable>
      </View>
    );
  }

  if (!fontFamily || !layout) {
    return (
      <View
        style={[styles.container, safeAreaStyle, { backgroundColor: tokens.surface.primary }]}
        accessibilityLabel={`Page ${pageNumber}, loading`}
      >
        {Array.from({ length: 15 }, (_, i) => (
          <View
            key={i}
            style={[
              styles.skeletonLine,
              { backgroundColor: tokens.border, opacity: 0.3 },
            ]}
          />
        ))}
      </View>
    );
  }

  // Find surah name for accessibility
  const firstTextLine = layout.lines.find((l) => l.type === 'text' && l.words?.length);
  const firstLocation = firstTextLine?.words?.[0]?.location;
  const surahNum = firstLocation ? parseInt(firstLocation.split(':')[0], 10) : 0;
  const surahName = surahNum > 0 ? SURAH_METADATA[surahNum - 1]?.nameEnglish : '';

  // Tap-to-seek: only when setting is on AND audio is already playing
  const handleWordTap = useCallback((verseKey: string) => {
    if (tapToSeek && isAudioPlaying) {
      seekToVerse(verseKey);
    }
  }, [tapToSeek, isAudioPlaying, seekToVerse]);

  const isSpecialPage = pageNumber <= 2;

  return (
    <Pressable
      style={[styles.container, safeAreaStyle, { backgroundColor: tokens.surface.primary }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
      accessibilityLabel={`Page ${pageNumber}, Surah ${surahName}`}
      accessibilityRole="text"
      onPress={onTap}
    >
      <MushafPageHeader pageNumber={pageNumber} surahNumber={surahNum || 1} />

      <View style={isSpecialPage ? styles.specialPageContent : styles.pageContent}>
        {isSpecialPage && (
          <View style={[styles.specialPageFrame, { borderColor: tokens.border }]}>
            {layout.lines.map((line) => (
              <MushafLineView
                key={line.line}
                line={line}
                fontFamily={fontFamily}
                glyphFontSize={glyphFontSize}
                quranColor={tokens.text.quran}
                uiColor={tokens.text.ui}
                borderColor={tokens.border}
                surfaceSecondary={tokens.surface.secondary}
                activeVerseKey={activeVerseKey}
                highlightColor={tokens.accent.highlight}
              onWordTap={handleWordTap}
              />
            ))}
          </View>
        )}
        {!isSpecialPage &&
          layout.lines.map((line) => (
            <MushafLineView
              key={line.line}
              line={line}
              fontFamily={fontFamily}
              glyphFontSize={glyphFontSize}
              quranColor={tokens.text.quran}
              uiColor={tokens.text.ui}
              borderColor={tokens.border}
              surfaceSecondary={tokens.surface.secondary}
              activeVerseKey={activeVerseKey}
              highlightColor={tokens.accent.highlight}
              onWordTap={handleWordTap}
            />
          ))}
      </View>

      <AppText variant="uiCaption" style={[styles.pageNumber, { color: tokens.text.ui }]}>
        {pageNumber}
      </AppText>

      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'transparent']}
        start={pageNumber % 2 === 1 ? { x: 0, y: 0 } : { x: 1, y: 0 }}
        end={pageNumber % 2 === 1 ? { x: 1, y: 0 } : { x: 0, y: 0 }}
        style={[
          styles.pageEdge,
          pageNumber % 2 === 1 ? styles.pageEdgeLeft : styles.pageEdgeRight,
          { width: Platform.OS === 'web' ? 30 : 16 },
        ]}
        pointerEvents="none"
      />
    </Pressable>
  );
}

const BASMALA_TEXT = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ';

interface MushafLineViewProps {
  line: MushafLine;
  fontFamily: string;
  glyphFontSize: number;
  quranColor: string;
  uiColor: string;
  borderColor: string;
  surfaceSecondary: string;
  activeVerseKey?: string | null;
  highlightColor?: string;
  onWordTap?: (verseKey: string) => void;
}

function MushafLineView({ line, fontFamily, glyphFontSize, quranColor, uiColor, borderColor, surfaceSecondary, activeVerseKey, highlightColor, onWordTap }: MushafLineViewProps) {
  if (line.type === 'surah-header') {
    const surahNum = parseInt(line.surah || '0', 10);
    const metadata = surahNum > 0 ? SURAH_METADATA[surahNum - 1] : null;
    return (
      <View style={[styles.surahHeaderFrame, { borderColor, backgroundColor: surfaceSecondary }]}>
        <AppText variant="surahTitleArabic" style={{ color: quranColor }}>
          {metadata?.nameArabic || line.text}
        </AppText>
      </View>
    );
  }

  if (line.type === 'basmala') {
    return (
      <View style={styles.basmalaLine}>
        <Text
          style={[
            styles.basmalaText,
            { fontFamily: KFGQPC_FONT_FAMILY, color: quranColor, fontSize: glyphFontSize * 0.8, lineHeight: glyphFontSize * 0.8 * 1.4 },
          ]}
        >
          {BASMALA_TEXT}
        </Text>
      </View>
    );
  }

  // type === 'text'
  if (!line.words) return null;

  const lineHeight = glyphFontSize * 1.4;
  const activePrefix = activeVerseKey ? activeVerseKey + ':' : null;

  return (
    <Text style={[styles.textLineText, { lineHeight, color: quranColor }]}>
      {line.words.map((word, i) => {
        const wordFont = word.fontPage
          ? getPageFontFamily(word.fontPage)
          : fontFamily;
        const isWordActive = !!(activePrefix && word.location.startsWith(activePrefix));
        const verseKey = word.location.substring(0, word.location.lastIndexOf(':'));
        return (
          <React.Fragment key={word.location}>
            {i > 0 && ' '}
            <Text
              style={[
                {
                  fontFamily: word.qpcV1 ? wordFont : KFGQPC_FONT_FAMILY,
                  fontSize: glyphFontSize,
                },
                isWordActive && highlightColor && {
                  backgroundColor: highlightColor,
                },
              ]}
              onPress={onWordTap ? () => onWordTap(verseKey) : undefined}
            >
              {word.qpcV1 || word.word}
            </Text>
          </React.Fragment>
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  pageContent: {
    flex: 1,
    justifyContent: 'space-evenly',
    paddingVertical: spacing.md,
  },
  specialPageContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  specialPageFrame: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.lg,
    width: '100%',
    alignItems: 'center',
    gap: spacing.sm,
  },
  skeletonLine: {
    height: 24,
    borderRadius: 4,
    marginVertical: spacing.xs,
    marginHorizontal: spacing.xl,
  },
  surahHeaderFrame: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginHorizontal: spacing.lg,
    borderWidth: 2,
    borderRadius: 24,
  },
  basmalaLine: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  textLineText: {
    writingDirection: 'rtl',
    textAlign: 'center',
  },
  basmalaText: {
    writingDirection: 'rtl',
    textAlign: 'center',
  },
  pageNumber: {
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryButton: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  pageEdge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  pageEdgeLeft: {
    left: 0,
  },
  pageEdgeRight: {
    right: 0,
  },
});
