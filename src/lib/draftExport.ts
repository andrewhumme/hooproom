// Multi-tab XLSX export for completed drafts. Also keeps CSV for back-compat.
import * as XLSX from "xlsx";

export type PickRow = {
  pick_number: number;
  round: number;
  team_idx: number;
  team_name: string;
  player_name: string;
  player_position: string | null;
  player_team: string | null;
  was_autopick: boolean;
  auction_price?: number | null;
};

export type DraftMeta = {
  roomName: string;
  draftFormat: string;
  scoringFormat: string;
  teamCount: number;
  rounds?: number;
  pickClockSec?: number;
  budget?: number | null;
  completedAt?: string | null;
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
  triggerDownload(filename, blob);
}

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function autoWidths(rows: (string | number | null | undefined)[][]): { wch: number }[] {
  if (!rows.length) return [];
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      const len = cell == null ? 0 : String(cell).length;
      if (len > (widths[i] ?? 0)) widths[i] = len;
    });
  }
  return widths.map((w) => ({ wch: Math.min(Math.max(w + 2, 8), 40) }));
}

function aoaSheet(rows: (string | number | null | undefined)[][]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = autoWidths(rows);
  return ws;
}

// Excel sheet names: <=31 chars, no : \ / ? * [ ]
function safeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Sheet";
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${n++})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export function buildDraftWorkbook(meta: DraftMeta, picksIn: PickRow[]): XLSX.WorkBook {
  const picks = picksIn.slice().sort((a, b) => a.pick_number - b.pick_number);
  const isAuction = meta.draftFormat.startsWith("auction");
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();

  // ---- Summary ----
  const teamSet = new Map<number, string>();
  picks.forEach((p) => teamSet.set(p.team_idx, p.team_name));
  const totalSpend = picks.reduce((s, p) => s + (p.auction_price ?? 0), 0);
  const autopicks = picks.filter((p) => p.was_autopick).length;

  const summary: (string | number)[][] = [
    [meta.roomName],
    ["Draft Results Export"],
    [],
    ["Format", isAuction ? "Auction" : "Snake"],
    ["Variant", meta.draftFormat],
    ["Scoring", meta.scoringFormat],
    ["Teams", meta.teamCount],
  ];
  if (!isAuction && meta.rounds) summary.push(["Rounds", meta.rounds]);
  if (meta.pickClockSec) summary.push(["Pick clock (sec)", meta.pickClockSec]);
  if (isAuction && meta.budget) summary.push(["Budget / team", meta.budget]);
  if (meta.completedAt) summary.push(["Completed", new Date(meta.completedAt).toLocaleString()]);
  summary.push([]);
  summary.push(["Total picks", picks.length]);
  if (isAuction) summary.push(["Total spent", totalSpend]);
  else summary.push(["Autopicks", autopicks]);
  XLSX.utils.book_append_sheet(wb, aoaSheet(summary), safeSheetName("Summary", used));

  // ---- All Picks ----
  const allHeader = isAuction
    ? ["Pick #", "Team #", "Team", "Player", "Pos", "NBA", "Price"]
    : ["Pick #", "Round", "Team #", "Team", "Player", "Pos", "NBA", "Autopick"];
  const allRows: (string | number)[][] = [allHeader];
  for (const p of picks) {
    allRows.push(
      isAuction
        ? [p.pick_number, p.team_idx, p.team_name, p.player_name, p.player_position ?? "", p.player_team ?? "", p.auction_price ?? 0]
        : [p.pick_number, p.round, p.team_idx, p.team_name, p.player_name, p.player_position ?? "", p.player_team ?? "", p.was_autopick ? "Yes" : ""]
    );
  }
  XLSX.utils.book_append_sheet(wb, aoaSheet(allRows), safeSheetName("All Picks", used));

  // ---- Per-team tabs ----
  const teams = Array.from(teamSet.entries()).sort((a, b) => a[0] - b[0]);
  for (const [idx, name] of teams) {
    const teamPicks = picks.filter((p) => p.team_idx === idx);
    const header = isAuction
      ? ["Pick #", "Player", "Pos", "NBA", "Price"]
      : ["Pick #", "Round", "Player", "Pos", "NBA", "Autopick"];
    const rows: (string | number)[][] = [
      [`Team ${idx} — ${name}`],
      [],
      header,
    ];
    for (const p of teamPicks) {
      rows.push(
        isAuction
          ? [p.pick_number, p.player_name, p.player_position ?? "", p.player_team ?? "", p.auction_price ?? 0]
          : [p.pick_number, p.round, p.player_name, p.player_position ?? "", p.player_team ?? "", p.was_autopick ? "Yes" : ""]
      );
    }
    rows.push([]);
    if (isAuction) {
      const spent = teamPicks.reduce((s, p) => s + (p.auction_price ?? 0), 0);
      rows.push(["Roster size", teamPicks.length]);
      rows.push(["Total spent", spent]);
      if (meta.budget) rows.push(["Budget remaining", meta.budget - spent]);
    } else {
      rows.push(["Roster size", teamPicks.length]);
      rows.push(["Autopicks", teamPicks.filter((p) => p.was_autopick).length]);
    }
    XLSX.utils.book_append_sheet(wb, aoaSheet(rows), safeSheetName(`T${idx} ${name}`, used));
  }

  // ---- By Position ----
  const byPos = new Map<string, PickRow[]>();
  for (const p of picks) {
    const pos = (p.player_position ?? "—").toUpperCase();
    if (!byPos.has(pos)) byPos.set(pos, []);
    byPos.get(pos)!.push(p);
  }
  const posRows: (string | number)[][] = [["Position", "Count", "Avg Pick", isAuction ? "Total $" : "Autopicks"]];
  for (const [pos, list] of Array.from(byPos.entries()).sort()) {
    const avg = list.reduce((s, p) => s + p.pick_number, 0) / list.length;
    const extra = isAuction
      ? list.reduce((s, p) => s + (p.auction_price ?? 0), 0)
      : list.filter((p) => p.was_autopick).length;
    posRows.push([pos, list.length, Math.round(avg * 10) / 10, extra]);
  }
  XLSX.utils.book_append_sheet(wb, aoaSheet(posRows), safeSheetName("By Position", used));

  // ---- By NBA Team ----
  const byNba = new Map<string, number>();
  for (const p of picks) {
    const t = p.player_team ?? "—";
    byNba.set(t, (byNba.get(t) ?? 0) + 1);
  }
  const nbaRows: (string | number)[][] = [["NBA Team", "Players Drafted"]];
  for (const [t, c] of Array.from(byNba.entries()).sort((a, b) => b[1] - a[1])) {
    nbaRows.push([t, c]);
  }
  XLSX.utils.book_append_sheet(wb, aoaSheet(nbaRows), safeSheetName("By NBA Team", used));

  // ---- Team Totals ----
  const totalsHeader = isAuction
    ? ["Team #", "Team", "Players", "Total Spent", "Avg $", "Most Expensive"]
    : ["Team #", "Team", "Players", "Autopicks", "First Pick", "Last Pick"];
  const totals: (string | number)[][] = [totalsHeader];
  for (const [idx, name] of teams) {
    const tp = picks.filter((p) => p.team_idx === idx);
    if (isAuction) {
      const spent = tp.reduce((s, p) => s + (p.auction_price ?? 0), 0);
      const top = tp.slice().sort((a, b) => (b.auction_price ?? 0) - (a.auction_price ?? 0))[0];
      totals.push([
        idx, name, tp.length, spent,
        tp.length ? Math.round((spent / tp.length) * 10) / 10 : 0,
        top ? `${top.player_name} ($${top.auction_price ?? 0})` : "",
      ]);
    } else {
      totals.push([
        idx, name, tp.length,
        tp.filter((p) => p.was_autopick).length,
        tp[0]?.pick_number ?? "",
        tp[tp.length - 1]?.pick_number ?? "",
      ]);
    }
  }
  XLSX.utils.book_append_sheet(wb, aoaSheet(totals), safeSheetName("Team Totals", used));

  // ---- Autopicks tab (snake only, when any) ----
  if (!isAuction && autopicks > 0) {
    const auto: (string | number)[][] = [["Pick #", "Round", "Team", "Player", "Pos", "NBA"]];
    picks.filter((p) => p.was_autopick).forEach((p) => {
      auto.push([p.pick_number, p.round, p.team_name, p.player_name, p.player_position ?? "", p.player_team ?? ""]);
    });
    XLSX.utils.book_append_sheet(wb, aoaSheet(auto), safeSheetName("Autopicks", used));
  }

  return wb;
}

export function downloadDraftXlsx(meta: DraftMeta, picks: PickRow[]) {
  const wb = buildDraftWorkbook(meta, picks);
  const safe = meta.roomName.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerDownload(`${safe}_draft.xlsx`, blob);
}
