import { useNavigate } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { PorchScene } from '../components/porch/PorchScene'
import { useMute } from '../hooks/useMute'
import { seo } from '../seo'

export default function Landing() {
  const navigate = useNavigate()
  const { muted, toggle } = useMute()
  return <>
    <Seo {...seo} path="/" />
    <main data-testid="static-landing">
      <PorchScene landing easelState="signin" easelLabel="Play now" easelTestId="landing-play-now" easelText={<>Pixel Party<br />Play now</>}
        signedIn={false} topThree={[]} muted={muted} onEasel={() => navigate('/home')} onAccount={() => navigate('/home')} onToggleMute={toggle} />
      <section className="porch-landing-copy pp-panel">
        <h1>Draw together at Pixel Party</h1>
        <p>Paint a daily prompt in ten minutes, or join friends on a shared pixel canvas. An AI guesses your art and scores your best drawing.</p>
      </section>
    </main>
  </>
}
