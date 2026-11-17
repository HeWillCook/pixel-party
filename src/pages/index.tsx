/**
 * Static Landing Page — Pixel Party
 *
 * Lives at top-level src/pages/index.tsx so it renders with no DeepSpace
 * providers, no auth fetch, and no WebSocket connections on load.
 * Also prerendered to static HTML at build time via prerender.ts.
 */

import { Link } from 'react-router-dom'
import { Bot, Grid3X3, Play, Sparkles, Trophy, Users } from 'lucide-react'
import { Seo } from '../components/Seo'
import { APP_NAME } from '../constants'
import { PALETTE } from '../game/config'
import { seo } from '../seo'

// A 10x10 miniature mushroom pixel art sprite using PALETTE indices
const HERO_SPRITE: readonly number[][] = [
  [0, 0, 0, 4, 4, 4, 4, 0, 0, 0],
  [0, 0, 4, 4, 15, 15, 4, 4, 0, 0],
  [0, 4, 15, 4, 15, 15, 4, 4, 4, 0],
  [4, 4, 15, 4, 4, 4, 4, 15, 4, 4],
  [4, 4, 4, 4, 4, 4, 4, 15, 4, 4],
  [4, 1, 1, 1, 1, 1, 1, 1, 1, 4],
  [0, 0, 1, 15, 15, 15, 15, 1, 0, 0],
  [0, 0, 1, 15, 1, 1, 15, 1, 0, 0],
  [0, 0, 1, 15, 15, 15, 15, 1, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
]

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div
        data-testid="static-landing"
        className="flex min-h-screen flex-col justify-between bg-background text-foreground"
      >
        {/* Top Header */}
        <header className="border-b border-border/70 bg-card/50">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-2.5">
              <div className="grid h-7 w-7 grid-cols-2 gap-0.5 rounded-xs border border-amber-400/60 bg-slate-950 p-0.5">
                <span className="bg-red-500" />
                <span className="bg-amber-400" />
                <span className="bg-cyan-400" />
                <span className="bg-pink-500" />
              </div>
              <span className="font-pixel text-base font-extrabold uppercase tracking-wider text-foreground">
                {APP_NAME}
              </span>
            </div>

            <nav className="flex items-center gap-3">
              <Link
                to="/party"
                className="font-pixel rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
              >
                Party Mode
              </Link>
              <Link
                to="/home"
                className="arcade-btn font-pixel inline-flex items-center gap-1.5 rounded-md bg-amber-400 px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-950 hover:bg-amber-300"
              >
                <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
                Daily Challenge
              </Link>
            </nav>
          </div>
        </header>

        {/* Main Hero */}
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-12 px-4 py-12 sm:px-6 lg:py-16">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
            {/* Hero Copy */}
            <div className="flex flex-col items-start text-left lg:col-span-7">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-pink-500/40 bg-pink-500/15 px-3.5 py-1 text-xs font-bold text-pink-300">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                <span className="font-pixel uppercase tracking-wider">
                  Daily pixel-art challenge judged by Claude Haiku
                </span>
              </div>

              <h1 className="font-pixel mb-4 text-3xl font-extrabold uppercase leading-tight tracking-tight text-foreground sm:text-5xl">
                One Daily Prompt. 10 Minutes. Beat the AI Judge.
              </h1>

              <p className="mb-8 max-w-xl text-base text-muted-foreground sm:text-lg">
                Everyone gets the same daily scene to draw on a 32×32 pixel canvas. Claude Haiku makes a blind guess and scores your drawing out of 1,000 across prompt fit, recognition, and speed—or hop into Party Mode for live co-op rooms!
              </p>

              <div className="flex flex-wrap items-center gap-3.5">
                <Link
                  to="/home"
                  data-testid="landing-play-now"
                  className="arcade-btn font-pixel inline-flex items-center gap-2.5 rounded-lg bg-amber-400 px-6 py-3.5 text-sm font-extrabold uppercase tracking-wider text-slate-950 hover:bg-amber-300 sm:text-base"
                >
                  <Play className="h-5 w-5 fill-current" aria-hidden />
                  Play Today&apos;s Daily
                </Link>

                <Link
                  to="/party"
                  data-testid="landing-browse-lobby"
                  className="arcade-btn font-pixel inline-flex items-center gap-2 rounded-lg bg-secondary px-5 py-3.5 text-sm font-bold uppercase tracking-wider text-foreground hover:bg-secondary/80 sm:text-base"
                >
                  Party Mode &amp; Co-op Rooms
                </Link>
              </div>
            </div>

            {/* Hero Visual: Miniature Pixel Art Frame + Live AI Guess Card */}
            <div className="flex flex-col items-center lg:col-span-5">
              <div className="arcade-card w-full max-w-sm rounded-xl border-2 border-[#3b3166] bg-[#141024] p-4 shadow-2xl">
                <div className="mb-3 flex items-center justify-between text-xs">
                  <span className="font-pixel rounded bg-amber-400/20 px-2 py-0.5 font-bold uppercase text-amber-300">
                    Daily: A MUSHROOM IN THE RAIN
                  </span>
                  <span className="font-pixel text-muted-foreground">Best: 920 / 1000</span>
                </div>

                {/* 10x10 Sprite Preview */}
                <div className="mx-auto grid aspect-square w-full max-w-[240px] grid-cols-10 overflow-hidden rounded border-2 border-black bg-white p-1">
                  {HERO_SPRITE.flatMap((row, y) =>
                    row.map((colorIdx, x) => (
                      <div
                        key={`${x}-${y}`}
                        style={{ backgroundColor: PALETTE[colorIdx] }}
                        className="aspect-square w-full border-[0.5px] border-slate-200/40"
                      />
                    )),
                  )}
                </div>

                {/* Mock AI Guess Feed */}
                <div className="mt-3 rounded-lg border-2 border-pink-500/60 bg-[#1e1535] p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-pixel text-[11px] font-bold uppercase text-pink-300">
                      Haiku thinks:
                    </span>
                    <span className="font-pixel rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                      920 / 1000
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="font-pixel rounded border border-emerald-300 bg-emerald-500 px-2 py-0.5 text-xs font-extrabold text-slate-950">
                      a red toadstool
                    </span>
                    <span className="font-pixel rounded border border-pink-400/40 bg-pink-950/60 px-2 py-0.5 text-xs text-pink-200">
                      Fit 450 • Rec 390 • Spd 80
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Feature Pillars */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="arcade-card rounded-xl bg-card p-5">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-400/15 text-amber-300">
                <Grid3X3 className="h-5 w-5" aria-hidden />
              </div>
              <h2 className="font-pixel mb-1.5 text-sm font-extrabold uppercase tracking-wider text-foreground">
                1. One 10-Minute Daily Attempt
              </h2>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Press Start to reveal today&apos;s secret scene and paint solo on a 32×32 canvas with 15 bold arcade swatches.
              </p>
            </div>

            <div className="arcade-card rounded-xl bg-card p-5">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-pink-500/15 text-pink-300">
                <Bot className="h-5 w-5" aria-hidden />
              </div>
              <h2 className="font-pixel mb-1.5 text-sm font-extrabold uppercase tracking-wider text-foreground">
                2. Two-Step Haiku Judging
              </h2>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Every 2 minutes—plus 3 Ask-nows—Haiku makes a blind guess from your pixels alone, then grades prompt fit and recognition.
              </p>
            </div>

            <div className="arcade-card rounded-xl bg-card p-5">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
                <Trophy className="h-5 w-5" aria-hidden />
              </div>
              <h2 className="font-pixel mb-1.5 text-sm font-extrabold uppercase tracking-wider text-foreground">
                3. Daily Leaderboard &amp; Party Mode
              </h2>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Your highest-scoring snapshot out of 1,000 counts for the daily leaderboard and your profile—plus live multiplayer boards in Party Mode!
              </p>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="border-t border-border/60 bg-card/30 py-4 text-center text-xs text-muted-foreground">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 sm:px-6">
            <span className="font-pixel uppercase">{APP_NAME}</span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-cyan-400" aria-hidden />
              Spectate free anytime • Sign in to place pixels
            </span>
          </div>
        </footer>
      </div>
    </>
  )
}
