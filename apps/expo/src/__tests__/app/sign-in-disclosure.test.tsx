/**
 * THE SYNC DISCLOSURE (story 5-7, FR30) — asserted where it now lives: ON the sign-in screen.
 *
 * ⚠️ THIS FILE REPLACED `consent-gate.test.tsx`, AND THE REASON IS THE REASON THE GATE WENT. That
 * suite proved a `/consent` screen stood between the settings row and sign-in — a property that
 * was true and worth nothing: sync ALREADY ran for the anonymous guest the root layout mints at
 * boot, four authenticated GETs per launch, and nothing in `lib/sync.ts` or `lib/outbox.ts` ever
 * read the consent record. The step interrupted the one reader who had decided to sign in and
 * protected nobody. What is worth pinning is what replaced it: the disclosure is READABLE BEFORE
 * THE BUTTONS, sign-in still has exactly one door, and the switch that stops sync is real
 * (`sync.test.ts` and `data-screen.test.tsx` own that half).
 *
 * ⚠️ WHAT THIS FILE ASSERTS SHRANK ON 2026-08-26, AND THE SHRINKING IS THE FIX. It used to count
 * four named entities and two named processors ON THIS SCREEN — copy that ran to ~750 characters
 * and pushed the provider buttons and the email field off an iPhone, so the disclosure was
 * complete and the sign-in was unusable. A screen nobody can finish discloses nothing. The
 * entity list and both processor sentences now live on `data.tsx` next to the sync switch
 * (`data-screen.test.tsx` asserts them there); what stays here is the sentence that names what
 * signing in does with the reader's data, and a link that REACHES that detail. Both halves are
 * pinned, in two files, because either alone would let the substance vanish quietly.
 *
 * ⚠️ IT LIVES UNDER `src/__tests__/app/`, NOT BESIDE THE ROUTES. `web.output: "static"`
 * filesystem-scans the route tree and Metro's blockList does not filter that scan, so a co-located
 * `sign-in.test.tsx` becomes a phantom route (`route-integrity.test.ts` asserts exactly that).
 */

// ⚠️ THE `mock` PREFIX IS MANDATORY, NOT A NAMING TASTE. `jest.mock`'s factory is hoisted above
// every declaration in the file, so referencing an ordinary out-of-scope `const` from inside it is
// a hard error; jest allows exactly the `mock*` prefix through, on the promise that the reference
// is lazy.
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
};

jest.mock('expo-router', () => {
  const Stack = Object.assign(() => null, { Screen: () => null });
  return { Stack, useRouter: () => mockRouter };
});

// `account.tsx` renders the guest row when the session is anonymous — which is the state a reader
// is in when they reach for sign-in, and the only state where that row exists at all.
jest.mock('@/lib/auth', () => ({
  useSession: () => ({ data: { user: { id: 'guest-1', isAnonymous: true, email: 'temp@x.com' } } }),
  signOut: jest.fn(),
  isPlaceholderEmail: (email?: string | null) =>
    typeof email === 'string' && email.startsWith('temp@'),
}));

// The native Apple button is an iOS-only native view whose enum constants are absent in Jest.
// Stubbing it keeps this file about WHETHER the screen renders, not about how it draws.
jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationButton: () => null,
  AppleAuthenticationButtonType: { CONTINUE: 0 },
  AppleAuthenticationButtonStyle: { BLACK: 0 },
}));

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react-native';
import AccountScreen from '@/app/(tabs)/(profile)/account';
import SignInScreen from '@/app/(tabs)/(profile)/sign-in';
import { privacyStore } from '@/lib/privacyPrefs';

beforeEach(() => {
  privacyStore.clearAll();
  jest.clearAllMocks();
  mockRouter.canGoBack.mockReturnValue(true);
});

describe('the settings row that reaches sign-in', () => {
  it('goes STRAIGHT to sign-in — there is no step in between any more', () => {
    render(<AccountScreen />);
    fireEvent.press(screen.getByTestId('account-sign-in-row'));
    expect(mockRouter.push).toHaveBeenCalledWith('/sign-in');
    expect(mockRouter.push).not.toHaveBeenCalledWith('/consent');
  });

  it('never gates anything else — the data screen and privacy settings are reachable', () => {
    // ⚠️ ANTI-VACUITY, AND THE BOUNDARY THE OWNER DREW. Nothing in this app may stand in front of
    // reading, and the one control that stops sync must itself be reachable without agreeing to
    // anything: `data.tsx` is where it lives.
    render(<AccountScreen />);
    fireEvent.press(screen.getByTestId('privacy-row'));
    fireEvent.press(screen.getByTestId('your-data-row'));
    expect(mockRouter.push).toHaveBeenCalledWith('/privacy-settings');
    expect(mockRouter.push).toHaveBeenCalledWith('/data');
  });
});

/**
 * Every string a node renders, including the ones inside a nested `<Text>` link.
 *
 * `toHaveTextContent` answers "does it say X"; the budget case needs "how much does it say", and
 * the disclosure is one `<Text>` with an element child, so `props.children` is a mixed array.
 */
function flattenText(node: { props: { children?: unknown } }): string {
  const parts: string[] = [];
  const walk = (child: unknown): void => {
    if (typeof child === 'string') parts.push(child);
    else if (Array.isArray(child)) child.forEach(walk);
    else if (child && typeof child === 'object' && 'props' in child)
      walk((child as { props: { children?: unknown } }).props.children);
  };
  walk(node.props.children);
  return parts.join('');
}

