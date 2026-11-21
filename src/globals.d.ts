/**
 * Build-time constants. The bundler replaces every reference with its literal
 * (vite.config.ts for the client and the worker, vitest.config.ts for unit
 * tests), so a branch guarded by one of these is constant-folded and, when the
 * value is false, dropped from the bundle entirely.
 *
 * Never read them at runtime outside a bundler: a bare `node` import of a
 * module that uses one would throw.
 */

/** `PIXLE_TEST=1`: the offline/Playwright build. */
declare const __PIXLE_TEST__: boolean

/** `'fake' | 'local'` in tests and local dev, `'real'` (the default) otherwise. */
declare const __DAILY_JUDGE__: 'fake' | 'local' | 'real' | undefined

/**
 * The debug surface from the pre-launch review: POST /api/daily/reset,
 * POST /api/daily/debug-paintings, and the debug controls on the Daily,
 * gallery and studio screens. True for `vite serve` (the owner's dev server)
 * and the PIXLE_TEST build, false for a production build.
 */
declare const __DEBUG_TOOLS__: boolean
