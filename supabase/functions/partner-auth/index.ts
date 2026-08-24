import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  jsonResponse as json,
  runWithCors,
} from "../_shared/cors.ts";
import {
  constantTimeEqual,
  randomAccessToken,
  randomClientId,
  randomClientSecret,
  randomStartParam,
  sha256Hex,
} from "../_shared/partnerCrypto.ts";

const ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-yahpaz-partner-token";
const CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SCOPE = "responder:fill";
const GENERIC_CLIENT_ERROR = "יישום או סוד אינם תקינים.";

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
  const redirectUri = trim(body.redirect_uri);
  const state = trim(body.state);
  const client = await findClientByPublicId(admin, clientId);
  if (!client?.is_active) {
    return json(400, { error: "היישום אינו מוכר או אינו פעיל." });
  }
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
    authorize_url: `https://yahpz.com/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUriForBot(bot))}&state=STATE&scope=${encodeURIComponent(SCOPE)}`,
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
    .select("id, name, client_id, telegram_bot_username, is_active, created_at")
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
  if (error) return json(400, { error: "לא ניתן לחדש את הסוד." });

  return json(200, { client_id: client.client_id, client_secret: secret });
}