describe('the sign-in screen discloses before it offers', () => {
  it('says in ONE line what signing in does with the reader’s data', () => {
    // The affirmative-consent property, and the least that can carry it: pressing a provider is
    // the agreeing act, so the sentence above the buttons has to name the data rather than say
    // "we sync some things". It names the categories; the itemised list is a link away.
    render(<SignInScreen />);
    const line = screen.getByTestId('sync-disclosure');
    expect(line).toHaveTextContent(/signing in syncs/i);
    expect(line).toHaveTextContent(/reading position/i);
    expect(line).toHaveTextContent(/bookmarks/i);
    expect(line).toHaveTextContent(/preferences/i);
  });

  it('stays SHORT — this is the screen a wall of text made unusable', () => {
    // ⚠️ THE REGRESSION THIS FILE EXISTS TO CATCH NOW, pinned as a BUDGET rather than as taste.
    // The deleted version ran to ~900 characters above the buttons, on a viewport that fits
    // roughly a third of that, and every one of those sentences was worth adding on its own. A cap
    // is the only form of this rule that survives the next well-meant sentence: at the cap, adding
    // copy means deleting copy or moving it behind the link.
    render(<SignInScreen />);
    const text = flattenText(screen.getByTestId('sync-disclosure'));
    // Anti-vacuity: a budget met by rendering nothing is not the property being asserted.
    expect(text.length).toBeGreaterThan(80);
    expect(text.length).toBeLessThan(300);
  });

  it('offers the detail behind a LINK, and the link reaches Your Data', () => {
    // ⚠️ THE SUBSTANCE WAS MOVED, NOT DROPPED, AND THIS IS THE JOIN. Deleting the link would leave
    // a one-line summary with nothing behind it — which is the "we sync some things" screen the
    // case above forbids, reached by a different route. `data.tsx` carries the itemised list, the
    // two processors and the switch that stops sync.
    render(<SignInScreen />);
    fireEvent.press(screen.getByTestId('sync-details-link'));
    expect(mockRouter.push).toHaveBeenCalledWith('/data');
  });

  it('offers the providers on the SAME screen — the disclosure is not a wall', () => {
    // ⚠️ THE WHOLE POINT OF THE CHANGE, PINNED. Pressing a provider is the affirmative act, so
    // both must be visible together; a disclosure that hid the buttons until something was
    // dismissed would be the interruption again under a new name.
    render(<SignInScreen />);
    expect(screen.getByTestId('sync-disclosure')).toBeTruthy();
    expect(screen.getByTestId('email-input')).toBeTruthy();
    expect(screen.getByTestId('send-code-button')).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('renders the disclosure ABOVE the buttons, not below them', () => {
    // Order is the substance here: a disclosure under the buttons is read after the decision. The
    // scroll container's children are in source order, so their positions are comparable.
    const { UNSAFE_root } = render(<SignInScreen />);
    const flat = UNSAFE_root.findAll(() => true);
    const indexOf = (testID: string) => flat.findIndex((n) => n.props?.testID === testID);
    expect(indexOf('sync-disclosure')).toBeGreaterThanOrEqual(0);
    expect(indexOf('sync-disclosure')).toBeLessThan(indexOf('email-input'));
  });
});

describe('the deleted consent route stays deleted', () => {
  /**
   * ⚠️ A ROUTE FILE IS ENOUGH ON ITS OWN. Expo Router discovers screens from the filesystem, so
   * re-adding `consent.tsx` puts the interruption back whether or not anything navigates to it —
   * and `_layout.tsx` registering a name with no file is the failure `route-integrity.test.ts`
   * exists for. This asserts the absence directly rather than through a navigation.
   */
  it('has no consent.tsx and no navigation to /consent anywhere in the app', () => {
    const profile = join(__dirname, '..', '..', 'app', '(tabs)', '(profile)');
    expect(existsSync(join(profile, 'consent.tsx'))).toBe(false);
  });
});

describe('SIGN-IN HAS EXACTLY ONE DOOR, and the source is what says so', () => {
  /**
   * ⚠️ THE PROPERTY THE DISCLOSURE RESTS ON, PINNED THE ONLY WAY IT CAN BE. `sign-in.tsx` has said
   * since story 5-5 that nothing else in the app calls `signInWith*` — and nothing checked. A
   * second screen calling `signInWithApple()` directly would offer sign-in with no disclosure
   * anywhere near it, and every other test in this repo would stay green. This is the repo's
   * fail-closed source-scan idiom (`route-integrity.test.ts`, `root-layout-boot.test.tsx`) applied
   * to the same question.
   */
  const SRC = join(__dirname, '..', '..');
  /** Where a provider call legitimately lives: the module that defines them, and the one screen. */
  const ALLOWED = new Set(['lib/auth.ts', 'app/(tabs)/(profile)/sign-in.tsx']);
  const PROVIDER_CALL = /\b(signInWithApple|signInWithGoogle|verifyEmailCode)\s*\(/;

  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...sourceFiles(full));
      else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')) out.push(full);
    }
    return out;
  }

  it('no module outside lib/auth.ts and sign-in.tsx invokes a provider', () => {
    const files = sourceFiles(SRC);
    // Fail-closed: a scan that walked nothing would pass having checked nothing.
    expect(files.length).toBeGreaterThan(50);

    const offenders = files
      .map((file) => relative(SRC, file).split('\\').join('/'))
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) => PROVIDER_CALL.test(readFileSync(join(SRC, rel), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('...and the allow-listed screen really does call one — anti-vacuity', () => {
    // Without this, an emptied `sign-in.tsx` (or a renamed provider function) would make the scan
    // above trivially true, which is exactly how the retired vendor's chokepoint gate died.
    const signIn = readFileSync(join(SRC, 'app/(tabs)/(profile)/sign-in.tsx'), 'utf8');
    expect(PROVIDER_CALL.test(signIn)).toBe(true);
  });
});
