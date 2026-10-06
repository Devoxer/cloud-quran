/** Native switches inherit the themed Host; the web fallback needs explicit tint and direction. */
import { Switch as ExpoSwitch, type SwitchProps as ExpoSwitchProps } from '@expo/ui';
import { Platform, StyleSheet, View, Switch as WebSwitch } from 'react-native';

import { isInterfaceRTL } from '@/lib/rtl';
import { useTheme } from '@/lib/theme';
import { Host } from './Host';
import { Text } from './Themed';

export type SwitchProps = ExpoSwitchProps;

export function Switch(props: SwitchProps) {
  const { colors } = useTheme();
  if (Platform.OS === 'web') {
    return (
      <View style={styles.row}>
        {props.label ? <Text>{props.label}</Text> : null}
        <WebSwitch
          value={props.value}
          onValueChange={props.onValueChange}
          disabled={props.disabled}
          accessibilityLabel={props.label}
          testID={props.testID}
          trackColor={{ false: colors.background.tertiary, true: colors.accent.primary }}
          thumbColor={colors.text.onAccent}
          style={isInterfaceRTL() ? styles.rtl : undefined}
        />
      </View>
    );
  }
  return (
    <Host matchContents>
      <ExpoSwitch {...props} />
    </Host>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  rtl: { transform: [{ scaleX: -1 }] },
});
