# HQ Command Center

## Deploy Steps

### 1. Supabase (Junk Line project)
- Go to Supabase SQL Editor for `oschjeuhejqibymdaqxw`
- Paste and run `supabase-migration.sql`
- Grab your **anon key** from Settings > API

### 2. Update the app
- Open `public/index.html`
- Find `REPLACE_WITH_SUPABASE_URL` and replace with: `https://oschjeuhejqibymdaqxw.supabase.co`
- Find `REPLACE_WITH_ANON_KEY` and replace with your anon key

### 3. Deploy to Vercel
- Push this repo to GitHub
- Import in Vercel (Framework: Other)
- Done — live URL in 30 seconds

### 4. Phone
- Open the Vercel URL on your phone
- iPhone: Share > Add to Home Screen
- Android: Menu > Add to Home Screen
- Launches fullscreen like a native app, synced with desktop
