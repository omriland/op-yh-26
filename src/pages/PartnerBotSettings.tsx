import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { Ledger, LedgerRow } from '../components/ui/Ledger'
import { Skeleton } from '../components/ui/Skeleton'
import { TextField } from '../components/ui/TextField'
import { useToast } from '../components/ui/Toast'
import { isImpersonating } from '../lib/impersonationStash'
import {
  createPartnerClient,
  fetchPartnerClients,
  rotatePartnerClientSecret,
  type PartnerClient,
} from '../lib/partnerApi'
import { isTelegramBotUsername, normalizeTelegramBotUsername } from '../lib/partnerOAuth'

export function PartnerBotSettings() {
  const { show } = useToast()
  const viewingAsOther = isImpersonating()
  const [clients, setClients] = useState<PartnerClient[] | null>(null)
  const [appName, setAppName] = useState('')
  const [botUsername, setBotUsername] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [secretOnce, setSecretOnce] = useState<{
    title: string
    clientId: string
    secret: string
    authorizeUrl?: string
  } | null>(null)

  useEffect(() => {
    let active = true
    fetchPartnerClients().then((result) => {
      if (!active) return
      if (result.ok) setClients(result.clients)
      else setClients([])
    })
    return () => {
      active = false
    }
  }, [])

  async function onCreateClient() {
    if (viewingAsOther) {
      show('לא ניתן לרשום בוט בזמן התחזות.')
      return
    }
    const name = appName.trim()
    const bot = normalizeTelegramBotUsername(botUsername)
    if (!name) {
      setCreateError('יש להזין שם יישום.')
      return
    }
    if (!isTelegramBotUsername(bot)) {
      setCreateError('שם המשתמש של הבוט אינו תקין.')
      return
    }
    setCreating(true)
    setCreateError(null)
    const result = await createPartnerClient({ name, telegramBotUsername: bot })
    setCreating(false)
    if (!result.ok) {
      setCreateError(result.error)
      return
    }
    setAppName('')
    setBotUsername('')
    setSecretOnce({
      title: 'This token is shown only once',
      clientId: result.clientId,
      secret: result.clientSecret,
      authorizeUrl: result.authorizeUrl,
    })
    const listed = await fetchPartnerClients()
    if (listed.ok) setClients(listed.clients)
  }

  async function onRotateSecret(clientId: string) {
    if (viewingAsOther) {
      show('לא ניתן לרשום בוט בזמן התחזות.')
      return
    }
    const result = await rotatePartnerClientSecret(clientId)
    if (!result.ok) {
      show(result.error)
      return
    }
    setSecretOnce({
      title: 'The new token is shown only once',
      clientId,
      secret: result.clientSecret,
    })
  }

  return (
    <>
      {viewingAsOther ? (
        <p className="alert alert--info" role="status">
          צפייה כמשתמש — לא ניתן לרשום בוט.
        </p>
      ) : null}

      <section className="card stack-4">
        {clients === null ? (
          <Skeleton height={24} />
        ) : clients.length === 0 ? (
          <p className="t-body text-muted">עדיין לא רשום בוט.</p>
        ) : (
          <div className="stack-4">
            {clients.map((client) => (
              <div key={client.id} className="stack-3">
                <Ledger>
                  <LedgerRow label="שם" value={client.name} />
                  <LedgerRow label="מזהה" value={client.client_id} isolate />
                  <LedgerRow label="בוט" value={`@${client.telegram_bot_username}`} isolate />
                </Ledger>
                <Button
                  variant="secondary"
                  disabled={viewingAsOther}
                  onClick={() => void onRotateSecret(client.client_id)}
                >
                  חידוש טוקן
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="stack-3">
          <TextField
            label="שם היישום"
            required
            value={appName}
            onChange={(event) => setAppName(event.target.value)}
          />
          <TextField
            label="שם משתמש בטלגרם"
            hint="בלי @"
            isolate
            required
            value={botUsername}
            onChange={(event) => setBotUsername(event.target.value)}
          />
          {createError ? (
            <p className="alert alert--error" role="alert">
              {createError}
            </p>
          ) : null}
          <Button
            variant="secondary"
            disabled={viewingAsOther}
            loading={creating}
            loadingLabel="יוצר…"
            onClick={() => void onCreateClient()}
          >
            יצירת יישום
          </Button>
        </div>
      </section>

      <Dialog
        open={Boolean(secretOnce)}
        title={secretOnce?.title ?? 'App token'}
        lang="en"
        dir="ltr"
        closeLabel="Close"
        onClose={() => setSecretOnce(null)}
        footer={
          <Button variant="primary" onClick={() => setSecretOnce(null)}>
            Got it
          </Button>
        }
      >
        {secretOnce ? (
          <div className="stack-3">
            <p className="t-body text-secondary">
              Save the token with whoever is building the bot. Volunteers do not need it.
            </p>
            <Ledger>
              <LedgerRow label="Client ID" value={secretOnce.clientId} isolate />
              <LedgerRow label="Token" value={secretOnce.secret} isolate />
            </Ledger>
            {secretOnce.authorizeUrl ? (
              <p className="t-caption text-muted" style={{ overflowWrap: 'anywhere' }}>
                {secretOnce.authorizeUrl}
              </p>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </>
  )
}
