import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  extractPlistXmlFromPkcs7Body,
  parseEnrollAttributes,
} from "../_shared/iosEnrollPlist.ts";

const PUBLIC_BASE =
  (Deno.env.get("IOS_ENROLL_PUBLIC_BASE") ?? "https://yahpz.com").replace(/\/+$/, "");

function redirect(pathQuery: string): Response {
  // 301 — Profile Service installers follow this more reliably than 302.
  return new Response(null, {
    status: 301,
    headers: { Location: `${PUBLIC_BASE}${pathQuery}` },
  });
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function aspenConfigResponse(body: string, filename: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/x-apple-aspen-config",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

/** Phase-1 Profile Service — requests device attributes, POSTs to callback. */
function enrollProfileConfig(callbackUrl: string): string {
  const uuid = crypto.randomUUID();
  const safeUrl = xmlEscape(callbackUrl);
  // ASCII display strings: Hebrew in unsigned profiles has caused install flakiness.
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>PayloadContent</key>
	<dict>
		<key>URL</key>
		<string>${safeUrl}</string>
		<key>DeviceAttributes</key>
		<array>
			<string>UDID</string>
			<string>PRODUCT</string>
			<string>VERSION</string>
		</array>
	</dict>
	<key>PayloadOrganization</key>
	<string>Yahpaz</string>
	<key>PayloadDisplayName</key>
	<string>Yahpaz Device Enrollment</string>
	<key>PayloadVersion</key>
	<integer>1</integer>
	<key>PayloadUUID</key>
	<string>${uuid}</string>
	<key>PayloadIdentifier</key>
	<string>com.yahpz.responder.enroll</string>
	<key>PayloadDescription</key>
	<string>Sends this device UDID to Yahpaz for Ad Hoc registration. You can remove the profile afterward.</string>
	<key>PayloadType</key>
	<string>Profile Service</string>
</dict>
</plist>
`;
}

/**
 * After Profile Service POSTs attributes, iOS expects a Configuration profile back
 * (not an HTML redirect). Empty payload = install succeeds; user can remove it.
 */
function enrollCompleteConfig(): string {
  const uuid = crypto.randomUUID();
  const clipUuid = crypto.randomUUID();
  const iosUrl = xmlEscape(`${PUBLIC_BASE}/ios`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>PayloadContent</key>
	<array>
		<dict>
			<key>PayloadType</key>
			<string>com.apple.webClip.webClip</string>
			<key>PayloadVersion</key>
			<integer>1</integer>
			<key>PayloadIdentifier</key>
			<string>com.yahpz.responder.enroll.done.webclip</string>
			<key>PayloadUUID</key>
			<string>${clipUuid}</string>
			<key>PayloadDisplayName</key>
			<string>Yahpaz iOS</string>
			<key>URL</key>
			<string>${iosUrl}</string>
			<key>Label</key>
			<string>Yahpaz iOS</string>
			<key>IsRemovable</key>
			<true/>
			<key>FullScreen</key>
			<false/>
		</dict>
	</array>
	<key>PayloadDisplayName</key>
	<string>Yahpaz Enrollment Complete</string>
	<key>PayloadIdentifier</key>
	<string>com.yahpz.responder.enroll.done</string>
	<key>PayloadDescription</key>
	<string>Enrollment received. Open Yahpaz iOS (or remove this profile) — your device is pending approval.</string>
	<key>PayloadOrganization</key>
	<string>Yahpaz</string>
	<key>PayloadRemovalDisallowed</key>
	<false/>
	<key>PayloadType</key>
	<string>Configuration</string>
	<key>PayloadUUID</key>
	<string>${uuid}</string>
	<key>PayloadVersion</key>
	<integer>1</integer>
</dict>
</plist>
`;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const op = (url.searchParams.get("op") ?? "").trim();
  const token = (url.searchParams.get("token") ?? "").trim();

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response("server misconfigured", { status: 500 });
  }
  const admin = createClient(supabaseUrl, serviceKey);

  if (req.method === "GET" && op === "profile") {
    if (!token) return new Response("missing token", { status: 400 });
    const { data: row, error } = await admin
      .from("ios_enroll_tokens")
      .select("token, expires_at, consumed_at")
      .eq("token", token)
      .maybeSingle();
    if (error || !row || row.consumed_at || new Date(row.expires_at).getTime() < Date.now()) {
      return new Response("invalid token", { status: 400 });
    }
    const callbackUrl =
      `${supabaseUrl}/functions/v1/ios-enroll?op=callback&token=${encodeURIComponent(token)}`;
    return aspenConfigResponse(
      enrollProfileConfig(callbackUrl),
      "yahpaz-enroll.mobileconfig",
    );
  }

  if (req.method === "POST" && op === "callback") {
    if (!token) return redirect("/ios?enroll=error");

    const { data: tokRow, error: tokErr } = await admin
      .from("ios_enroll_tokens")
      .select("token, user_id, expires_at, consumed_at")
      .eq("token", token)
      .maybeSingle();
    if (
      tokErr ||
      !tokRow ||
      tokRow.consumed_at ||
      new Date(tokRow.expires_at).getTime() < Date.now()
    ) {
      return redirect("/ios?enroll=error");
    }

    // PKCS#7 body is binary DER with an embedded XML plist — decode as Latin-1
    // so high bytes stay intact and the <?xml…</plist> span still matches.
    const raw = new Uint8Array(await req.arrayBuffer());
    const bodyText = Array.from(raw, (b) => String.fromCharCode(b)).join("");
    const plistXml = extractPlistXmlFromPkcs7Body(bodyText);
    const attrs = plistXml ? parseEnrollAttributes(plistXml) : null;
    if (!attrs?.udid) return redirect("/ios?enroll=error");

    const { data: existing } = await admin
      .from("ios_devices")
      .select("id, user_id")
      .eq("udid", attrs.udid)
      .maybeSingle();
    if (existing && existing.user_id !== tokRow.user_id) {
      return redirect("/ios?enroll=dup");
    }

    const { count: activeCount } = await admin
      .from("ios_devices")
      .select("id", { count: "exact", head: true })
      .eq("user_id", tokRow.user_id)
      .in("status", ["pending", "approved", "registered"]);
    if ((activeCount ?? 0) >= 2 && !existing) {
      return redirect("/ios?enroll=cap");
    }

    const { data: yearRow } = await admin.rpc("ios_membership_year_now");
    const membershipYear =
      typeof yearRow === "number" ? yearRow : new Date().getFullYear();

    if (existing) {
      const { error: updErr } = await admin
        .from("ios_devices")
        .update({
          status: "pending",
          device_name: attrs.deviceName,
          product_type: attrs.product,
          ios_version: attrs.version,
          requested_at: new Date().toISOString(),
          approved_at: null,
          approved_by: null,
          registered_at: null,
          rejected_at: null,
          reject_reason: null,
          membership_year: membershipYear,
        })
        .eq("id", existing.id);
      if (updErr) return redirect("/ios?enroll=error");
    } else {
      const { error: insErr } = await admin.from("ios_devices").insert({
        user_id: tokRow.user_id,
        udid: attrs.udid,
        device_name: attrs.deviceName,
        product_type: attrs.product,
        ios_version: attrs.version,
        status: "pending",
        membership_year: membershipYear,
      });
      if (insErr) return redirect("/ios?enroll=error");
    }

    await admin
      .from("ios_enroll_tokens")
      .update({ consumed_at: new Date().toISOString() })
      .eq("token", token);

    // Must return a Configuration .mobileconfig — HTML redirects look like
    // "Invalid Profile" in Settings even when the UDID was saved.
    return aspenConfigResponse(
      enrollCompleteConfig(),
      "yahpaz-enroll-done.mobileconfig",
    );
  }

  return new Response("not found", { status: 404 });
});
