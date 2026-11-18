/**
 * Example gated page. Reached at /settings — no auth logic lives here
 * because (protected)/_layout.tsx already wraps the subtree in <AuthGate>.
 */

import { signOut, useUser } from 'deepspace'
import { StudioSprite } from '@/components/play/StudioSprite'
import { Button } from '@/components/ui'
import { P } from '@/scene/palette'
import { defineSprite } from '@/scene/sprite'

const stampPalette = {
  d: P.wood[0],
  w: P.wood[2],
  h: P.wood[4],
  p: P.paper[4],
  c: P.paper[3],
  r: P.flame[0],
  s: P.sea[2],
  y: P.sun[4],
  g: P.foliage[2],
}

const postageStamp = defineSprite(
  [
    '.d.d.d.d.d.d.d.',
    'dpppppppppppppd',
    '.pcssssssssssp.',
    'dpcsppppppssspd',
    '.pcspyyyypssspd',
    'dpcspyyyypssspd',
    '.pcsssssssssspd',
    'dpcggggggggggpd',
    '.pcccccccccccc.',
    'dpppppppppppppd',
    '.d.d.d.d.d.d.d.',
  ],
  stampPalette,
)

const waxSeal = defineSprite(
  [
    '..dddd..',
    '.drrrrd.',
    'drrryrrd',
    'drryyyrd',
    'drrryrrd',
    '.drrrrd.',
    '..dddd..',
  ],
  stampPalette,
)

export default function SettingsPage() {
  const { user } = useUser()

  return (
    <div className="min-h-full text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="pp-word mb-6 text-4xl uppercase">Settings</h1>

        <article
          data-testid="settings-letter"
          className="pp-panel relative overflow-hidden p-0"
        >
          <div
            aria-hidden="true"
            className="h-2.5 w-full border-b-2 border-[#8e5960]"
            style={{
              backgroundImage: `repeating-linear-gradient(90deg, ${P.flame[0]} 0 14px, ${P.paper[4]} 14px 20px, ${P.sea[1]} 20px 34px, ${P.paper[4]} 34px 40px)`,
            }}
          />

          <div className="p-6 sm:p-8">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-dashed border-[#d1b5a3] pb-4">
              <div>
                <p className="text-sm uppercase tracking-widest text-[var(--soft-text)]">
                  From the porch mailbox
                </p>
                <h2 className="mt-1 text-3xl uppercase text-[var(--sunset-2)]">Your account</h2>
              </div>

              <div className="flex items-center gap-3">
                <span className="pp-chip px-2.5 py-1 text-sm uppercase tracking-wider">
                  Porch Post
                </span>
                <div className="border-2 border-[#8e5960] bg-[#fff0cc] p-1">
                  <StudioSprite sprite={postageStamp} scale={3} />
                </div>
              </div>
            </header>

            <dl className="mt-5 space-y-4 text-lg">
              <div className="border-b-2 border-[#d1b5a3] pb-2">
                <dt className="text-sm uppercase tracking-wider text-muted-foreground">Name</dt>
                <dd className="mt-0.5 text-2xl text-foreground">{user?.name || '—'}</dd>
              </div>
              <div className="border-b-2 border-[#d1b5a3] pb-2">
                <dt className="text-sm uppercase tracking-wider text-muted-foreground">Email</dt>
                <dd className="mt-0.5 break-all text-2xl text-foreground">{user?.email || '—'}</dd>
              </div>
            </dl>

            <footer className="mt-7 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 text-base text-[var(--soft-text)]">
                <StudioSprite sprite={waxSeal} scale={3} />
                <span>Stamped on the sunset porch</span>
              </div>

              <Button variant="secondary" className="pp-btn px-5 text-lg uppercase" onClick={() => signOut()}>
                Sign out
              </Button>
            </footer>
          </div>
        </article>
      </div>
    </div>
  )
}
