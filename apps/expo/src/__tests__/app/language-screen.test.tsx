/**
 * The interface-language picker (story 8-1) — and the ORDER that makes a switch land.
 *
 * ⚠️ THE ORDER IS THE WHOLE POINT OF THIS SUITE. `setLanguage` persists and then restarts the JS
 * context, and the fresh context evaluates `react-native`'s `I18nManager` — and FlashList's RTL
 * compensation with it — long before `app/_layout.tsx` can apply anything. So the native direction
 * preference has to be written BEFORE the switch, not after. Measured on a Pixel 9 Pro emulator
 * 2026-09-12: with the write on the far side of the reload, Arabic → English left the mushaf laid
 * out in the other direction's index order, i.e. a blank home surface that only a force-quit
 * cleared. Nothing else in the net can see that — the two calls are both made, both succeed, and
 * the app typechecks, lints and renders either way.
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';

import LanguageScreen from '@/app/(tabs)/(profile)/language';
import * as rtl from '@/lib/rtl';

// ⚠️ `mock`-prefixed: jest's factory guard allows only out-of-scope names that start with it.
const mockSetLanguage = jest.fn(() => Promise.resolve());

jest.mock('@/lib/language', () => {
  const actual = jest.requireActual<typeof import('@/lib/language')>('@/lib/language');
  return {
    ...actual,
    useLanguage: () => ({ language: 'en', setLanguage: mockSetLanguage }),
  };
});

/** Everything the switch touches, in the order it touched it. */
const calls: string[] = [];
let directionSpy: jest.SpyInstance;
let storedDirectionSpy: jest.SpyInstance;

beforeEach(() => {
  calls.length = 0;
  mockSetLanguage.mockReset().mockImplementation(() => {
    calls.push('setLanguage');
    return Promise.resolve();
  });
  directionSpy = jest
    .spyOn(rtl, 'applyDirectionForLanguage')
    .mockImplementation(() => void calls.push('applyDirectionForLanguage'));
  storedDirectionSpy = jest
    .spyOn(rtl, 'applyStoredDirection')
    .mockImplementation(() => void calls.push('applyStoredDirection'));
});

afterEach(() => {
  directionSpy.mockRestore();
  storedDirectionSpy.mockRestore();
});

describe('language picker', () => {
  it('offers exactly the exposed languages, labelled with their own endonyms', () => {
    const { getByTestId, queryByTestId } = render(<LanguageScreen />);
    expect(getByTestId('language-option-en')).toBeTruthy();
    expect(getByTestId('language-option-ar')).toBeTruthy();
    // `es`/`fr` bundles ship and must never be OFFERED — they are the other app's copy.
    expect(queryByTestId('language-option-es')).toBeNull();
    expect(queryByTestId('language-option-fr')).toBeNull();
    expect(getByTestId('language-option-ar').props.accessibilityLabel).toBe('العربية');
  });

  it('marks the language in force as selected, and only that one', () => {
    const { getByTestId } = render(<LanguageScreen />);
    expect(getByTestId('language-option-en').props.accessibilityState?.selected).toBe(true);
    expect(getByTestId('language-option-ar').props.accessibilityState?.selected).toBe(false);
  });

  it('applies the DIRECTION before it switches the language', async () => {
    const { getByTestId } = render(<LanguageScreen />);
    fireEvent.press(getByTestId('language-option-ar'));
    await waitFor(() => expect(mockSetLanguage).toHaveBeenCalledWith('ar'));
    expect(calls).toEqual(['applyDirectionForLanguage', 'setLanguage']);
    expect(directionSpy).toHaveBeenCalledWith('ar');
  });

  it('does nothing at all when the reader re-picks the language already in force', () => {
    const { getByTestId } = render(<LanguageScreen />);
    fireEvent.press(getByTestId('language-option-en'));
    expect(calls).toEqual([]);
  });

  it('stops spinning when the switch settles WITHOUT restarting the app', async () => {
    /**
     * ⚠️ THE PATH THAT LOOKS LIKE SUCCESS IS THE ONE THAT STRANDS THE READER. `setLanguage`
     * resolves and THEN reloads, so normally this screen is destroyed and the spinner goes with
     * it. But `reloadAppAsync` resolves without reloading where there is no `globalThis.expo`,
     * and REJECTS on Android with no current activity — in both cases the promise settles,
     * nothing restarts, and an unreleased `pending` leaves the row spinning forever with the
     * native preference already flipped. Under Jest the reload is a resolving stub, so this is
     * exactly that shape.
     */
    const { getByTestId, queryByTestId } = render(<LanguageScreen />);
    fireEvent.press(getByTestId('language-option-ar'));
    await waitFor(() => expect(mockSetLanguage).toHaveBeenCalled());
    await waitFor(() => expect(queryByTestId('language-option-ar-spinner')).toBeNull());
    // And it raises NO error: settling without a restart is not a failure. The footnote already
    // says the choice applies when the app restarts.
    expect(queryByTestId('language-error')).toBeNull();
  });

  it('rolls the direction back when the switch rejects', async () => {
    mockSetLanguage.mockImplementation(() => {
      calls.push('setLanguage');
      return Promise.reject(new Error('switch failed'));
    });
    const { getByTestId, findByTestId } = render(<LanguageScreen />);
    fireEvent.press(getByTestId('language-option-ar'));
    // The reader stays in the language they were in, so the native flag must not be left mirrored
    // for a language nobody is in — that state survives to the NEXT launch.
    await findByTestId('language-error');
    expect(calls).toEqual(['applyDirectionForLanguage', 'setLanguage', 'applyStoredDirection']);
  });
});
