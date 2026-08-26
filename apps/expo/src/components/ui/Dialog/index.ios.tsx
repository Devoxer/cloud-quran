/**
 * Dialog (iOS) — wraps `@expo/ui/swift-ui` `Alert` → a true `UIAlertController`.
 *
 * Presentation is driven by the `open` prop, mirrored into LOCAL state so the
 * SwiftUI binding can sync on dismissal WITHOUT conflating presentation-sync
 * with a semantic action. SwiftUI auto-sets `isPresented = false` on ANY button
 * tap, so wiring `onIsPresentedChange` to a semantic callback double-fires — the
 * buttons are the SOLE source of semantic intent; the binding only tracks
 * presentation (Story 17.4 §A; AC-4b). A hidden `Alert.Trigger` is still
 * required — SwiftUI's `.alert(_:isPresented:)` modifier attaches to that anchor;
 * an Alert with no Trigger silently never presents. Presents at the OS window level.
 *
 * Story 17.13: the button set is now configurable. `Alert.Actions` accepts an
 * arbitrary list, so a 1-button OK alert or an N-action set both render natively;
 * `resolveDialogActions` maps either the new `actions` prop or the legacy
 * confirm/cancel pair onto `<Button role label onPress>`.
 *
 * Native chrome — colors / layout are owned by iOS, not customizable here.
 */

import { Alert, Button, Host, Text } from '@expo/ui/swift-ui';
import { useEffect, useState } from 'react';
import { type DialogProps, resolveDialogActions } from './types';

export function Dialog(props: DialogProps) {
  const { open, title, message, testID } = props;
  const actions = resolveDialogActions(props);

  // Mirror `open` so the SwiftUI binding stays in sync on native dismissal
  // without firing a semantic callback. Intent comes ONLY from the buttons.
  //
  // Initialize to `false` even when `open` is already `true` at mount: SwiftUI's
  // `.alert(_:isPresented:)` only presents on a false→true TRANSITION of the
  // binding. A consumer that CONDITIONALLY MOUNTS this Dialog with `open={true}`
  // (e.g. AlertContext's `{options && <Dialog open .../>}`) would otherwise mount
  // already-true → no transition → the alert flashes and auto-dismisses
  // immediately (Story 17.13 device smoke — subscription alerts). Starting false
  // and flipping to `open` in the effect (next commit) guarantees the transition
  // for both conditional-mount and persistently-mounted (ConfirmDialog) consumers.
  const [presented, setPresented] = useState(false);
  useEffect(() => {
    setPresented(open);
  }, [open]);

  return (
    <Host style={{ position: 'absolute' }} pointerEvents="none" testID={testID}>
      <Alert title={title} isPresented={presented} onIsPresentedChange={setPresented}>
        {/* Hidden anchor — `.alert(isPresented:)` needs a view to attach to. */}
        <Alert.Trigger>
          <Text> </Text>
        </Alert.Trigger>
        {/* Wrap in swift-ui Text — a raw string child mounts as a Fabric
            `RawText` view the SwiftUI host can't create (crash on mount). */}
        <Alert.Message>
          <Text>{message}</Text>
        </Alert.Message>
        <Alert.Actions>
          {actions.map((action) => (
            <Button
              key={action.testIdSuffix}
              role={action.role}
              label={action.label}
              onPress={action.onPress}
            />
          ))}
        </Alert.Actions>
      </Alert>
    </Host>
  );
}
