import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PostHogErrorBoundary, PostHogProvider } from '@posthog/react'
import './index.css'
import './lib/bindAppViewport'
import { POSTHOG_TOKEN, posthogOptions } from './lib/posthog'
import App from './App.tsx'

const app = POSTHOG_TOKEN ? (
  <PostHogProvider apiKey={POSTHOG_TOKEN} options={posthogOptions}>
    <PostHogErrorBoundary
      fallback={
        <div className="shell" data-theme="field">
          <main className="shell__main">
            <p className="t-body">משהו השתבש. רעננו את העמוד ונסו שוב.</p>
          </main>
        </div>
      }
    >
      <App />
    </PostHogErrorBoundary>
  </PostHogProvider>
) : (
  <App />
)

createRoot(document.getElementById('root')!).render(<StrictMode>{app}</StrictMode>)
