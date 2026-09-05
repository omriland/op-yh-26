import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  jsonResponse as json,
  runWithCors,
} from "../_shared/cors.ts";
import {
  constantTimeEqual,
  hmacSha256Hex,
  randomAccessToken,
  randomClientId,
  randomClientSecret,
  randomStartParam,
  randomWebhookSecret,
  sha256Hex,
} from "../_shared/partnerCrypto.ts";

const ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-yahpaz-partner-token";
const CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const SCOPE = "responder:fill";
const GENERIC_CLIENT_ERROR = "יישום או טוקן אינם תקינים.";

type JsonBody = Record<string, unknown>;

function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBotUsername(raw: string): string {
  return raw.trim().replace(/^@/, "");
}

function isBotUsername(raw: string): boolean {
  return /^[A-Za-z0-9_]{5,32}$/.test(raw);
}

function redirectUriForBot(botUsername: string): string {
  return `https://t.me/${normalizeBotUsername(botUsername)}`;
}

function redirectUriMatchesClient(redirectUri: string, botUsername: string): boolean {
  const expected = redirectUriForBot(botUsername).toLowerCase();
  try {
    const url = new URL(redirectUri.trim());
    if (url.protocol !== "https:") return false;
    if (url.hostname.toLowerCase() !== "t.me") return false;
    const path = url.pathname.replace(/\/+$/, "");
    const expectedPath = new URL(expected).pathname.replace(/\/+$/, "");
    return path.toLowerCase() === expectedPath.toLowerCase() && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function telegramStartRedirect(botUsername: string, startParam: string): string {
  const url = new URL(redirectUriForBot(botUsername));
  url.searchParams.set("start", startParam);
  return url.toString();
}

function env(): { url: string; anon: string; service: string } | null {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return null;
  return { url, anon, service };
}

function adminClient(url: string, service: string): SupabaseClient {
  return createClient(url, service);
}

async function userFromRequest(
  req: Request,
  url: string,
  anon: string,
): Promise<{ id: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token || token.startsWith("ypat_")) return null;
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();
  if (error || !user) return null;
  return { id: user.id };
}

async function requireActiveProfile(
  admin: SupabaseClient,
  userId: string,
): Promise<{ ok: true; fullName: string } | { ok: false; response: Response }> {
  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, active")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) {
    return { ok: false, response: json(401, { error: "יש להתחבר מחדש." }) };
  }
  if (!data.active) {
    return { ok: false, response: json(403, { error: "החשבון אינו פעיל." }) };
  }
  return { ok: true, fullName: String(data.full_name ?? "") };
}

async function requireAdmin(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await admin.rpc("has_role", { uid: userId, r: "admin" });
  return data === true;
}

type ClientRow = {
  id: string;
  name: string;
  client_id: string;
  client_secret_hash: string;
  telegram_bot_username: string;
  is_active: boolean;
};

async function findClientByPublicId(
  admin: SupabaseClient,
  clientId: string,
): Promise<ClientRow | null> {
  const { data } = await admin
    .from("oauth_clients")
    .select("id, name, client_id, client_secret_hash, telegram_bot_username, is_active")
    .eq("client_id", clientId)
    .maybeSingle();
  return (data as ClientRow | null) ?? null;
}

async function verifyClientSecret(client: ClientRow, secret: string): Promise<boolean> {
  if (!client.is_active || !secret) return false;
  const hash = await sha256Hex(secret);
  return constantTimeEqual(hash, client.client_secret_hash);
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req, ALLOW_HEADERS);
  return runWithCors(corsHeaders, async () => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
      return json(405, { error: "שיטת הבקשה אינה נתמכת." });
    }

    const cfg = env();
    if (!cfg) return json(500, { error: "השירות אינו מוגדר." });
    const admin = adminClient(cfg.url, cfg.service);

    let body: JsonBody;
    try {
      body = (await req.json()) as JsonBody;
    } catch {
      return json(400, { error: "גוף הבקשה אינו תקין." });
    }

    const action = trim(body.action);

    if (action === "token") return handleToken(admin, body);
    if (action === "revoke") {
      return handleRevoke(admin, cfg, req, body);
    }
    if (action === "client_info") {
      return handleClientInfo(admin, cfg, req, body);
    }
    if (action === "authorize") {
      return handleAuthorize(admin, cfg, req, body);
    }
    if (action === "list_grants") {
      return handleListGrants(admin, cfg, req);
    }
    if (action === "list_apps") {
      return handleListApps(admin, cfg, req);
    }
    if (action === "revoke_grant") {
      return handleRevokeGrant(admin, cfg, req, body);
    }
    if (action === "admin_create_client") {
      return handleAdminCreate(admin, cfg, req, body);
    }
    if (action === "admin_list_clients") {
      return handleAdminList(admin, cfg, req);
    }
    if (action === "admin_rotate_secret") {
      return handleAdminRotate(admin, cfg, req, body);
    }
    if (action === "admin_delete_client") {
      return handleAdminDelete(admin, cfg, req, body);
    }
    if (action === "admin_set_webhook") {
      return handleAdminSetWebhook(admin, cfg, req, body);
    }
    if (action === "deliver_webhooks") {
      return handleDeliverWebhooks(admin, cfg.service, req);
    }

    return json(400, { error: "פעולה לא מוכרת." });
  });
});

