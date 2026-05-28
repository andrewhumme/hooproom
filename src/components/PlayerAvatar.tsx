// Player avatar: shows NBA headshot from the official CDN when we have an
// NBA stats player ID, otherwise falls back to initials with a team-tinted
// background. Headshot URL pattern:
//   https://cdn.nba.com/headshots/nba/latest/1040x760/{nbaPlayerId}.png

import { useEffect, useState } from "react";

const TEAM_COLORS: Record<string, string> = {
  ATL: "oklch(0.55 0.20 25)",
  BOS: "oklch(0.45 0.15 145)",
  BKN: "oklch(0.20 0 0)",
  CHA: "oklch(0.45 0.15 250)",
  CHI: "oklch(0.50 0.22 25)",
  CLE: "oklch(0.40 0.18 25)",
  DAL: "oklch(0.50 0.18 250)",
  DEN: "oklch(0.35 0.15 250)",
  DET: "oklch(0.50 0.22 25)",
  GSW: "oklch(0.55 0.20 250)",
  HOU: "oklch(0.50 0.22 25)",
  IND: "oklch(0.45 0.15 80)",
  LAC: "oklch(0.50 0.22 25)",
  LAL: "oklch(0.50 0.18 290)",
  MEM: "oklch(0.45 0.10 250)",
  MIA: "oklch(0.45 0.20 25)",
  MIL: "oklch(0.40 0.15 145)",
  MIN: "oklch(0.40 0.15 250)",
  NOP: "oklch(0.40 0.15 250)",
  NYK: "oklch(0.55 0.20 60)",
  OKC: "oklch(0.55 0.20 240)",
  ORL: "oklch(0.55 0.20 240)",
  PHI: "oklch(0.50 0.22 25)",
  PHX: "oklch(0.55 0.20 60)",
  POR: "oklch(0.50 0.22 25)",
  SAC: "oklch(0.50 0.18 290)",
  SAS: "oklch(0.30 0 0)",
  TOR: "oklch(0.50 0.22 25)",
  UTA: "oklch(0.40 0.15 250)",
  WAS: "oklch(0.40 0.18 25)",
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function PlayerAvatar({
  name,
  team,
  size = 36,
  nbaPlayerId,
  shape = "circle",
}: {
  name: string;
  team: string;
  size?: number;
  nbaPlayerId?: number | null;
  shape?: "circle" | "square";
}) {
  const bg = TEAM_COLORS[team.toUpperCase()] ?? "oklch(0.4 0.05 250)";
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [nbaPlayerId]);

  const showImg = !!nbaPlayerId && !imgFailed;
  const radiusClass = shape === "square" ? "rounded-md" : "rounded-full";

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden font-black text-white ${radiusClass}`}
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: size * 0.38,
        letterSpacing: "0.02em",
      }}
      aria-hidden
    >
      {showImg ? (
        <img
          src={`https://cdn.nba.com/headshots/nba/latest/1040x760/${nbaPlayerId}.png`}
          alt=""
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}


