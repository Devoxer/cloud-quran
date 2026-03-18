import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Surface } from '@/components/Surface';
import { mmkv } from '@/services/mmkv';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

const CONSENT_KEY = 'gdpr-sync-consent';

export function hasGdprConsent(): boolean {
  return mmkv.getBoolean(CONSENT_KEY) === true;
}

export function setGdprConsent(value: boolean): void {
  mmkv.set(CONSENT_KEY, value);
}

interface ConsentScreenProps {
  onAgree: () => void;
  onCancel: () => void;
}

export function ConsentScreen({ onAgree, onCancel }: ConsentScreenProps) {
  const { tokens } = useTheme();

  const handleAgree = () => {
    setGdprConsent(true);
    onAgree();
  };

  return (
    <Surface style={styles.container}>
      <View style={styles.content}>
        <AppText variant="ui" style={[styles.title, { color: tokens.text.quran }]}>
          Data Sync Consent
        </AppText>

        <AppText variant="ui" style={[styles.body, { color: tokens.text.quran }]}>
          Your reading position, bookmarks, and preferences will sync to Cloud Quran's servers.
        </AppText>

        <AppText variant="uiCaption" style={[styles.body, { color: tokens.text.ui }]}>
          This includes data related to your religious practice, which is considered special
          category data under GDPR Article 9. Your explicit consent is required before any data is
          transmitted.
        </AppText>

        <AppText variant="uiCaption" style={[styles.body, { color: tokens.text.ui }]}>
          You can withdraw consent and delete all synced data at any time from Settings.
        </AppText>

        <View style={styles.actions}>
          <Pressable
            style={[styles.button, { backgroundColor: tokens.accent.audio }]}
            onPress={handleAgree}
            accessibilityRole="button"
            accessibilityLabel="I agree to sync my data"
          >
            <AppText variant="ui" style={styles.buttonText}>
              I Agree
            </AppText>
          </Pressable>

          <Pressable
            style={[styles.cancelButton, { borderColor: tokens.border }]}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel and return to settings"
          >
            <AppText variant="ui" style={{ color: tokens.text.ui }}>
              Cancel
            </AppText>
          </Pressable>
        </View>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.xl,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  body: {
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  button: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
});
