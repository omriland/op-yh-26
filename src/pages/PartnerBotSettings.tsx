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
  deletePartnerClient,
  fetchPartnerClients,
  rotatePartnerClientSecret,
  setPartnerClientWebhook,
  type PartnerClient,
} from '../lib/partnerApi'
import {
  isHttpsWebhookUrl,
  isTelegramBotUsername,
  normalizeTelegramBotUsername,
} from '../lib/partnerOAuth'

export function PartnerBotSettings() {
  const { show } = useToast()
  const viewingAsOther = isImpersonating()
  const [clients, setClients] = useState<PartnerClient[] | null>(null)
  const [appName, setAppName] = useState('')
  const [botUsername, setBotUsername] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [deleteClient, setDeleteClient] = useState<PartnerClient | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [secretOnce, setSecretOnce] = useState<{
    title: string
    clientId: string
    secret: string
    authorizeUrl?: string
  } | null>(null)
  const [webhookDrafts, setWebhookDrafts] = useState<Record<string, string>>({})
  const [webhookErrors, setWebhookErrors] = useState<Record<string, string>>({})
  const [webhookSaving, setWebhookSaving] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let active = true
    fetchPartnerClients().then((result) => {
      if (!active) return
      if (result.ok) {
        setClients(result.clients)
        setWebhookDrafts(
          Object.fromEntries(result.clients.map((c) => [c.client_id, c.webhook_url ?? ''])),
        )
        setListError(null)
      } else {
        setClients([])
        setListError(result.error)
      }
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
    if (listed.ok) {
      setClients(listed.clients)
      setWebhookDrafts(
        Object.fromEntries(listed.clients.map((c) => [c.client_id, c.webhook_url ?? ''])),
      )
    }
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

  async function onDeleteClient() {
    if (!deleteClient) return
    if (viewingAsOther) {
      show('לא ניתן לרשום בוט בזמן התחזות.')
      return
    }
    setDeleting(true)
    const result = await deletePartnerClient(deleteClient.client_id)
    setDeleting(false)
    if (!result.ok) {
      show(result.error)
      return
    }
    setClients((current) => (current ?? []).filter((row) => row.id !== deleteClient.id))
    setDeleteClient(null)
    show('הבוט הוסר')
  }

  async function onSaveWebhook(clientId: string) {
    if (viewingAsOther) {
      show('לא ניתן לרשום בוט בזמן התחזות.')
      return
    }
    const url = (webhookDrafts[clientId] ?? '').trim()
    if (url && !isHttpsWebhookUrl(url)) {
      setWebhookErrors((current) => ({
        ...current,
        [clientId]: 'כתובת ה-webhook חייבת להתחיל ב-https://.',
      }))
      return
    }
    setWebhookErrors((current) => {
      const next = { ...current }
      delete next[clientId]
      return next
    })
    setWebhookSaving((current) => ({ ...current, [clientId]: true }))
    const result = await setPartnerClientWebhook({ clientId, webhookUrl: url })
    setWebhookSaving((current) => ({ ...current, [clientId]: false }))
    if (!result.ok) {
      setWebhookErrors((current) => ({ ...current, [clientId]: result.error }))
      return
    }
    setClients((current) =>
      (current ?? []).map((client) =>
        client.client_id === clientId ? { ...client, webhook_url: result.webhookUrl } : client,
      ),
    )
    setWebhookDrafts((current) => ({ ...current, [clientId]: result.webhookUrl ?? '' }))
    if (result.webhookSecret) {
      setSecretOnce({
        title: 'The new webhook secret is shown only once',
        clientId,
        secret: result.webhookSecret,
      })
    } else {
      show('ה-webhook הוסר')
    }
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
        ) : listError ? (
          <p className="t-body text-muted">{listError}</p>
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
                <Button
                  variant="destructive"
                  disabled={viewingAsOther}
                  onClick={() => setDeleteClient(client)}
                >
                  הסרה
                </Button>
                <TextField
                  label="Webhook URL"
                  hint="https://... — ריק כדי לבטל"
                  isolate
                  value={webhookDrafts[client.client_id] ?? ''}
                  onChange={(event) =>
                    setWebhookDrafts((current) => ({
                      ...current,
                      [client.client_id]: event.target.value,
                    }))
                  }
                />
                {webhookErrors[client.client_id] ? (
                  <p className="alert alert--error" role="alert">
                    {webhookErrors[client.client_id]}
                  </p>
                ) : null}
                <Button
                  variant="secondary"
                  disabled={viewingAsOther}
                  loading={webhookSaving[client.client_id] ?? false}
                  loadingLabel="שומר…"
                  onClick={() => void onSaveWebhook(client.client_id)}
                >
                  שמירת Webhook
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
      <Dialog
        open={Boolean(deleteClient)}
        title="להסיר את הבוט?"
        onClose={() => !deleting && setDeleteClient(null)}
        footer={
          <>
            <Button
              variant="destructive"
              loading={deleting}
              loadingLabel="מסיר…"
              onClick={() => void onDeleteClient()}
            >
              הסרה
            </Button>
            <Button
              variant="secondary"
              disabled={deleting}
              onClick={() => setDeleteClient(null)}
            >
              ביטול
            </Button>
          </>
        }
      >
        <p className="t-body">
          החיבורים הקיימים יבוטלו. אפשר לרשום את אותו בוט מחדש אחר כך.
        </p>
      </Dialog>
    </>
  )
}
