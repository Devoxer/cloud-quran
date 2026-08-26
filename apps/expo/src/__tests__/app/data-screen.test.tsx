/**
 * THE DATA SCREEN — the only place FR28, FR28a and FR29 reach a human.
 *
 * ⚠️ IT IS THE SOLE CALL SITE OF `exportMyData`, `purgeMyData`, `deleteAccount` AND THE SYNC
 * OPT-OUT, so everything the library layer proves stops at this file's edge. The failure this
 * suite exists for is not subtle and is entirely invisible below it: **swap the two destructive
 * dialogs' `onConfirm` handlers** — so that confirming "delete my synced data" deletes the ACCOUNT
 * — and every other test in the repo stays green. Each case below presses a real row, confirms a
 * real dialog, and asserts which function ran.
 *
 * ⚠️ IT LIVES UNDER `src/__tests__/app/`, NOT BESIDE THE ROUTE. `web.output: "static"`
 * filesystem-scans the route tree and Metro's blockList does not filter that scan, so a co-located
 * `data.test.tsx` becomes a phantom route (`route-integrity.test.ts` asserts exactly that).
 */

const mockExportMyData = jest.fn();
const mockPurgeMyData = jest.fn();
const mockDeleteAccount = jest.fn();

jest.mock('expo-router', () => {
  const Stack = Object.assign(() => null, { Screen: () => null });
  return { Stack, useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }) };
});

// ⚠️ MOCKED AT THE LIBRARY BOUNDARY, WHICH IS WHERE THIS FILE'S QUESTION STOPS. What each function
// DOES is proven against a real worker (`sync.integration.test.ts`) and at the api boundary
// (`sync.test.ts`, `auth.test.ts`). What is proven only here is the wiring: which row calls which
// function, and what the reader is told about each of the four outcomes.
jest.mock('@/lib/sync', () => ({
  exportMyData: (...args: unknown[]) => mockExportMyData(...args),
  purgeMyData: (...args: unknown[]) => mockPurgeMyData(...args),
}));
jest.mock('@/lib/auth', () => ({
  deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
}));

/**
 * ⚠️ THE NATIVE `<Dialog>` IS NOT QUERYABLE IN JEST — it is a `UIAlertController` on iOS, an M3
 * `AlertDialog` on Android and a focus-trapped modal on web, and the swift-ui mock renders host
 * views rather than pressable RN nodes. `ConfirmDialog.test.tsx` uses exactly this stub for the
 * same reason. The stub exposes the TITLE as well as the buttons, so a case can assert WHICH
 * dialog opened — which is the whole point of a suite about two structurally identical
 * confirmations one row apart.
 */
