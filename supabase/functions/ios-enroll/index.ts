import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  extractPlistXmlFromPkcs7Body,
  parseEnrollAttributes,
} from "../_shared/iosEnrollPlist.ts";

const PUBLIC_BASE =
  (Deno.env.get("IOS_ENROLL_PUBLIC_BASE") ?? "https://yahpz.com").replace(/\/+$/, "");

function redirect(pathQuery: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: `${PUBLIC_BASE}${pathQuery}` },
  });
}

function mobileConfig(callbackUrl: string): string {
  const uuid = crypto.randomUUID();
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>PayloadContent</key>
	<dict>
		<key>URL</key>
		<string>${callbackUrl}</string>
		<key>DeviceAttributes</key>
		<array>
			<string>UDID</string>
			<string>PRODUCT</string>
			<string>VERSION</string>
			<string>DEVICE_NAME</string>
		</array>
	</dict>
	<key>PayloadOrganization</key>
	<string>אבן דרך - יחפ״צ</string>
	<key>PayloadDisplayName</key>
	<string>רישום מכשיר אבן דרך</string>
	<key>PayloadVersion</key>
	<integer>1</integer>
	<key>PayloadUUID</key>
	<string>${uuid}</string>
	<key>PayloadIdentifier</key>
	<string>com.yahpz.responder.enroll</string>
	<key>PayloadDescription</key>
	<string>שולח את מזהה המכשיר לרישום באפליקציית אבן דרך. ניתן להסיר לאחר הרישום.</string>
	<key>PayloadType</key>
	<string>Profile Service</string>
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
    return new Response(mobileConfig(callbackUrl), {
      status: 200,
      headers: {
        "Content-Type": "application/x-apple-aspen-config",
        "Content-Disposition": 'attachment; filename="yahpaz-enroll.mobileconfig"',
      },
    });
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

    const bodyText = await req.text();
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

    return redirect("/ios/enrolled");
  }

  return new Response("not found", { status: 404 });
});
