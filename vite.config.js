import { defineConfig } from 'vite';

// Relative base so the built site works under the /<repo-name>/ subpath that
// GitHub Pages serves a project site from. Do not give asset paths a leading /.
export default defineConfig({
  base: './'
});
