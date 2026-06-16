---
name: User auth & dashboard
description: Auth gating model — real signup required to host/join/browse lobby; guest spectator allowed on /draft/$roomId only; /me dashboard under _authenticated layout
type: feature
---
Auth model (post user-management build):

- Lovable Cloud managed Google OAuth via `src/integrations/lovable/index.ts` (`lovable.auth.signInWithOAuth("google", ...)`). Do NOT call `supabase.auth.signInWithOAuth` for Google directly.
- Email/password also supported on `/auth`.
- Guest session (`src/lib/guestSession.ts`, key `hoopRoom.guestCreds.v1`) is now ONLY used on `/draft/$roomId` so anyone with the share link can spectate without signing up. Lobby and host-new pages require a real account and redirect to `/auth` if `!user || isGuest`.
- `useAuth()` exposes `isGuest` (derived from localStorage marker). `clearGuestMarker()` is called on real sign-in/up flows.
- `_authenticated/route.tsx` is a `ssr: false` layout that redirects to `/auth?redirect=/me` when user is missing OR is a guest. `/me` is the only child today: tabs for Active drafts, Completed drafts, and Profile settings (display_name + avatar_url on `profiles` table).
- AppHeader shows "My Drafts" link + user name only when `isReal = !!user && !isGuest`.
