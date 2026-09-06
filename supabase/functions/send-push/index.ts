// supabase/functions/send-push/index.ts
//
// Triggered by a Database Webhook (Database -> Webhooks in the Supabase
// dashboard) firing on INSERT into `messages`. Looks up the recipient's
// push subscription(s) and sends them a real push notification.
//
// Deno supports importing npm packages directly via the "npm:" specifier,
// so the standard `web-push` library works here unmodified.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails(
  "mailto:login@pastelchatapp.work.gd",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const message = payload.record; // the newly-inserted messages row

    if (!message) return new Response("no record", { status: 400 });

    // Find every subscription that ISN'T the sender's own device(s).
    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .neq("user_id", message.sender_id);

    if (error) throw error;
    if (!subs || subs.length === 0) {
      return new Response("no recipients subscribed", { status: 200 });
    }

    const bodyPreview = message.image_url
      ? "📷 Sent a photo"
      : message.video_url
      ? "🎬 Sent a video"
      : message.audio_url
      ? "🎤 Sent a voice note"
      : message.text?.slice(0, 120) || "New message";

    const notificationPayload = JSON.stringify({
      title: `${message.sender_name} 💌`,
      body: bodyPreview,
      url: "/",
    });

    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          notificationPayload
        )
      )
    );

    // A subscription that's expired or been revoked comes back as a 404/410
    // — clean those out so we don't keep trying to push to a dead endpoint.
    await Promise.all(
      results.map((r, i) => {
        if (r.status === "rejected" && [404, 410].includes(r.reason?.statusCode)) {
          return supabase.from("push_subscriptions").delete().eq("id", subs[i].id);
        }
      })
    );

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(String(err), { status: 500 });
  }
});
