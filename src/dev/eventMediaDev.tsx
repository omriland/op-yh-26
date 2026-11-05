// DEV-ONLY harness: renders the REAL EventMediaGallery for an event that does not
// exist, so drag and drop, drafts and video previews can be tried without touching
// real events. Saving the שיוך התמונה step uploads, and that upload fails here
// (no such event). Served at /event-media-dev.html.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ToastProvider } from '../components/ui/Toast'
import { EventMediaGallery } from '../components/events/EventMediaGallery'
import '../index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <main className="page" style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
        <EventMediaGallery
          eventId="00000000-0000-4000-8000-000000000000"
          canWrite
          showEmptyCopy
          viewerId={null}
        />
      </main>
    </ToastProvider>
  </StrictMode>,
)
