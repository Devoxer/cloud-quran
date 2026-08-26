import { ScrollViewStyleReset } from 'expo-router/html';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/* 
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native. 
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/* Using raw CSS styles as an escape-hatch to ensure the background color never flickers in dark-mode. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
        {/* Story 23.7 (AC-8): light web-only nav-pill alignment polish. */}
        <style dangerouslySetInnerHTML={{ __html: webNavPillPolish }} />
        {/* Favicon */}
        <link rel="icon" type="image/png" href="/assets/images/favicon.png" />

        {/* NO analytics beacon. This block previously injected Cloudflare Web Analytics
            using the wisdomfruits.com ZONE TOKEN, seeded verbatim by story 5-1 — so Cloud
            Quran's web traffic would have been reported into another product's RUM property.
            Cloud Quran ships zero third-party analytics, advertising or tracking SDKs
            (PRD NFR8/NFR28); opt-in, PII-scrubbed Sentry is the only exception, and it is not
            a page beacon. Do not re-add one here. */}
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackground = `
body {
  background-color: #fff;
}
@media (prefers-color-scheme: dark) {
  body {
    background-color: #000;
  }
}`;

// Story 23.7 (AC-8) — light web-only nav-pill alignment polish.
//
// On web, `<NativeTabs>` falls back to expo-router's Radix/react-tabs pill. The library
// CSS (`expo-router/assets/native-tabs.module.css` → `.navigationMenuRoot`) pins it at a
// fixed `top: 24px`, independent of the native Stack header, so it reads as not vertically
// centered in the ~64px header band. The CSS-module class is hashed, but the react-tabs
// `TabsList` carries a STABLE `aria-label="Main"` (`role="tablist"`) — target that.
//
// This is the deliberately LIGHT polish the story scopes (AC-8): a single vertical nudge so
// the pill sits centered in the standard web header band (40px pill in a ~64px header →
// top ≈ 12px). The wholesale web-chrome rework (suppress/restyle the header, sidebar) is
// the gated sidebar follow-up — NOT done here. Tune this one value in the web smoke if the
// header height differs.
//
// ⚠️ story 6-0 added the SECOND AND THIRD rules, and they are an accessibility fix rather than
// polish. The library CSS gives the keyboard focus ring `outline-color:
// var(--expo-router-tabs-tab-outline-color, #444444)`, and NOTHING in the app can reach that
// variable — `<NativeTabs>` exposes no prop that maps to it — so the hardcoded `#444444` shipped on
// every palette. Against our dark bars that is roughly 1.6:1: a keyboard user could not see which
// tab they were on.
//
// This file is static CSS rendered before hydration and has no access to the RN theme, so no token
// can be written here. It does not need to be: expo-router already publishes the LABEL colours as
// custom properties on the tabs root (from `labelStyle` — see `(tabs)/_layout.tsx`), and a custom
// property may be defined in terms of another. Pointing the outline at those makes the ring take
// the same colour as the label beside it, in every palette x scheme, and it cannot drift from that
// label because it IS that label's value. Both are already held against the bar in
// `palettes.contrast.test.ts`.
//
// ⚠️ NOT `currentColor`, which was the first attempt and measured BLACK. The library styles the
// label on an inner `<span>`, so the trigger's own `color` is whatever `<body>` inherits — about
// 1.06:1 on a dark pill, i.e. worse than the `#444444` this replaces. The fallbacks repeat the
// library's own defaults so a future upstream rename degrades to today's behaviour rather than to
// `invalid at computed-value time`.
//
// ⚠️ story 6-0's THIRD RULE — the `border` — IS A REGRESSION FIX FOR STORY 6-0 ITSELF, and it is
// the price of theming the pill at all. Widening the SURFACE group to web
// (`(tabs)/_layout.tsx`) replaced the library's hardcoded `#272727` with `background.secondary`.
// That is correct — the old grey ignored every palette — but `#272727` was also carrying the pill
// visually: it measured ~14:1 against a light page, and `.navigationMenuRoot` ships NO border and
// NO shadow. `background.secondary` against `background.primary` measures **1.11–1.24:1** across
// all six palettes × both schemes (terracotta·light 1.11), so the themed pill is very nearly
// invisible against the page it floats over. A surface that quiet needs an edge.
//
// The edge takes the LABEL colour for the same reason the outline does: `--expo-router-tabs-text-
// color` is `labelStyle.default.color`, i.e. `text.secondary`, which is already held at ≥4.5:1
// against BOTH `background.primary` and `background.secondary` in `palettes.contrast.test.ts` —
// comfortably past the 3:1 WCAG 1.4.11 asks of a non-text boundary, in every palette × scheme, and
// it cannot drift from the labels inside the pill because it IS their value. `box-sizing:
// border-box` is already on the rule, so the pill stays 40px tall.
//
// ⚠️ THIS FILE'S DEPENDENCE ON UPSTREAM IS INVISIBLE FROM UPSTREAM. Three custom-property names
// and the `[role="tablist"][aria-label="Main"]` selector are all read out of
// `expo-router/assets/native-tabs.module.css` and `NativeTabsView.web.js`; a rename there degrades
// every rule below to its hardcoded fallback with no error anywhere. `__tests__/app/
// web-nav-pill.test.ts` reads both this file and the installed stylesheet and fails when they stop
// agreeing.
const webNavPillPolish = `
[role="tablist"][aria-label="Main"] {
  top: 12px;
  border: 1px solid var(--expo-router-tabs-text-color, #8b8b8b);
  --expo-router-tabs-tab-outline-color: var(--expo-router-tabs-text-color, #8b8b8b);
}
[role="tablist"][aria-label="Main"] [data-state="active"] {
  --expo-router-tabs-tab-outline-color: var(--expo-router-tabs-active-text-color, #ffffff);
}`;
