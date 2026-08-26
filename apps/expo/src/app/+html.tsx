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
const webNavPillPolish = `
[role="tablist"][aria-label="Main"] {
  top: 12px;
  --expo-router-tabs-tab-outline-color: var(--expo-router-tabs-text-color, #8b8b8b);
}
[role="tablist"][aria-label="Main"] [data-state="active"] {
  --expo-router-tabs-tab-outline-color: var(--expo-router-tabs-active-text-color, #ffffff);
}`;
