/**
 * Google's four-colour "G", as required on a Sign in with Google button.
 *
 * ⚠️ NOT AN ICON-REGISTRY ENTRY, and not an Ionicons glyph. `icon-registry.ts` is a SEMANTIC map
 * of the app's own iconography; a third-party mark whose geometry and colour are dictated by its
 * owner is not semantic and cannot be recoloured by a theme. Ionicons' `logo-google` is a
 * monochrome silhouette, which Google's branding guidelines forbid outright on this button.
 *
 * The paths are Google's own, at their 48×48 viewBox. Do not redraw, recolour or reproportion
 * them — the only sanctioned freedom is the size it renders at.
 */

import Svg, { Path } from 'react-native-svg';
import { GOOGLE_G } from '@/constants/brand';

export function GoogleGLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill={GOOGLE_G.blue}
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <Path
        fill={GOOGLE_G.green}
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <Path
        fill={GOOGLE_G.yellow}
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <Path
        fill={GOOGLE_G.red}
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </Svg>
  );
}
