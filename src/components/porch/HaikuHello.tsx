import { useContext, useEffect, useRef, useState } from 'react'
import { rectToPercent, type Rect } from '../../scene/camera'
import { SceneComposition } from '../../scene/PixelScene'
import { countHaikuVisit, haikuGreeting, readHaikuVisits, type HaikuFacts } from './haikuGreeting'

/**
 * The porch cat is Haiku, the judge, and says so: hover it, focus it or tap it and a speech bubble stands over him (the same bubble
 * as his others, in scene units on the cat's own rect, so it travels with the camera). The first time it is who he is; later visits
 * it is something about today. The bubble is a live region, so a keyboard user hears it too.
 */
export function HaikuHello({ rect, facts }: { rect: Rect; facts?: HaikuFacts }) {
  const composition = useContext(SceneComposition)
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const [tapped, setTapped] = useState(false)
  // Chosen the first time the bubble opens on this visit; it holds for the rest of it.
  const [line, setLine] = useState<string | null>(null)
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (tapTimer.current) clearTimeout(tapTimer.current) }, [])
  const reveal = () => {
    if (line !== null) return
    setLine(haikuGreeting(facts ?? {}, readHaikuVisits()))
    countHaikuVisit()
  }
  const open = (hover || focus || tapped) && line !== null
  return (
    <button
      type="button"
      className="pixel-hotspot porch-haiku"
      style={rectToPercent(rect, composition)}
      aria-label="Haiku, the cat who judges the Daily"
      onMouseEnter={() => { reveal(); setHover(true) }}
      onMouseLeave={() => setHover(false)}
      onFocus={(event) => { reveal(); if (event.currentTarget.matches(':focus-visible')) setFocus(true) }}
      onBlur={() => setFocus(false)}
      onKeyDown={(event) => { if (event.key === 'Escape') { setHover(false); setFocus(false); setTapped(false) } }}
      onClick={() => {
        reveal()
        setTapped(true)
        if (tapTimer.current) clearTimeout(tapTimer.current)
        tapTimer.current = setTimeout(() => setTapped(false), 4200)
      }}
    >
      {open && <span role="status" className="porch-haiku__bubble">{line}</span>}
    </button>
  )
}
