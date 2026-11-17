import { Link } from 'react-router-dom'
import { APP_NAME } from '../constants'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <title>{`Not found · ${APP_NAME}`}</title>
      <meta name="robots" content="noindex" />
      <div className="pp-panel flex w-full max-w-md flex-col items-center p-8">
        <h1 className="pp-word mb-2 text-6xl uppercase leading-none">404</h1>
        <p className="mb-6 text-xl uppercase text-muted-foreground">Page not found</p>
        <Link
          to="/home"
          className="pp-btn px-6 py-2 text-lg uppercase tracking-wider"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}