async function handleClientInfo(
  admin: SupabaseClient,
  cfg: { url: string; anon: string },
  req: Request,
  body: JsonBody,
): Promise<Response> {
  const user = await userFromRequest(req, cfg.url, cfg.anon);
  if (!user) return json(401, { error: "יש להתחבר מחדש." });
  const active = await requireActiveProfile(admin, user.id);
  if (!active.ok) return active.response;

  const clientId = trim(body.client_id);
  const client = await findClientByPublicId(admin, clientId);
  if (!client?.is_active) {
    return json(400, { error: "היישום אינו מוכר או אינו פעיל." });
  }
  return json(200, {
    name: client.name,
    telegram_bot_username: client.telegram_bot_username,
    redirect_uri: redirectUriForBot(client.telegram_bot_username),
  });
}

async function handleAuthorize(
  admin: SupabaseClient,
  cfg: { url: string; anon: string },
  req: Request,
  body: JsonBody,
): Promise<Response> {
  const user = await userFromRequest(req, cfg.url, cfg.anon);
  if (!user) return json(401, { error: "יש להתחבר מחדש." });
  const active = await requireActiveProfile(admin, user.id);
  if (!active.ok) return active.response;

  const clientId = trim(body.client_id);
  const state = trim(body.state);
  const client = await findClientByPublicId(admin, clientId);
  if (!client?.is_active) {
    return json(400, { error: "היישום אינו מוכר או אינו פעיל." });
  }
  const redirectUri =
    trim(body.redirect_uri) || redirectUriForBot(client.telegram_bot_username);
  if (!redirectUriMatchesClient(redirectUri, client.telegram_bot_username)) {
    return json(400, { error: "כתובת החזרה אינה מאושרת." });
  }

  await admin
    .from("oauth_authorization_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("client_id", client.id)
    .is("consumed_at", null);

  const code = randomStartParam();
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  const { error } = await admin.from("oauth_authorization_codes").insert({
    client_id: client.id,
    user_id: user.id,
    code_hash: codeHash,
    redirect_uri: redirectUriForBot(client.telegram_bot_username),
    state: state || null,
    expires_at: expiresAt,
  });
  if (error) {
    return json(400, { error: "לא ניתן להנפיק קוד אישור. נסו שוב." });
  }

  return json(200, {
    redirect: telegramStartRedirect(client.telegram_bot_username, code),
    expires_in: Math.floor(CODE_TTL_MS / 1000),
  });
}

async function handleToken(admin: SupabaseClient, body: JsonBody): Promise<Response> {
  const clientId = trim(body.client_id);
  const secret = trim(body.client_secret);
  const code = trim(body.code);
  const client = await findClientByPublicId(admin, clientId);
  if (!client || !(await verifyClientSecret(client, secret))) {
    return json(401, { error: GENERIC_CLIENT_ERROR });
  }
  if (!code.startsWith("yp_")) {
    return json(400, { error: "קוד האישור אינו תקין או שפג תוקפו." });
  }

  const codeHash = await sha256Hex(code);
  const { data: row } = await admin
    .from("oauth_authorization_codes")
    .select("id, user_id, expires_at, consumed_at")
    .eq("code_hash", codeHash)
    .eq("client_id", client.id)
    .maybeSingle();

  if (!row || row.consumed_at) {
    return json(400, { error: "קוד האישור אינו תקין או שפג תוקפו." });
  }
  if (new Date(row.expires_at as string).getTime() <= Date.now()) {
    return json(400, { error: "קוד האישור אינו תקין או שפג תוקפו.", code: "expired" });
  }

  const active = await requireActiveProfile(admin, row.user_id as string);
  if (!active.ok) return json(403, { error: "החשבון אינו פעיל." });

  const { error: consumeError } = await admin
    .from("oauth_authorization_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("consumed_at", null);
  if (consumeError) {
    return json(400, { error: "קוד האישור אינו תקין או שפג תוקפו." });
  }

  const nowIso = new Date().toISOString();
  await admin
    .from("oauth_access_tokens")
    .update({ revoked_at: nowIso })
    .eq("client_id", client.id)
    .eq("user_id", row.user_id)
    .is("revoked_at", null);

  const accessToken = randomAccessToken();
  const tokenHash = await sha256Hex(accessToken);
  const expiresAt = new Date(Date.now() + ACCESS_TTL_MS).toISOString();
  const { error: insertError } = await admin.from("oauth_access_tokens").insert({
    client_id: client.id,
    user_id: row.user_id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (insertError) {
    return json(400, { error: "לא ניתן להנפיק אסימון. נסו שוב." });
  }

  return json(200, {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TTL_MS / 1000),
    scope: SCOPE,
  });
}

async function handleRevoke(
  admin: SupabaseClient,
  cfg: { url: string; anon: string },
  req: Request,
  body: JsonBody,
): Promise<Response> {
  const grantId = trim(body.grant_id);
  if (grantId) {
    const user = await userFromRequest(req, cfg.url, cfg.anon);
    if (!user) return json(401, { error: "יש להתחבר מחדש." });
    await admin
      .from("oauth_access_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", grantId)
      .eq("user_id", user.id)
      .is("revoked_at", null);
    return json(200, { ok: true });
  }

  const clientId = trim(body.client_id);
  const secret = trim(body.client_secret);
  const token = trim(body.token);
  const client = await findClientByPublicId(admin, clientId);
  if (!client || !(await verifyClientSecret(client, secret))) {
    return json(401, { error: GENERIC_CLIENT_ERROR });
  }
  if (!token) return json(200, { ok: true });
  const tokenHash = await sha256Hex(token);
  await admin
    .from("oauth_access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", tokenHash)
    .eq("client_id", client.id)
    .is("revoked_at", null);
  return json(200, { ok: true });
}

async function handleListGrants(
  admin: SupabaseClient,
  cfg: { url: string; anon: string },
  req: Request,
): Promise<Response> {
  const user = await userFromRequest(req, cfg.url, cfg.anon);
  if (!user) return json(401, { error: "יש להתחבר מחדש." });

  const { data, error } = await admin
    .from("oauth_access_tokens")
    .select(
      "id, expires_at, revoked_at, created_at, client:oauth_clients(name, telegram_bot_username)",
    )
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) return json(400, { error: "לא ניתן לטעון חיבורים." });

  const grants = (data ?? []).map((row) => {
    const client = row.client as
      | { name: string; telegram_bot_username: string }
      | { name: string; telegram_bot_username: string }[]
      | null;
    const info = Array.isArray(client) ? client[0] : client;
    return {
      id: row.id,
      name: info?.name ?? "יישום",
      telegram_bot_username: info?.telegram_bot_username ?? "",
      expires_at: row.expires_at,
      created_at: row.created_at,
    };
  });

  return json(200, { grants });
}

async function handleListApps(
  admin: SupabaseClient,
  cfg: { url: string; anon: string },
  req: Request,
): Promise<Response> {
  const user = await userFromRequest(req, cfg.url, cfg.anon);
  if (!user) return json(401, { error: "יש להתחבר מחדש." });
  const active = await requireActiveProfile(admin, user.id);
  if (!active.ok) return active.response;

  const { data, error } = await admin
    .from("oauth_clients")
    .select("name, client_id, telegram_bot_username")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) return json(400, { error: "לא ניתן לטעון יישומים." });

  const apps = (data ?? []).map((row) => ({
    name: row.name,
    client_id: row.client_id,
    telegram_bot_username: row.telegram_bot_username,
    redirect_uri: redirectUriForBot(row.telegram_bot_username as string),
  }));
  return json(200, { apps });
}

async function handleRevokeGrant(
  admin: SupabaseClient,
  cfg: { url: string; anon: string },
  req: Request,
  body: JsonBody,
): Promise<Response> {
  return handleRevoke(admin, cfg, req, body);
}

async function handleAdminCreate(
  admin: SupabaseClient,
  cfg: { url: string; anon: string },
  req: Request,
  body: JsonBody,
): Promise<Response> {
  const user = await userFromRequest(req, cfg.url, cfg.anon);
  if (!user) return json(401, { error: "יש להתחבר מחדש." });
  if (!(await requireAdmin(admin, user.id))) {
    return json(403, { error: "אין הרשאה." });
  }

  const name = trim(body.name);
  const bot = normalizeBotUsername(trim(body.telegram_bot_username));
  if (!name) return json(400, { error: "יש להזין שם יישום." });
  if (!isBotUsername(bot)) {
    return json(400, { error: "שם המשתמש של הבוט אינו תקין." });
  }

  const clientId = randomClientId();
  const secret = randomClientSecret();
  const hash = await sha256Hex(secret);
  const { error } = await admin.from("oauth_clients").insert({
    name,
    client_id: clientId,
    client_secret_hash: hash,
    telegram_bot_username: bot,
    created_by: user.id,
  });
  if (error) {
    if (/oauth_clients_telegram|unique/i.test(error.message)) {
      return json(400, { error: "בוט זה כבר רשום." });
    }
    return json(400, { error: "לא ניתן ליצור יישום." });
  }

  return json(200, {
    client_id: clientId,
    client_secret: secret,
    redirect_uri: redirectUriForBot(bot),
    authorize_url: `https://yahpz.com/oauth/authorize?client_id=${encodeURIComponent(clientId)}&state=STATE`,
  });
}

async function handleAdminList(
  admin: SupabaseClient,
  cfg: { url: string; anon: string },
  req: Request,
): Promise<Response> {
  const user = await userFromRequest(req, cfg.url, cfg.anon);
  if (!user) return json(401, { error: "יש להתחבר מחדש." });
  if (!(await requireAdmin(admin, user.id))) {
    return json(403, { error: "אין הרשאה." });
  }

  const { data, error } = await admin
    .from("oauth_clients")
    .select("id, name, client_id, telegram_bot_username, is_active, webhook_url, created_at")
    .order("created_at", { ascending: false });
  if (error) return json(400, { error: "לא ניתן לטעון יישומים." });
  return json(200, { clients: data ?? [] });
}

async function handleAdminRotate(
  admin: SupabaseClient,
  cfg: { url: string; anon: string },
  req: Request,
  body: JsonBody,
): Promise<Response> {
  const user = await userFromRequest(req, cfg.url, cfg.anon);
  if (!user) return json(401, { error: "יש להתחבר מחדש." });
  if (!(await requireAdmin(admin, user.id))) {
    return json(403, { error: "אין הרשאה." });
  }

  const clientId = trim(body.client_id);
  const client = await findClientByPublicId(admin, clientId);
  if (!client) return json(400, { error: "היישום אינו מוכר." });

  const secret = randomClientSecret();
  const hash = await sha256Hex(secret);
  const { error } = await admin
    .from("oauth_clients")
    .update({ client_secret_hash: hash })
    .eq("id", client.id);
  if (error) return json(400, { error: "לא ניתן לחדש את הטוקן." });

  return json(200, { client_id: client.client_id, client_secret: secret });
}

async function handleAdminDelete(
  admin: SupabaseClient,
  cfg: { url: string; anon: string },
  req: Request,
  body: JsonBody,
): Promise<Response> {
  const user = await userFromRequest(req, cfg.url, cfg.anon);
  if (!user) return json(401, { error: "יש להתחבר מחדש." });
  if (!(await requireAdmin(admin, user.id))) {
    return json(403, { error: "אין הרשאה." });
  }

  const clientId = trim(body.client_id);
  const client = await findClientByPublicId(admin, clientId);
  if (!client) return json(400, { error: "היישום אינו מוכר." });

  const { error } = await admin.from("oauth_clients").delete().eq("id", client.id);
  if (error) return json(400, { error: "לא ניתן להסיר את הבוט." });
  return json(200, { ok: true });
}

function isHttpsUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

async function handleAdminSetWebhook(
  admin: SupabaseClient,
  cfg: { url: string; anon: string },
  req: Request,
  body: JsonBody,
): Promise<Response> {
  const user = await userFromRequest(req, cfg.url, cfg.anon);
  if (!user) return json(401, { error: "יש להתחבר מחדש." });
  if (!(await requireAdmin(admin, user.id))) {
    return json(403, { error: "אין הרשאה." });
  }

  const clientId = trim(body.client_id);
  const client = await findClientByPublicId(admin, clientId);
  if (!client) return json(400, { error: "היישום אינו מוכר." });

  const webhookUrl = trim(body.webhook_url);

  if (!webhookUrl) {
    const { error } = await admin
      .from("oauth_clients")
      .update({ webhook_url: null, webhook_secret: null })
      .eq("id", client.id);
    if (error) return json(400, { error: "לא ניתן לעדכן webhook." });
    return json(200, { ok: true, webhook_url: null });
  }

  if (!isHttpsUrl(webhookUrl)) {
    return json(400, { error: "כתובת ה-webhook חייבת להתחיל ב-https://." });
  }

  const secret = randomWebhookSecret();
  const { error } = await admin
    .from("oauth_clients")
    .update({ webhook_url: webhookUrl, webhook_secret: secret })
    .eq("id", client.id);
  if (error) return json(400, { error: "לא ניתן לעדכן webhook." });

  return json(200, { ok: true, webhook_url: webhookUrl, webhook_secret: secret });
}

const WEBHOOK_DELIVERY_BATCH_LIMIT = 50;

function webhookBackoffMs(attempts: number): number {
  const minutes = attempts <= 1 ? 1 : attempts === 2 ? 5 : attempts === 3 ? 15 : 60;
  return minutes * 60 * 1000;
}

type WebhookOutboxRow = {
  id: string;
  user_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
  last_attempt_at: string | null;
  client:
    | { webhook_url: string | null; webhook_secret: string | null; is_active: boolean }
    | { webhook_url: string | null; webhook_secret: string | null; is_active: boolean }[]
    | null;
};

async function handleDeliverWebhooks(
  admin: SupabaseClient,
  serviceKey: string,
  req: Request,
): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json(401, { error: "יש להתחבר מחדש." });
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (token !== serviceKey) {
    return json(403, { error: "אין לך הרשאה לפעולה זו." });
  }

  const { data: rows, error } = await admin
    .from("partner_webhook_events")
    .select(
      `id, user_id, event_type, payload, attempts, last_attempt_at,
       client:oauth_clients!inner(webhook_url, webhook_secret, is_active)`,
    )
    .is("delivered_at", null)
    .eq("client.is_active", true)
    .not("client.webhook_url", "is", null)
    .order("created_at", { ascending: true })
    .limit(WEBHOOK_DELIVERY_BATCH_LIMIT);

  if (error) {
    return json(500, { error: "טעינת אירועי webhook נכשלה.", detail: error.message });
  }

  const delivered: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const raw of (rows ?? []) as WebhookOutboxRow[]) {
    const due =
      !raw.last_attempt_at ||
      Date.now() - new Date(raw.last_attempt_at).getTime() >= webhookBackoffMs(raw.attempts);
    if (!due) {
      skipped.push({ id: raw.id, reason: "backoff" });
      continue;
    }

    const client = Array.isArray(raw.client) ? raw.client[0] : raw.client;
    if (!client?.webhook_url || !client.webhook_secret) {
      skipped.push({ id: raw.id, reason: "unconfigured" });
      continue;
    }

    const bodyText = JSON.stringify({
      id: raw.id,
      user_id: raw.user_id,
      event_type: raw.event_type,
      ...raw.payload,
    });
    const signature = await hmacSha256Hex(client.webhook_secret, bodyText);

    let ok = false;
    try {
      const response = await fetch(client.webhook_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Yahpaz-Signature": signature,
        },
        body: bodyText,
      });
      ok = response.ok;
    } catch {
      ok = false;
    }

    const nowIso = new Date().toISOString();
    if (ok) {
      const { error: updateError } = await admin
        .from("partner_webhook_events")
        .update({ delivered_at: nowIso, last_attempt_at: nowIso })
        .eq("id", raw.id);
      if (updateError) {
        skipped.push({ id: raw.id, reason: "mark_delivered_failed" });
        continue;
      }
      delivered.push(raw.id);
    } else {
      const { error: updateError } = await admin
        .from("partner_webhook_events")
        .update({ attempts: raw.attempts + 1, last_attempt_at: nowIso })
        .eq("id", raw.id);
      skipped.push({ id: raw.id, reason: updateError ? "mark_failed_failed" : "delivery_failed" });
    }
  }

  return json(200, { delivered, skipped });
}
