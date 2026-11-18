import { studioSprites } from '../../scene/studio/sprites'
import { GuessFeed, type GuessFeedProps } from '../game/GuessFeed'
import { StudioSprite } from './StudioSprite'

export function CriticBubble(props: GuessFeedProps) {
  return (
    <div data-testid="critic-bubble" className="critic-bubble">
      <div className="critic-bubble__critic">
        <div className="critic-bubble__sprite-frame">
          <StudioSprite sprite={studioSprites.criticCat} scale={2} />
        </div>
        <div className="critic-bubble__caption">
          <span className="critic-bubble__role">Studio Critic</span>
          <span className="critic-bubble__hint">Watches the canvas live</span>
        </div>
        <span className="critic-bubble__tail" aria-hidden="true" />
      </div>
      <div className="critic-bubble__speech">
        <GuessFeed {...props} />
      </div>
    </div>
  )
}