jest.mock('@/components/ui/Dialog', () => ({
  Dialog: ({
    open,
    title,
    confirmText,
    cancelText,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    title: string;
    confirmText: string;
    cancelText: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) => {
    const react = require('react');
    const { Pressable, Text } = require('react-native');
    if (!open) return null;
    return react.createElement(
      Pressable,
      { testID: 'dialog' },
      react.createElement(Text, { testID: 'dialog-title' }, title),
      react.createElement(
        Pressable,
        { testID: 'dialog-confirm', onPress: onConfirm },
        react.createElement(Text, null, confirmText)
      ),
      react.createElement(
        Pressable,
        { testID: 'dialog-cancel', onPress: onCancel },
        react.createElement(Text, null, cancelText)
      )
    );
  },
}));

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import DataScreen from '@/app/(tabs)/(profile)/data';
import { isSyncEnabled, privacyStore, setSyncEnabled } from '@/lib/privacyPrefs';

beforeEach(() => {
  privacyStore.clearAll();
  jest.clearAllMocks();
  mockExportMyData.mockResolvedValue('shared');
  mockPurgeMyData.mockResolvedValue(undefined);
  mockDeleteAccount.mockResolvedValue({ status: 'deleted' });
});

/**
 * Press a row, assert the dialog it raised is the RIGHT one, then confirm it.
 *
 * The title assertion is not decoration: `visible={pending === 'purge'}` and
 * `visible={pending === 'delete-account'}` are one character apart, and a row wired to the wrong
 * `pending` value would open the other dialog and run the other handler with every mock still
 * satisfied.
 */
async function confirmRow(rowTestID: string, expectedTitle: RegExp) {
  await act(async () => {
    fireEvent.press(screen.getByTestId(rowTestID));
  });
  expect(screen.getByTestId('dialog-title')).toHaveTextContent(expectedTitle);
  await act(async () => {
    fireEvent.press(screen.getByTestId('dialog-confirm'));
  });
}

describe('each row runs its OWN action, and no other', () => {
  it('export runs the export and destroys nothing', async () => {
    render(<DataScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('export-data-row'));
    });
    expect(mockExportMyData).toHaveBeenCalledTimes(1);
    expect(mockPurgeMyData).not.toHaveBeenCalled();
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it('"delete my synced data" purges — and does NOT delete the account', async () => {
    // ⚠️ THE SWAPPED-HANDLER CASE. These two dialogs are structurally identical and one row apart;
    // confirming the milder one must never run the terminal one.
    render(<DataScreen />);
    await confirmRow('purge-data-row', /^Delete my synced data$/);
    expect(mockPurgeMyData).toHaveBeenCalledTimes(1);
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it('"delete my account" deletes the account — and does NOT merely purge', async () => {
    render(<DataScreen />);
    await confirmRow('delete-account-row', /^Delete my account$/);
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    expect(mockPurgeMyData).not.toHaveBeenCalled();
  });

  it('CANCELLING a dialog runs nothing at all', async () => {
    // Anti-vacuity for every case above: the confirmations must be real gates, not decoration.
    render(<DataScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('delete-account-row'));
    });
    expect(screen.getByTestId('dialog-title')).toHaveTextContent(/^Delete my account$/);
    await act(async () => {
      fireEvent.press(screen.getByTestId('dialog-cancel'));
    });
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });
});

describe('what the reader is told — one message per outcome', () => {
  it('a shared export says nothing at all — the share sheet already answered', async () => {
    render(<DataScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('export-data-row'));
    });
    expect(screen.queryByTestId('data-error')).toBeNull();
    expect(screen.queryByTestId('data-notice')).toBeNull();
  });

  it('`unavailable` is a NOTICE, not an error — retrying would not help', async () => {
    mockExportMyData.mockResolvedValue('unavailable');
    render(<DataScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('export-data-row'));
    });
    expect(screen.getByTestId('data-notice')).toBeTruthy();
    expect(screen.queryByTestId('data-error')).toBeNull();
  });

  it('a thrown export paints the error and no success notice', async () => {
    mockExportMyData.mockRejectedValue(new Error('sync: export refused (not-found)'));
    render(<DataScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('export-data-row'));
    });
    expect(screen.getByTestId('data-error')).toBeTruthy();
    expect(screen.queryByTestId('data-notice')).toBeNull();
  });

  it('a successful purge says the ACCOUNT is untouched — the whole point of FR28', async () => {
    render(<DataScreen />);
    await confirmRow('purge-data-row', /^Delete my synced data$/);
    expect(screen.getByTestId('data-notice')).toBeTruthy();
    expect(screen.getByText(/account is untouched/i)).toBeTruthy();
  });

  it('a failed purge says NOTHING was deleted, in the error slot', async () => {
    mockPurgeMyData.mockRejectedValue(new Error('sync: purge refused (internal)'));
    render(<DataScreen />);
    await confirmRow('purge-data-row', /^Delete my synced data$/);
    expect(screen.getByTestId('data-error')).toBeTruthy();
    expect(screen.queryByTestId('data-notice')).toBeNull();
  });

  it('`offline` gets its OWN message — "try again" is wrong advice with no network', async () => {
    mockDeleteAccount.mockResolvedValue({ status: 'offline' });
    render(<DataScreen />);
    await confirmRow('delete-account-row', /^Delete my account$/);
    expect(screen.getByText(/need a connection/i)).toBeTruthy();
    expect(screen.queryByTestId('data-notice')).toBeNull();
  });

  it('`failed` says nothing was changed, and is distinct from `offline`', async () => {
    mockDeleteAccount.mockResolvedValue({ status: 'failed', code: 'SESSION_EXPIRED' });
    render(<DataScreen />);
    await confirmRow('delete-account-row', /^Delete my account$/);
    expect(screen.getByTestId('data-error')).toBeTruthy();
    expect(screen.queryByText(/need a connection/i)).toBeNull();
  });

  it('`deleted` reports success and stays put, so the reader can read the answer', async () => {
    render(<DataScreen />);
    await confirmRow('delete-account-row', /^Delete my account$/);
    expect(screen.getByTestId('data-notice')).toBeTruthy();
    expect(screen.queryByTestId('data-error')).toBeNull();
  });
});

