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
              <strong>Pixle</strong>
              <span>Daily prompt &amp; live studio</span>
              <span className="porch-easel-action">Play now</span>
            </>
          }
          signedIn={false}
          muted={muted}
          onEasel={() => navigate('/home')}
          onSignIn={() => navigate('/home')}
          onSignOut={() => navigate('/home')}
          onToggleMute={toggle}
        />
        <section className="sr-only">
          <h1>Draw together at Pixle</h1>
          <p>Paint a daily prompt in five minutes, or join friends on a shared pixel canvas. Haiku the cat judges your art at the halfway mark and again at the final verdict — your best judgement counts.</p>
        </section>
      </main>
    </div>
  )
}
