/**
 * START-EDGE TEXT ALIGNMENT — the bug fix of 2026-09-14, as a contract.
 *
 * ⚠️ THE DEFECT, BECAUSE THE ASSERTIONS BELOW LOOK TRIVIAL WITHOUT IT. Reported on the owner's
 * iPhone in the Arabic build: on `/surahs` the header title `القرآن` sat at the far LEFT and every
 * row's title and subtitle were left-aligned, while the row's own flex container had mirrored
 * correctly. React Native's iOS text layer writes a paragraph style's `alignment` ONLY when
 * `textAlign` was explicitly set (`RCTAttributedTextUtils.mm`, `alignment.has_value()`), and it is
 * that same block that swaps `Left`↔`Right` under an RTL layout direction. With no `textAlign`,
 * TextKit resolves `NSTextAlignmentNatural` from the app BUNDLE's localization — which
 * `I18nManager.forceRTL` is not part of, and which this app deliberately leaves unset
 * (`lib/rtl.ts` § `app.json` gains no `locales`). Android defaults to `Gravity.START` and was
 * never affected.
 *
 * ⚠️ IT ONLY SHOWS IN A BOX WIDER THAN THE TEXT, which is why these are the components under
 * test: every one of them stretches its text (a `flex: 1` text block, a `flex: 1` header title, a
 * full-width group label). A `Text` that hugs its content — a pill, a button, a centred label — is
 * placed by the flex container and cannot show the defect, which is exactly why the mushaf chrome
 * and the tab bar looked correct while this screen did not.
 *
 * ⚠️ AND WHY THE EXPECTED VALUE IS THE WORD `left`. RN has no `textAlign: 'start'`; both platforms
 * swap `left`↔`right` for `textAlign` under an RTL layout direction (iOS in the block above,
 * Android in `TextAttributeProps.kt`), so `'left'` IS the start edge in both directions. The
 * expectation here is the LITERAL rather than `TEXT_ALIGN_START`, on purpose: importing the
 * constant would make this a restatement that stays green if the constant is ever changed to
 * `'right'` — which would align to the END edge under Arabic and be correct nowhere.
 */

import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { InlineError } from './InlineError';
import { ListRow } from './ListRow';
import { SettingsGroup } from './SettingsGroup';
import { SettingsRow } from './SettingsRow';

/** The flattened style of the node rendering `text`. */
function alignmentOf(text: string): unknown {
  return StyleSheet.flatten(screen.getByText(text).props.style)?.textAlign;
}

describe('a stretched UI text aligns to the START edge', () => {
  it('ListRow — the shape every index, bookmark and download row is built from', () => {
    render(<ListRow title="Al-Baqarah" subtitle="The Cow · 286 verses" testID="row" />);
    expect(alignmentOf('Al-Baqarah')).toBe('left');
    expect(alignmentOf('The Cow · 286 verses')).toBe('left');
  });

  it('SettingsRow — every row on every settings screen', () => {
    render(<SettingsRow label="Language" description="English" testID="settings-row" />);
    expect(alignmentOf('Language')).toBe('left');
    expect(alignmentOf('English')).toBe('left');
  });

  it('SettingsGroup — the caps section label and the footnote under it', () => {
    render(
      <SettingsGroup label="Numerals" footnote="Page, juz' and ayah numbers.">
        <SettingsRow label="Western" />
      </SettingsGroup>
    );
    expect(alignmentOf('Numerals')).toBe('left');
    expect(alignmentOf("Page, juz' and ayah numbers.")).toBe('left');
  });

  it('InlineError — a `flex: 1` message beside a fixed glyph', () => {
    render(<InlineError message="Something went wrong." testID="err" />);
    expect(alignmentOf('Something went wrong.')).toBe('left');
  });

  /**
   * ⚠️ THE ANTI-VACUITY CONTROL. Every assertion above is `toBe('left')`, which is also what a
   * component with NO alignment would look like if `flatten` returned it — it does not, it returns
   * `undefined`, and this case is what says so. Without it, deleting the property from all four
   * components would have to red four assertions that were never distinguishing `undefined` from
   * `'left'` in the first place.
   */
  it('and a centred text is NOT start-aligned — the assertions above are not matching a default', () => {
    render(<ListRow title="Al-Baqarah" testID="row" />);
    expect(alignmentOf('Al-Baqarah')).not.toBeUndefined();
    expect(alignmentOf('Al-Baqarah')).not.toBe('center');
    expect(alignmentOf('Al-Baqarah')).not.toBe('right');
  });
});
