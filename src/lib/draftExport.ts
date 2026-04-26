// CSV export for completed drafts. No server work — built client-side.
type PickRow = {
  pick_number: number;
  round: number;
  team_idx: number;
  team_name: string;
  player_name: string;
  player_position: string | null;
  player_team: string | null;
  was_autopick: boolean;
};

function csvCell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildDraftCsv(roomName: string, picks: PickRow[]): string {
  const header = ["Pick", "Round", "Team #", "Team Name", "Player", "Position", "NBA Team", "Autopick"];
  const rows = picks
    .slice()
    .sort((a, b) => a.pick_number - b.pick_number)
    .map((p) => [
      p.pick_number,
      p.round,
      p.team_idx,
      p.team_name,
      p.player_name,
      p.player_position ?? "",
      p.player_team ?? "",
      p.was_autopick ? "Yes" : "",
    ]);
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(","));
  return `# ${roomName} — Draft Results\n${lines.join("\n")}\n`;
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
