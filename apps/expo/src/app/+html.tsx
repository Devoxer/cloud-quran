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
const webNavPillPolish = `
[role="tablist"][aria-label="Main"] {
  top: 12px;
}`;
