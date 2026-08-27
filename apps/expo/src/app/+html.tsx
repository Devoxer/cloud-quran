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
        {/* Story 6-6: keyboard focus indicator for OUR chrome controls. */}
        <style dangerouslySetInnerHTML={{ __html: chromeFocusRing }} />
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

// Story 6-6 — the keyboard focus indicator for OUR chrome, replacing story 6-0's
// `webNavPillPolish` (which styled expo-router's web nav pill; the pill died with `NativeTabs`,
// and so did the three upstream custom-property names this file used to read out of its CSS).
//
// ⚠️ THE SUBJECT SURVIVES THE PILL: a keyboard user must be able to SEE which chrome control has
// focus, against every palette × scheme. The old fix pointed the library's outline variable at
// the label colour; our own components expose no such variable, and this file is static CSS
// rendered in Node before hydration — it has no access to the RN theme and can hold no token.
//
// So the ring is the classic TWO-TONE indicator instead: a white inner ring (outline) inside a
// black outer ring (box-shadow). No single static colour can clear a contrast floor against both
// light and dark bars — but for ANY surface luminance the WORSE of {white, black} bottoms out at
// ≈4.5:1 (at mid-grey), so at least one ring is always clearly visible, and the two rings sit at
// 21:1 against each other, so the pair reads as one crisp indicator on anything. That bound is
// MEASURED, not assumed: `__tests__/app/web-focus-ring.test.ts` computes both ratios against
// `background.secondary` (the bar the ring lands on) for all six palettes × both schemes.
//
// ⚠️ THE SELECTOR IS OUR OWN CONTRACT, NOT UPSTREAM'S. react-native-web maps `testID` to
// `data-testid`, and every interactive chrome control carries a `chrome-` testID prefix
// (`chrome-back`, `chrome-mode-toggle`, `chrome-tab-*` — see `AppHeader` / `AppTabBar` /
// `ReadingChrome`). The same test reads the component sources and fails if the prefix and this
// selector stop agreeing — the drift that would silently un-style the ring.
const chromeFocusRing = `
[data-testid^="chrome-"]:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 0px;
  box-shadow: 0 0 0 4px #000000;
}`;
