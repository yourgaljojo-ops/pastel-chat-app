# pastel chat — Supabase + free hosting setup

## 1. Create the Supabase project (free tier)
1. Go to supabase.com → New project (free tier is fine for 2 users).
2. Once it's ready, open **SQL Editor → New query**, paste in the contents of
   `supabase/schema.sql`, and run it. This creates:
   - `profiles` table (the User type) with an auto-created row on signup
   - `messages` table (the Message type) with Realtime enabled
   - `avatars` and `chat-media` storage buckets, public + upload policies
3. Go to **Authentication → Providers → Email** and make sure "Email OTP /
   magic link" is enabled (it is by default). No password needed — you and
   your friend each just click a link sent to your email.
4. Go to **Authentication → URL Configuration** and set the Site URL to
   your deployed URL once you have it (step 3 below); for local dev,
   `http://localhost:5173` works.
5. Grab your keys: **Project Settings → API** → copy the "Project URL" and
   the `anon` `public` key.

## 2. Run it locally
```bash
cp .env.example .env
# paste your Project URL and anon key into .env
npm install
npm run dev
```
Open the local URL, sign in with your email, then have your friend do the
same from their own device/browser — their profile row is created
automatically and shows up in the sidebar.

## 3. Deploy for free (Vercel)
1. Push this folder to a GitHub repo.
2. Go to vercel.com → **Add New Project** → import the repo.
3. Vercel auto-detects Vite. Before deploying, add your two env vars under
   **Settings → Environment Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. Vercel's free (Hobby) tier covers this comfortably — a 2-person
   chat app is tiny traffic.
5. Copy the `https://your-app.vercel.app` URL Vercel gives you, and paste
   it back into Supabase's **Authentication → URL Configuration → Site
   URL** (and add it to "Redirect URLs" too) so magic links redirect
   correctly.

Netlify or Cloudflare Pages work the same way if you'd rather use those —
same three env-var + build-command steps (`npm run build`, output dir
`dist`).

## 4. What's already wired up
- **Auth** — email magic link (no passwords to manage for just the two of you)
- **Messages** — live via Supabase Realtime (`postgres_changes`), no polling
- **Typing indicator** — Supabase Realtime Broadcast channel, not stored in the DB
- **Read receipts** — `read` boolean flipped via an `update` when a message renders on the recipient's screen
- **Video/voice notes** — uploaded to the `chat-media` storage bucket, public URL saved on the message row
- **Avatars** — uploaded to the `avatars` bucket, URL saved on the profile row
- **Reactions** — stored as a `text[]` column on each message row

## Notes / next steps if you want to harden it
- RLS currently allows *any* signed-in user to read/write all messages —
  fine for a private 2-person app where only you two will ever have
  accounts, but if you want it airtight, add a `room_id` to `messages`
  and scope policies to a `participants` table.
- Storage buckets are public read right now (simplest for `<video>`/`<img>`
  tags to just work). For private media, switch to signed URLs instead.
- Voice recording uses the browser's `MediaRecorder` API — needs mic
  permission and HTTPS (Vercel gives you HTTPS by default; localhost is
  also fine for dev).
