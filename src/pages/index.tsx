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
        className="flex min-h-screen flex-col justify-between text-foreground"
      >
        {/* Top Header */}
        <header className="border-b border-border bg-card">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
            <span className="pp-logo text-[28px] leading-none sm:text-[32px]">
              {APP_NAME}
            </span>

            <nav className="flex items-center gap-3">
              <Link
                to="/party"
                className="px-3 py-1.5 text-lg uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
              >
                Party Mode
              </Link>
              <Link
                to="/home"
                className="pp-btn inline-flex items-center gap-1.5 px-3.5 py-1 text-lg uppercase tracking-wider"
              >
                <Play className="h-4 w-4 fill-current" aria-hidden />
                Daily Challenge
              </Link>
            </nav>
          </div>
        </header>

        {/* Main Hero */}
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-10 px-4 py-10 sm:px-6 lg:py-14">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
            {/* Hero Copy */}
            <div className="flex flex-col items-start text-left lg:col-span-7">
              <div className="pp-chip mb-3 inline-flex items-center gap-2 px-3 py-1 text-base uppercase tracking-wider">
                <Sparkles className="h-4 w-4 shrink-0 text-[var(--sunset-1)]" aria-hidden />
                <span>
                  Daily pixel-art challenge judged by Claude Haiku
                </span>
              </div>

              <div className="pp-logo mb-2 text-5xl leading-none sm:text-6xl">
                {APP_NAME}
              </div>

              <h1 className="mb-4 text-3xl uppercase leading-none tracking-wide text-foreground sm:text-5xl">
                One Daily Prompt. 10 Minutes. Beat the AI Judge.
              </h1>

              <p className="mb-7 max-w-xl text-xl leading-snug text-muted-foreground">
                One secret scene each day. Paint solo on a 32×32 canvas, get two-step Haiku grades, and keep your best score out of 1,000. Want company? Party Mode still has live co-op rooms.
              </p>

              <div className="flex flex-wrap items-center gap-3.5">
                <Link
                  to="/home"
                  data-testid="landing-play-now"
                  className="pp-btn inline-flex items-center gap-2.5 px-6 py-2.5 text-xl uppercase tracking-wider"
                >
                  <Play className="h-5 w-5 fill-current" aria-hidden />
                  Play today’s daily
                </Link>

                <Link
                  to="/party"
                  data-testid="landing-browse-lobby"
                  className="pp-chip inline-flex items-center gap-2 px-5 py-2.5 text-xl uppercase tracking-wider transition-colors hover:bg-secondary"
                >
                  Party Mode &amp; Co-op Rooms
                </Link>
              </div>
            </div>

            {/* Hero Visual: Miniature Pixel Art Frame + Live AI Guess Card */}
            <div className="flex flex-col items-center lg:col-span-5">
              <div className="pp-panel w-full max-w-sm p-4">
                <div className="mb-3 flex items-baseline justify-between text-lg text-[var(--soft-text)]">
                  <span>
                    DAILY: <span className="pp-word text-2xl uppercase">A MUSHROOM IN THE RAIN</span>
                  </span>
                  <span>BEST: 920 / 1000</span>
                </div>

                {/* 10x10 Sprite Preview */}
                <div className="pp-frame mx-auto w-full max-w-[240px]">
                  <div className="grid aspect-square w-full grid-cols-10 bg-white">
                    {HERO_SPRITE.flatMap((row, y) =>
                      row.map((colorIdx, x) => (
                        <div
                          key={`${x}-${y}`}
                          style={{ backgroundColor: PALETTE[colorIdx] }}
                          className="aspect-square w-full"
                        />
                      )),
                    )}
                  </div>
                </div>

                {/* Mock AI Guess Feed */}
                <div className="pp-panel mt-4 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xl uppercase text-[var(--sunset-2)]">
                      Haiku says
                    </span>
                    <span className="pp-chip text-sm uppercase">
                      920 / 1000
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="border border-[var(--sunset-1)] bg-secondary px-2 py-0.5 text-base text-[var(--sunset-1)]">
                      a red toadstool
                    </span>
                    <span className="pp-chip text-base text-foreground">
                      Fit 450 • Rec 390 • Spd 80
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Feature Pillars */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="pp-panel p-5">
              <div className="pp-chip mb-3 inline-flex h-10 w-10 items-center justify-center text-[var(--sunset-1)]">
                <Grid3X3 className="h-5 w-5" aria-hidden />
              </div>
              <h2 className="mb-1.5 text-xl uppercase tracking-wider text-[var(--sunset-2)]">
                1. One 10-Minute Daily Attempt
              </h2>
              <p className="text-base leading-snug text-muted-foreground">
                Press Start to reveal today&apos;s secret scene and paint solo on a 32×32 canvas with 15 bold arcade swatches.
              </p>
            </div>

            <div className="pp-panel p-5">
              <div className="pp-chip mb-3 inline-flex h-10 w-10 items-center justify-center text-[var(--sunset-2)]">
                <Bot className="h-5 w-5" aria-hidden />
              </div>
              <h2 className="mb-1.5 text-xl uppercase tracking-wider text-[var(--sunset-2)]">
                2. Two-Step Haiku Judging
              </h2>
              <p className="text-base leading-snug text-muted-foreground">
                Every 2 minutes—plus 3 Ask-nows—Haiku makes a blind guess from your pixels alone, then grades prompt fit and recognition.
              </p>
            </div>

            <div className="pp-panel p-5">
              <div className="pp-chip mb-3 inline-flex h-10 w-10 items-center justify-center text-[var(--sunset-3)]">
                <Trophy className="h-5 w-5" aria-hidden />
              </div>
              <h2 className="mb-1.5 text-xl uppercase tracking-wider text-[var(--sunset-2)]">
                3. Daily Leaderboard &amp; Party Mode
              </h2>
              <p className="text-base leading-snug text-muted-foreground">
                Your highest-scoring snapshot out of 1,000 counts for the daily leaderboard and your profile—plus live multiplayer boards in Party Mode!
              </p>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="border-t border-border bg-card py-4 text-center text-base text-muted-foreground">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 sm:px-6">
            <span className="pp-logo text-xl">{APP_NAME}</span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4 text-[var(--sunset-1)]" aria-hidden />
              Spectate free anytime • Sign in to place pixels
            </span>
          </div>
        </footer>
      </div>
    </>
  )
}
