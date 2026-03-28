# Melodica

Melodica is a browser-based music sketchpad built with Next.js, Tone.js, and Supabase.

## Features

- Landing page with auth entry points
- Google OAuth login/signup
- Project dashboard with save/load/rename/delete
- Browser music editor (melody + drums + vocals)
- MP3 export
- Album cover upload support

## Tech Stack

- Next.js (App Router, TypeScript)
- React
- Tailwind CSS
- Tone.js
- Supabase (Auth, Postgres, Storage)

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-publishable-or-anon-key>

# Optional (defaults shown)
NEXT_PUBLIC_SUPABASE_COVER_BUCKET=album-covers
NEXT_PUBLIC_SUPABASE_AUDIO_BUCKET=audio-clips
```

3. Run dev server:

```bash
npm run dev
```

4. Build locally (recommended before deploy):

```bash
npm run build
```

## Supabase Setup

### Database

- Run migrations in `supabase/migrations/`.
- Ensure `public.songs` has RLS enabled and ownership policies active.

### Storage

Create private buckets:

- `album-covers`
- `audio-clips`

Add owner-only policies on `storage.objects` for each bucket:

- `select/insert/update/delete` where `owner = auth.uid()`

## Deploy (Vercel)

1. Import repo into Vercel.
2. Framework preset: `Next.js`.
3. Root directory: `./`.
4. Set env vars in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - optional bucket vars
5. Deploy.

After first deploy, copy your Vercel URL and set it in Supabase Auth:

- Site URL: `https://<your-app>.vercel.app`
- Redirect URLs: include localhost and your Vercel URL(s)

## Notes

- This project currently includes an owner-only auth gate in app logic.
- If you want multi-user access, remove owner-email checks and adjust policies accordingly.
