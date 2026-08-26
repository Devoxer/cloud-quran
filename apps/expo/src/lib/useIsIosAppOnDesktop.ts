import * as Device from 'expo-device';
import { Platform } from 'react-native';

/**
 * Detects the "iPhone/iPad app running on an Apple silicon Mac" runtime — the same binary the App
 * Store ships to phones, launched on macOS ("Designed for iPad").
 *
 * It matters because **controls installed into a NATIVE stack header via `navigation.setOptions`
 * never receive mouse clicks there.** Anything inside the React Native view tree (lists, the
 * floating transport bar, the sidebar) clicks fine. Verified on the owner's Mac 2026-08-20 against
 * a dev client built and installed by Xcode: the player's `headerLeft` chevron and both
 * `headerRight` buttons are dead from launch, while the same three controls work on an iPhone and
 * in the iOS simulator.
 *
 * ⚠️ In Cloud Quran that defect cannot occur, and this signal is not the remedy — architecture §9
 * puts the header inside the RN view tree with `headerShown: false`, and `lint:header-controls`
 * prohibits `headerLeft`/`headerRight` outright. (The sibling app it was measured in keeps native
 * chrome and needs an in-content fallback keyed on this hook instead.) It is ported because it is
 * the ONLY signal that identifies this runtime, and because a surface that ever needs mouse-vs-touch
 * affordances here — hover, a wider hit target, a pointer cursor — has nothing else to ask.
 *
 * ## What the runtime actually reports, logged from the Mac itself
 *
 * `Platform.constants` → `{ systemName: 'iPadOS', interfaceIdiom: 'pad', osVersion: '26.6',
 * isMacCatalyst: false }`, and `Device.modelName` → `'iPad Pro (12.9-inch) (3rd generation)'`. So
 * the app believes it is an iPad, and NOTHING in `Platform` says Mac: not `isMacCatalyst` (that is
 * Catalyst, a different thing), not `Platform.OS` (that would be `macos`, the out-of-tree
 * platform), not the version string.
 *
 * ⚠️ An earlier cut of this file keyed off `interfaceIdiom === 'phone'` plus a window-width
 * threshold. Both halves were wrong, and the width half was wrong for a subtle reason worth
 * keeping: the reading came from the SIMULATOR, which was attached to the same Metro instance, so
 * the log looked authoritative and was not. The window is also resizable, so a width rule silently
 * stops applying when the user makes the window small.
 *
 * ## The signal that does work
 *
 * `expo-device` reports `deviceType === DeviceType.DESKTOP` on this runtime (logged: `3`) while a
 * real iPhone reports `PHONE` and a real iPad `TABLET`. It is size-independent, so it survives a
 * window resize.
 */
export function isIosAppOnDesktop(): boolean {
  // ⚠️ Read through the NAMESPACE (`Device.deviceType`), never copied into a module-scope const.
  // A test overrides this by defining `deviceType` as a GETTER on the module double, and a member
  // access re-invokes it on every call while `const { deviceType } = Device` at module scope reads
  // it ONCE, at module-evaluation time, and freezes the suite-wide default — after which neither
  // branch below can be exercised and the test proves only that a phone is not a desktop.
  //
  // ⚠️ THIS IS ORDINARY DESTRUCTURING OF AN ACCESSOR, NOT A BABEL-INTEROP QUIRK, and the note here
  // said the opposite for a round. Measured in this repo with the getter mock: a named import
  // (`import { deviceType } from 'expo-device'`) tracks the getter perfectly — Babel compiles it to
  // a member access on the namespace, and `_interopRequireWildcard` copies property DESCRIPTORS, so
  // an accessor survives as an accessor. Only the `const {…} =` form freezes. Keep the namespace
  // convention — one obvious rule beats two — but for the real reason.
  return Platform.OS === 'ios' && Device.deviceType === Device.DeviceType.DESKTOP;
}

/**
 * Hook form, for components that read this during render.
 *
 * `Device.deviceType` is a constant for the life of the process — this cannot change without a
 * relaunch — so there is no subscription here. The hook exists only so call sites read it the same
 * way they read everything else.
 */
export function useIsIosAppOnDesktop(): boolean {
  return isIosAppOnDesktop();
}
