import { useNavigate } from 'react-router-dom'
import { StaticPorchNav } from '../components/Navigation'
import { Seo } from '../components/Seo'
import { PorchScene } from '../components/porch/PorchScene'
import { useMute } from '../hooks/useMute'
import { seo } from '../seo'

export default function Landing() {
  const navigate = useNavigate()
  const { muted, toggle } = useMute()
  return (
    <div className="porch-shell porch-shell--landing">
      <Seo {...seo} path="/" />
      <StaticPorchNav />
      <main data-testid="static-landing">
        <PorchScene
          landing
          easelState="signin"
          easelLabel="Play now"
          easelTestId="landing-play-now"
          easelText={
            <>
              <strong>Pixel Party</strong>
              <span>Daily prompt &amp; live studio</span>
              <span className="porch-easel-action">Play now</span>
            </>
          }
          signedIn={false}
          topThree={[]}
          muted={muted}
          onEasel={() => navigate('/home')}
          onAccount={() => navigate('/home')}
          onToggleMute={toggle}
        />
        <section className="porch-landing-copy pp-panel">
          <h1>Draw together at Pixel Party</h1>
          <p>Paint a daily prompt in ten minutes, or join friends on a shared pixel canvas. Haiku the cat guesses your art and scores your best drawing.</p>
        </section>
      </main>
    </div>
  )
}
