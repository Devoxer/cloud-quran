/**
 * Avatar - Displays user avatar with image or initials fallback
 *
 * Shows user's profile image if available, otherwise displays
 * initials extracted from the display name.
 *
 * Story 23.9 adds an opt-in `gradient` variant: when set (and no image), the
 * initials sit on a 135° `[accent.primary, accent.strong]` LinearGradient with a
 * soft accent drop-shadow (the Profile account-hero look). The DEFAULT path (no
 * `gradient` prop) is byte-unchanged — a solid `accent.secondary` initials avatar —
 * so existing callers are unaffected.
 *
 * @example
 * // With image
 * <Avatar displayName="John Doe" avatarUrl="https://..." size={80} />
 *
 * // Without image (shows initials "JD" on a solid accent.secondary disc)
 * <Avatar displayName="John Doe" size={80} />
 *
 * // Gradient variant (account-hero)
 * <Avatar displayName="John Doe" size={54} gradient />
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, Text, View } from 'react-native';
import { FONT_WEIGHT } from '@/constants/typography';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';

export interface AvatarProps {
  /** User's display name (used for initials fallback) */
  displayName: string;
  /** URL of the user's avatar image */
  avatarUrl?: string | null;
  /** Size of the avatar in pixels (width and height) */
  size: number;
  /**
   * Render the initials on an accent gradient ([primary → strong], 135°) with a
   * soft accent shadow instead of the solid `accent.secondary` disc. Ignored when
   * an `avatarUrl` is present. @default false
   */
  gradient?: boolean;
}

/**
 * Extracts initials from a display name
 * - "John Doe" -> "JD"
 * - "John" -> "J"
 * - "John Michael Doe" -> "JM" (first two words)
 * - "" or whitespace -> "?"
 */
function getInitials(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return '?';

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';

  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  }

  // Take first letter of first two words
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}

/**
 * Avatar component
 *
 * Displays a circular avatar with either an image or initials.
 * Uses theme colors for the initials background.
 */
export function Avatar({ displayName, avatarUrl, size, gradient = false }: AvatarProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles((t) => ({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    containerImage: {
      overflow: 'hidden',
      backgroundColor: t.colors.background.tertiary,
    },
    containerInitials: {
      overflow: 'hidden',
      backgroundColor: t.colors.accent.secondary,
    },
    // Gradient variant carries the shadow itself (no overflow:hidden — that would
    // clip the soft accent drop-shadow); the LinearGradient rounds its own corners.
    containerGradient: {
      shadowColor: t.colors.accent.primary,
      shadowOpacity: 0.35,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    image: {
      resizeMode: 'cover',
    },
    initials: {
      fontWeight: FONT_WEIGHT.semibold,
      textAlign: 'center',
      color: t.colors.text.onAccent,
    },
  }));

  const initials = getInitials(displayName);
  const fontSize = size * 0.35; // Initials font size relative to avatar size
  const showGradient = gradient && !avatarUrl;

  return (
    <View
      style={[
        styles.container,
        avatarUrl
          ? styles.containerImage
          : showGradient
            ? styles.containerGradient
            : styles.containerInitials,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
      testID="avatar-container"
      accessibilityRole="image"
      accessibilityLabel={t('a11y:avatarOf', { name: displayName })}
    >
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
          testID="avatar-image"
        />
      ) : (
        <>
          {showGradient && (
            // colors={[...]} is a non-style prop → tokens stay inline (no StyleSheet home).
            // 135° = top-left → bottom-right.
            <LinearGradient
              colors={[colors.accent.primary, colors.accent.strong]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
              testID="avatar-gradient"
            />
          )}
          <Text
            style={[
              styles.initials,
              {
                fontSize,
                lineHeight: fontSize * 1.2,
              },
            ]}
            testID="avatar-initials"
          >
            {initials}
          </Text>
        </>
      )}
    </View>
  );
}
