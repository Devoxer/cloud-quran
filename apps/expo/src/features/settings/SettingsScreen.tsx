import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Surface } from '@/components/Surface';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { db } from '@/services/instantdb';
import { mmkv, MMKV_KEYS } from '@/services/mmkv';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { useUIStore } from '@/theme/useUIStore';

import { FontSizeSlider } from './components/FontSizeSlider';
import { ThemePicker } from './components/ThemePicker';

const MAX_CONTENT_WIDTH = 680;

function SectionHeader({ title }: { title: string }) {
  const { tokens } = useTheme();

  return (
    <AppText variant="ui" style={[styles.sectionHeader, { color: tokens.text.ui }]}>
      {title.toUpperCase()}
    </AppText>
  );
}

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tokens } = useTheme();
  const { user, isAuthenticated } = useAuth();
  const autoFollowAudio = useUIStore((s) => s.autoFollowAudio);
  const toggleAutoFollowAudio = useUIStore((s) => s.toggleAutoFollowAudio);
  const tapToSeek = useUIStore((s) => s.tapToSeek);
  const toggleTapToSeek = useUIStore((s) => s.toggleTapToSeek);

  const handleSignOut = async () => {
    await db.auth.signOut();
    mmkv.remove(MMKV_KEYS.GDPR_CONSENT);
    // Re-trigger guest auth so the app stays functional
    db.auth.signInAsGuest();
  };

  return (
    <Surface style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + spacing.lg }]}
      >
        <View style={styles.content}>
          <SectionHeader title="Appearance" />
          <ThemePicker />
          <View style={styles.componentSpacer} />
          <FontSizeSlider />
          <View style={styles.sectionSpacer} />
          <SectionHeader title="Audio" />
          <Pressable style={styles.settingRow} onPress={toggleAutoFollowAudio}>
            <View style={styles.settingTextColumn}>
              <AppText variant="ui" style={{ color: tokens.text.quran }}>
                Auto-follow audio
              </AppText>
              <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
                Scroll to the active verse during playback
              </AppText>
            </View>
            <Switch
              value={autoFollowAudio}
              onValueChange={toggleAutoFollowAudio}
              trackColor={{ true: tokens.accent.audio }}
            />
          </Pressable>
          <View style={styles.componentSpacer} />
          <Pressable style={styles.settingRow} onPress={toggleTapToSeek}>
            <View style={styles.settingTextColumn}>
              <AppText variant="ui" style={{ color: tokens.text.quran }}>
                Tap to seek
              </AppText>
              <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
                Tap a verse to jump audio to that position
              </AppText>
            </View>
            <Switch
              value={tapToSeek}
              onValueChange={toggleTapToSeek}
              trackColor={{ true: tokens.accent.audio }}
            />
          </Pressable>
          <View style={styles.sectionSpacer} />
          <SectionHeader title="Account" />
          {isAuthenticated ? (
            <>
              <View style={styles.settingRow}>
                <View style={styles.settingTextColumn}>
                  <AppText variant="ui" style={{ color: tokens.text.quran }}>
                    {user?.email ?? 'Signed in'}
                  </AppText>
                  <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
                    Syncing enabled
                  </AppText>
                </View>
              </View>
              <View style={styles.componentSpacer} />
              <Pressable
                style={styles.settingRow}
                onPress={handleSignOut}
                accessibilityRole="button"
                accessibilityLabel="Sign out"
              >
                <AppText variant="uiCaption" style={{ color: tokens.status.error }}>
                  Sign out
                </AppText>
              </Pressable>
            </>
          ) : (
            <Pressable
              style={styles.settingRow}
              onPress={() => router.push('/(auth)/consent')}
              accessibilityRole="button"
              accessibilityLabel="Sign in to sync across devices"
            >
              <View style={styles.settingTextColumn}>
                <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
                  Sign in to sync across devices
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={tokens.text.ui} />
            </Pressable>
          )}
          <View style={styles.sectionSpacer} />
          <SectionHeader title="About" />
          <AppText variant="uiCaption">{`Cloud Quran v${Constants.expoConfig?.version ?? '1.0.0'}`}</AppText>
        </View>
      </ScrollView>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
  },
  content: {
    maxWidth: MAX_CONTENT_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  sectionHeader: {
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.lg,
  },
  componentSpacer: {
    height: spacing.xl,
  },
  sectionSpacer: {
    height: spacing['3xl'],
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingTextColumn: {
    flex: 1,
    marginRight: spacing.md,
  },
});
