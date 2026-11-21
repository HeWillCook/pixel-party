import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import generouted from '@generouted/react-router/plugin'
import { cloudflare } from '@cloudflare/vite-plugin'
import checker from 'vite-plugin-checker'
import { deepspaceBuild } from 'deepspace/build'
import { prerender } from './prerender.ts'

const appDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ command }) => {
  // Real Haiku vision is the default everywhere, including `deepspace dev
  // start`, so local drawings are judged honestly. Only the Playwright /
  // integration flag (`PIXEL_PARTY_TEST=1`) and Vitest (which supplies its own
  // define) fall back to the fake judge.
  const dailyJudge = process.env.DAILY_JUDGE || (process.env.PIXEL_PARTY_TEST === '1' ? 'fake' : 'real')

  // `deepspace deploy` is the only thing that builds with DEEPSPACE_SITE_ORIGIN
  // (it runs `npx vite build` and sets it for canonical URLs — see the deploy
  // command in the CLI). CI's `npm run build` and the offline Playwright build
  // do not set it, so a test-only flag there is deliberate and allowed.
  const deployBuild = command === 'build' && Boolean(process.env.DEEPSPACE_SITE_ORIGIN)
  if (deployBuild && process.env.PIXEL_PARTY_TEST === '1') {
    throw new Error('[build] PIXEL_PARTY_TEST=1 must not be set for a deploy: it disables every AI call and exposes /api/__test/ready. Unset it and rebuild.')
  }
  if (deployBuild && process.env.DAILY_JUDGE) {
    throw new Error(`[build] DAILY_JUDGE=${process.env.DAILY_JUDGE} is a local/test override and must not be set for a deploy. Unset it and rebuild.`)
  }

  return {
    define: {
      __PIXEL_PARTY_TEST__: JSON.stringify(process.env.PIXEL_PARTY_TEST === '1'),
      __DAILY_JUDGE__: JSON.stringify(dailyJudge),
      // Debug routes (POST /api/daily/reset, /api/daily/debug-paintings) and the
      // debug controls on the Daily, gallery and studio screens exist in
      // `deepspace dev` and in the PIXEL_PARTY_TEST build the Playwright suites
      // run against. A production `vite build` folds this to false, so Rollup
      // drops the registrations and the controls from both bundles.
      __DEBUG_TOOLS__: JSON.stringify(command === 'serve' || process.env.PIXEL_PARTY_TEST === '1'),
    },
    plugins: [
    react(),
    generouted(),
    {
      // Excluding the route list from pre-bundling is not enough: Vite still serves any node_modules module requested as
      // `?v=<hash>` with `max-age=31536000,immutable`, and after a restart that URL is identical while the pages (and so the
      // route list the glob builds) may have moved. Serve that one module `no-cache` so the browser always revalidates it.
      name: 'route-list-no-immutable',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.includes('/@generouted/react-router/')) {
            const setHeader = res.setHeader.bind(res)
            res.setHeader = (name, value) => setHeader(name, name.toLowerCase() === 'cache-control' ? 'no-cache' : value)
          }
          next()
        })
      },
    },
    // The Cloudflare plugin otherwise searches for a free inspector port by
    // enumerating every network interface. Restricted agent containers can
    // reject that OS call (`uv_interface_addresses`) even when loopback is
    // available. Inspector debugging is optional, so disable that probe in
    // the generated app and keep local dev/test startup deterministic.
    cloudflare({
      inspectorPort: false,
      persistState: process.env.PIXEL_PARTY_TEST !== '1',
    }),
    // The app id `define`, the preview-secret cleanup, and the client dedupe
    // hint — all shipped by the SDK so a fix to any of them arrives with a
    // version bump, not an app edit. The app id is read from the wrangler
    // config THIS build targets (wrangler.toml, or the env-flattened config
    // `deepspace deploy --env` generates); src/constants.ts is the only
    // consumer.
    deepspaceBuild({ appDir }),
    // Prerenders the public pages listed in src/prerender-entry.tsx into static
    // HTML at `vite build`, stamps their <Seo> head, and writes sitemap.xml plus
    // the robots.txt Sitemap line from src/seo.ts — so crawlers that do not run
    // JavaScript read real content. See prerender.ts; delete this line for a
    // plain SPA.
    prerender(),
    // Runs the Rules of Hooks lint (see eslint.config.js) automatically, so
    // there's no separate step to remember: a violation surfaces as an overlay
    // during `deepspace dev start` and fails the build during `deepspace deploy`.
    // That stops the cryptic "Minified React error #310 / #300" crash before
    // it can ship.
    checker({
      eslint: {
        lintCommand: 'eslint .',
        useFlatConfig: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    // generouted loads routes via `import.meta.glob`, which Vite's esbuild dep-scanner
    // does not evaluate — so every dep reachable only through the page tree (UI libs,
    // and deepspace via _app.tsx) is invisible to the cold scan, discovered late, and
    // triggers a re-optimize + full reload on first `dev` boot. That reload is where a
    // transient "Cannot read properties of null (reading 'useState')" can surface before
    // the error boundary recovers. Point the scanner at the route files (plus the html
    // entry) so the first optimize pass is complete and no late re-optimize fires.
    // Scoped to src/pages (NOT all of src) so worker-only modules — actions, cron, jobs,
    // ai, which import deepspace/worker — are not dragged into the client optimizer.
    // Dev-only; `vite build` ignores optimizeDeps.
    entries: ['./index.html', './src/pages/**/*.tsx'],
    // The route list (built from that glob) must NOT be pre-bundled: pre-bundled deps are served `immutable` for a
    // year, so after a page moved the browser kept the old list and every navigation imported a deleted module.
    exclude: ['@generouted/react-router'],
  },
  }
})
