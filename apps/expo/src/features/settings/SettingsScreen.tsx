import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Surface } from '@/components/Surface';
import { useAuthStore, useIsAuthenticated } from '@/features/auth';
import { hasGdprConsent } from '@/features/auth/components/ConsentScreen';
import { ReminderSettings } from '@/features/reminders/ReminderSettings';
import { api } from '@/services/api';
import { authClient } from '@/services/auth-client';
import { queryClient } from '@/services/query-client';
import { clearAuthToken } from '@/services/secure-store';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { useUIStore } from '@/theme/useUIStore';

import { FontSizeSlider } from './components/FontSizeSlider';
import { ThemePicker } from './components/ThemePicker';

const MAX_CONTENT_WIDTH = 680;
const PRIVACY_POLICY_URL = 'https://cloudquran.com/privacy';
const SOURCE_CODE_URL = 'https://github.com/ilyassrachedaoui/cloud-quran';
const FEEDBACK_EMAIL_URL = 'mailto:feedback@cloudquran.com?subject=Cloud%20Quran%20Feedback';
const GITHUB_ISSUES_URL = 'https://github.com/ilyassrachedaoui/cloud-quran/issues';

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
  const { tokens } = useTheme();
  const isAuthenticated = useIsAuthenticated();
  const email = useAuthStore((s) => s.email);
  const displayName = useAuthStore((s) => s.displayName);
  const autoFollowAudio = useUIStore((s) => s.autoFollowAudio);
  const toggleAutoFollowAudio = useUIStore((s) => s.toggleAutoFollowAudio);
  const tapToSeek = useUIStore((s) => s.tapToSeek);
  const toggleTapToSeek = useUIStore((s) => s.toggleTapToSeek);
  const showTransliteration = useUIStore((s) => s.showTransliteration);
  const toggleTransliteration = useUIStore((s) => s.toggleTransliteration);

  const handleSignIn = () => {
    if (hasGdprConsent()) {
      router.push('/(auth)/sign-in');
    } else {
      router.push('/(auth)/consent');
    }
  };

  const handleSignOut = async () => {
    await authClient.signOut();
    await clearAuthToken();
    useAuthStore.getState().clearUser();
    queryClient.clear();
  };

  const handleDeleteData = () => {
    Alert.alert(
      'Delete All Synced Data',
      'This will permanently delete all your data from the server (reading position, bookmarks, preferences). Your local data on this device will be preserved. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDeleteData },
      ],
    );
  };

  const confirmDeleteData = async () => {
    try {
      const res = await api.api.user.data.$delete();
      if (!res.ok) throw new Error('Delete failed');
      await authClient.signOut();
      await clearAuthToken();
      useAuthStore.getState().clearUser();
      queryClient.clear();
      Alert.alert('Data Deleted', 'All your synced data has been removed from the server.');
    } catch {
      Alert.alert('Error', 'Failed to delete data. Please try again.');
    }
  };

  const handleExportData = async () => {
    try {
      const res = await api.api.user.export.$get();
      if (!res.ok) throw new Error('Export failed');
      const data = await res.json();
      const jsonString = JSON.stringify(data, null, 2);

      if (Platform.OS === 'web') {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cloud-quran-export.json';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const file = new File(Paths.cache, 'cloud-quran-export.json');
        file.write(jsonString);
        await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
      }
    } catch {
      Alert.alert('Error', 'Failed to export data. Please try again.');
    }
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
          <View style={styles.componentSpacer} />
          <Pressable style={styles.settingRow} onPress={toggleTransliteration}>
            <View style={styles.settingTextColumn}>
              <AppText variant="ui" style={{ color: tokens.text.quran }}>
                Show transliteration
              </AppText>
              <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
                Display Latin-script pronunciation below Arabic text
              </AppText>
            </View>
            <Switch
              value={showTransliteration}
              onValueChange={toggleTransliteration}
              trackColor={{ true: tokens.accent.audio }}
            />
          </Pressable>
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
          {Platform.OS !== 'web' && (
            <>
              <View style={styles.sectionSpacer} />
              <SectionHeader title="Reading Reminders" />
              <ReminderSettings />
            </>
          )}
          <View style={styles.sectionSpacer} />
          <SectionHeader title="Account" />
          {isAuthenticated ? (
            <View style={styles.settingRow}>
              <View style={styles.settingTextColumn}>
                <AppText variant="ui" style={{ color: tokens.text.quran }}>
                  {displayName || email || 'Signed in'}
                </AppText>
                {displayName && email && (
                  <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
                    {email}
                  </AppText>
                )}
              </View>
            </View>
          ) : (
            <Pressable
              style={styles.settingRow}
              onPress={handleSignIn}
              accessibilityRole="button"
              accessibilityLabel="Sign in to sync across devices"
            >
              <AppText variant="ui" style={{ color: tokens.text.quran }}>
                Sign in to sync across devices
              </AppText>
              <Ionicons name="chevron-forward" size={20} color={tokens.text.ui} />
            </Pressable>
          )}
          <View style={styles.sectionSpacer} />
          <SectionHeader title="Privacy & Data" />
          {isAuthenticated ? (
            <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
              {`Signed in as ${email} · Sync active`}
            </AppText>
          ) : (
            <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
              Not signed in · Sync off
            </AppText>
          )}
          <View style={styles.componentSpacer} />
          {isAuthenticated && (
            <>
              <Pressable
                style={styles.settingRow}
                onPress={handleExportData}
                accessibilityRole="button"
                accessibilityLabel="Export my data"
              >
                <AppText variant="ui" style={{ color: tokens.text.quran }}>
                  Export My Data
                </AppText>
                <Ionicons name="chevron-forward" size={20} color={tokens.text.ui} />
              </Pressable>
              <View style={styles.componentSpacer} />
              <Pressable
                style={styles.settingRow}
                onPress={handleDeleteData}
                accessibilityRole="button"
                accessibilityLabel="Delete all synced data"
              >
                <AppText variant="ui" style={{ color: tokens.status.error }}>
                  Delete All Synced Data
                </AppText>
                <Ionicons name="chevron-forward" size={20} color={tokens.text.ui} />
              </Pressable>
              <View style={styles.componentSpacer} />
              <Pressable
                style={styles.settingRow}
                onPress={handleSignOut}
                accessibilityRole="button"
                accessibilityLabel="Sign out"
              >
                <AppText variant="ui" style={{ color: tokens.status.error }}>
                  Sign Out
                </AppText>
                <Ionicons name="chevron-forward" size={20} color={tokens.text.ui} />
              </Pressable>
              <View style={styles.componentSpacer} />
            </>
          )}
          <Pressable
            style={styles.settingRow}
            onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
            accessibilityRole="link"
            accessibilityLabel="Privacy policy"
          >
            <AppText variant="ui" style={{ color: tokens.text.quran }}>
              Privacy Policy
            </AppText>
            <Ionicons name="open-outline" size={18} color={tokens.text.ui} />
          </Pressable>
          <View style={styles.componentSpacer} />
          <Pressable
            style={styles.settingRow}
            onPress={() => Linking.openURL(SOURCE_CODE_URL)}
            accessibilityRole="link"
            accessibilityLabel="Source code"
          >
            <AppText variant="ui" style={{ color: tokens.text.quran }}>
              Source Code
            </AppText>
            <Ionicons name="logo-github" size={18} color={tokens.text.ui} />
          </Pressable>
          <View style={styles.sectionSpacer} />
          <SectionHeader title="Feedback" />
          <Pressable
            style={styles.settingRow}
            onPress={() => Linking.openURL(FEEDBACK_EMAIL_URL)}
            accessibilityRole="link"
            accessibilityLabel="Email us"
          >
            <View style={styles.settingTextColumn}>
              <AppText variant="ui" style={{ color: tokens.text.quran }}>
                Email Us
              </AppText>
              <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
                Send feedback, suggestions, or bug reports
              </AppText>
            </View>
            <Ionicons name="mail-outline" size={20} color={tokens.text.ui} />
          </Pressable>
          <View style={styles.componentSpacer} />
          <Pressable
            style={styles.settingRow}
            onPress={() => Linking.openURL(GITHUB_ISSUES_URL)}
            accessibilityRole="link"
            accessibilityLabel="Report on GitHub"
          >
            <View style={styles.settingTextColumn}>
              <AppText variant="ui" style={{ color: tokens.text.quran }}>
                Report on GitHub
              </AppText>
              <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
                File a bug report or feature request
              </AppText>
            </View>
            <Ionicons name="logo-github" size={20} color={tokens.text.ui} />
          </Pressable>
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
