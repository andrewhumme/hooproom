// View-only watch links (/watch/<key>), resolved by get_watch_snapshot().
//
// Listed rooms (public / spectate) use the room id, so the link is as public
// as the room itself. Private rooms use their secret watch_token, which only
// the host and participants can read.

export type WatchableRoom = {
  id: string;
  visibility?: string | null;
  watch_token?: string | null;
};

export function isListedRoom(room: WatchableRoom): boolean {
  return room.visibility === "public" || room.visibility === "spectate";
}

/** Path to the watch page, or null if this viewer can't build one. */
export function watchPath(room: WatchableRoom): string | null {
  if (isListedRoom(room)) return `/watch/${room.id}`;
  return room.watch_token ? `/watch/${room.watch_token}` : null;
}

export function watchUrl(room: WatchableRoom): string | null {
  const path = watchPath(room);
  if (!path || typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}
