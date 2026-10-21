import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SignalMaster Pro – Vite configuration
// `/api` is proxied to the FastAPI symbolic engine during development so that
// the browser only ever talks to a single origin (no CORS friction, and the
// production build can be served by FastAPI from the same origin).
//
// `SMP_STANDALONE=1 npm run build:standalone` produces one self-contained
// index.html (JS, CSS, fonts and charts inlined) that runs from a file:// or
// blob: URL with no server at all. The symbolic engine is unavailable in that
// mode, which the app already reports honestly.
export default defineConfig(() => {
  const standalone = process.env.SMP_STANDALONE === '1';

  return {
    base: './',
    plugins: [react(), ...(standalone ? [viteSingleFile({ removeViteModuleLoader: true })] : [])],
    define: standalone ? { 'import.meta.env.VITE_STANDALONE': JSON.stringify('1') } : undefined,
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      // The app is served through a proxied preview host, so the dev server must
      // accept it. This only relaxes the host *check*; it grants no extra access.
      allowedHosts: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
    preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
    build: {
      target: 'es2022',
      outDir: standalone ? 'dist-standalone' : 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 6000,
      // Inline images/fonts so the single-file build has no sibling requests.
      assetsInlineLimit: standalone ? Number.MAX_SAFE_INTEGER : 4096,
      cssCodeSplit: !standalone,
      rollupOptions: standalone
        ? { output: { inlineDynamicImports: true } }
        : {
            output: {
              // Plotly and KaTeX are large but rarely change; splitting them keeps
              // the application shell small and cache-friendly.
              manualChunks: {
                plotly: ['plotly.js-basic-dist-min'],
                katex: ['katex'],
                react: ['react', 'react-dom', 'react-router-dom'],
              },
            },
          },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/tests/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
    },
  } as unknown as UserConfig;
});
