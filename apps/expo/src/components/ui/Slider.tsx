/**
 * Slider — wrapped `@expo/ui/community/slider` (drop-in replacement for
 * `@react-native-community/slider`).
 *
 * iOS: SwiftUI `Slider` (`.tint()` = `minimumTrackTintColor`). Android:
 * Material 3 `Slider`. Web: HTML `<input type="range">` with `accentColor`
 * = `minimumTrackTintColor`. Self-hosts internally (the community wrapper
 * wraps its native view in `<Host>` on iOS/Android).
 *
 * Prop surface matches `@react-native-community/slider` (`minimumValue`,
 * `maximumValue`, `value`, `onValueChange`, `step`, `minimumTrackTintColor`,
 * `maximumTrackTintColor` [@platform android], `thumbTintColor`
 * [@platform android], `disabled`, `inverted`, `lowerLimit`, `upperLimit`,
 * `style`).
 *
 * **Known regression (Story 17.3, accepted)** — `onSlidingComplete` is NOT
 * exposed. The native layers (swift-ui `onEditingChanged`,
 * jetpack-compose `onValueChangeFinished`) DO have a release event, but the
 * community wrapper does not bridge it; reaching the native event would
 * require importing from `@expo/ui/swift-ui` / `@expo/ui/jetpack-compose`,
 * barred by the web-safe wrapper rule (Story 17.3 scope decision 3).
 * Consumers that previously committed on release (e.g. the audio scrubber)
 * must commit live via `onValueChange`. Revisit trigger: the community
 * wrapper forwards `onValueChangeFinished` / `onEditingChanged`.
 *
 * **Known regression on iOS** — SwiftUI `Slider` only honors `.tint()`,
 * applied to the minimum (active) track. `maximumTrackTintColor` and
 * `thumbTintColor` are accepted at the type level but NOT visually applied
 * on iOS — the unfilled track + thumb render with SwiftUI defaults
 * (system gray / white). Android + web keep the full tint.
 *
 * Source: STACK-CHEAT-SHEET.md § "Expo UI — wrapper layer + native chrome".
 */

import {
  Slider as ExpoSlider,
  type SliderProps as ExpoSliderProps,
} from '@expo/ui/community/slider';
import { StyleSheet, View } from 'react-native';

/**
 * The community wrapper doesn't expose `testID`. We add it via a tag `View`
 * so jest-expo + RNTL can locate the slider.
 *
 * The wrapping `View` must forward the consumer's `style` (the slider sits
 * inside it stretched to `alignSelf:stretch` + `flex:1`); otherwise the
 * outer View collapses to zero width, taking the inner slider with it and
 * colliding it against any sibling text (e.g. the AudioPlayer scrubber's
 * `0:01 [thumb] 1:23` time labels). Fixed post-Story-17.3 iPhone smoke.
 */
export type SliderProps = ExpoSliderProps & { testID?: string };

export function Slider({ testID, style, ...rest }: SliderProps) {
  if (testID === undefined) {
    return <ExpoSlider style={style} {...rest} />;
  }
  return (
    <View testID={testID} style={style}>
      <ExpoSlider {...rest} style={styles.fill} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignSelf: 'stretch' },
});
