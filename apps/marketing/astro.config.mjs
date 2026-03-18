import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://cloudquran.app',
  output: 'static',
  integrations: [sitemap()],
});
