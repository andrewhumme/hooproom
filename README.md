# HoopRoom

Fantasy basketball draft rooms — live snake and auction drafts, in-person drafts, and view-only watch links.

**Live app**: https://hooproom.app

## Stack

- **App:** TanStack Start (React + Vite), deployed as the Cloudflare Worker `tanstack-start-app`.
- **Database / auth:** Supabase project `aipomgjcggglvxnltgxs`.

## Development

You need Node.js and npm.

```sh
npm i
npm run dev   # http://localhost:8080
```

`.env` holds the public Supabase URL and publishable key. Put the service role key in `.env.local` (git-ignored); never commit it.

## Deploying

Pushing to GitHub does not deploy. Build and upload the Worker:

```sh
npm run build
npx wrangler deploy --message "what changed"
```

Roll back with `npx wrangler rollback`.

## Database changes

New migrations live in `supabase/migrations/`. Apply them by running the file in the Supabase SQL Editor for the HoopRoom project, **before** deploying app code that depends on them.
