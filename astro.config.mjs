// @ts-check
import { defineConfig } from 'astro/config';

/* Served from GitHub Pages at angelabyday.github.io/thrive-website/, so
   every built path starts with the repo name. */
export default defineConfig({
  site: 'https://angelabyday.github.io',
  base: '/thrive-website/',
});
