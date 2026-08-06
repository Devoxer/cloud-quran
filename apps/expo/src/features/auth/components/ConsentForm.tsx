import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

interface ConsentFormProps {
  onAccept: () => void;
  onDecline: () => void;
}

export function ConsentForm({ onAccept, onDecline }: ConsentFormProps) {
  const { tokens } = useTheme();

  return (
    <View style={styles.container}>
      <AppText variant="ui" style={[styles.title, { color: tokens.text.quran }]}>
        Data Sync Consent
      </AppText>

      <AppText variant="ui" style={[styles.body, { color: tokens.text.translation }]}>
        To sync your data across devices, we need your permission to store the following information:
      </AppText>

      <AppText variant="ui" style={[styles.consentText, { color: tokens.text.quran }]}>
        Your reading position, bookmarks, and preferences will sync through InstantDB.
      </AppText>

      <AppText variant="uiCaption" style={[styles.body, { color: tokens.text.ui }]}>
        This data is classified as religious data under GDPR Article 9 and requires your explicit
        consent. You can revoke consent at any time by signing out.
      </AppText>

      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.button, { borderColor: tokens.border }]}
          onPress={onDecline}
          accessibilityRole="button"
          accessibilityLabel="Decline consent"
        >
          <AppText variant="ui" style={{ color: tokens.text.ui }}>
            Decline
          </AppText>
        </Pressable>

        <Pressable
          style={[styles.button, styles.acceptButton, { backgroundColor: tokens.accent.audio }]}
          onPress={onAccept}
          accessibilityRole="button"
          accessibilityLabel="Accept consent"
        >
          <AppText variant="ui" style={{ color: '#FFFFFF' }}>
            Accept & Continue
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
    flex: 1,
    justifyContent: 'center',
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
  consentText: {
    fontWeight: '500',
    marginBottom: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    lineHeight: 22,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  acceptButton: {
    borderWidth: 0,
  },
});