describe('the sync switch — the control that replaced a row which did not work', () => {
  it('is ON by default and is offered to a guest, who syncs exactly like anybody else', () => {
    // ⚠️ THE FACT THE DELETED CONSENT SCREEN MISSED. The anonymous session minted at boot syncs,
    // so a reader who has never signed in still has something to turn off. A row conditional on
    // being signed in would leave every guest with no control at all.
    render(<DataScreen />);
    expect(screen.getByTestId('sync-enabled-row')).toBeTruthy();
    // ⚠️ `isOn`, NOT `value`. The wrapper hands `@expo/ui`'s Switch through, and its SwiftUI-shaped
    // prop is what the rendered node carries — asserting `props.value` reads `undefined` and
    // `toBeTruthy()` on it would pass for a switch wired backwards.
    expect(screen.getByTestId('sync-enabled-switch').props.isOn).toBe(true);
  });

  it('writes the preference the data layer actually reads', () => {
    // The whole point: `lib/sync.ts` consults `isSyncEnabled()` in `prefetchSyncReads` and
    // `drainNow`, so this one write is what stops sync. `sync.test.ts` owns the other half.
    render(<DataScreen />);
    act(() => {
      fireEvent(screen.getByTestId('sync-enabled-switch'), 'valueChange', false);
    });
    expect(isSyncEnabled()).toBe(false);
  });

  it('turns back ON, and reflects the stored value on a later mount', () => {
    setSyncEnabled(false);
    render(<DataScreen />);
    expect(screen.getByTestId('sync-enabled-switch').props.isOn).toBe(false);

    act(() => {
      fireEvent(screen.getByTestId('sync-enabled-switch'), 'valueChange', true);
    });
    expect(isSyncEnabled()).toBe(true);
  });

  it('names both processors beside the switch — moved here from the sign-in screen', () => {
    // ⚠️ THIS SENTENCE USED TO SIT ABOVE THE PROVIDER BUTTONS and pushed them off an iPhone
    // (2026-08-26). Moving copy is how copy gets lost: `sign-in-disclosure.test.tsx` now asserts
    // only a one-line summary and a link, so if nothing asserted the detail HERE, deleting it
    // would leave both suites green and the reader with no way to learn who touches their data.
    // Naming a processor is a GDPR Art. 13 claim, not decoration — hence the two names, spelled.
    //
    // ⚠️ ASSERTED AS THE CLAIMS, NOT AS THE SENTENCE. The first cut of this case pinned the exact
    // wording, so the app-wide copy budget could not shorten a 268-character paragraph without
    // "breaking" a privacy test that was really a spelling test. What is load-bearing is that the
    // storer is named, that the no-sale promise is made, and that the reader is told the sign-in
    // provider does not learn what they read; the words that carry it are the copy budget's to cut.
    render(<DataScreen />);
    const processors = screen.getByTestId('sync-processors');
    expect(processors).toHaveTextContent(/Cloudflare/);
    expect(processors).toHaveTextContent(/never sold/i);
    expect(processors).toHaveTextContent(/sign-in provider/i);
    expect(processors).toHaveTextContent(/not what you read/i);
  });

  it('DESTROYS NOTHING — it is a preference, not one of the two destructive actions', () => {
    // ⚠️ THE ROW THIS REPLACED SIGNED THE READER OUT AND THEN LET A FRESH GUEST RE-PREFETCH. A
    // switch that quietly purged, deleted or signed out would be the same class of mistake with
    // the opposite sign.
    render(<DataScreen />);
    act(() => {
      fireEvent(screen.getByTestId('sync-enabled-switch'), 'valueChange', false);
    });
    expect(mockPurgeMyData).not.toHaveBeenCalled();
    expect(mockDeleteAccount).not.toHaveBeenCalled();
    expect(screen.queryByTestId('dialog')).toBeNull();
  });

  it('reports a failed write rather than moving on', () => {
    const set = jest.spyOn(privacyStore, 'set').mockImplementation(() => {
      throw new Error('store full');
    });
    try {
      render(<DataScreen />);
      act(() => {
        fireEvent(screen.getByTestId('sync-enabled-switch'), 'valueChange', false);
      });
      expect(screen.getByTestId('data-error')).toBeTruthy();
    } finally {
      set.mockRestore();
    }
  });
});

describe('the busy lock — one action at a time, or two erasures race', () => {
  it('disables every row while an action is in flight', async () => {
    // ⚠️ `disabled={busy !== null}` IS THE ONLY THING STOPPING AN EXPORT DURING A DELETION, and
    // nothing observed it. Deleting the prop leaves the whole suite green while a reader can start
    // an export against an account that is mid-deletion, and receive either a 401 or the personal
    // data of an account that no longer exists.
    let release: (() => void) | undefined;
    mockDeleteAccount.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ status: 'deleted' });
        })
    );
    render(<DataScreen />);
    await confirmRow('delete-account-row', /^Delete my account$/);

    // The deletion is still in flight: every row refuses, including the non-destructive one.
    expect(screen.getByTestId('export-data-row').props.accessibilityState?.disabled).toBe(true);
    await act(async () => {
      fireEvent.press(screen.getByTestId('export-data-row'));
      fireEvent.press(screen.getByTestId('purge-data-row'));
    });
    expect(mockExportMyData).not.toHaveBeenCalled();
    expect(mockPurgeMyData).not.toHaveBeenCalled();

    await act(async () => {
      release?.();
    });
    // Anti-vacuity: the lock releases, so this is a lock rather than a permanently dead screen.
    expect(screen.getByTestId('export-data-row').props.accessibilityState?.disabled).toBe(false);
  });
});
