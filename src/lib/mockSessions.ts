// Mock upcoming draft sessions — swap to DB in step 3
export type DraftSession = {
  id: string;
  name: string;
  scoringFormat: "9-CAT" | "8-CAT" | "POINTS" | "ROTO";
  teams: number;
  rounds: number;
  pickClockSec: number;
  startsAt: Date;
  joined: number;
  host: string;
  skill: "Casual" | "Competitive" | "Sharks";
};

const now = Date.now();

export const mockSessions: DraftSession[] = [
  {
    id: "ses_01",
    name: "Tip-Off Tuesday — Standard 12",
    scoringFormat: "9-CAT",
    teams: 12,
    rounds: 13,
    pickClockSec: 60,
    startsAt: new Date(now + 1000 * 60 * 12),
    joined: 9,
    host: "courtsidekev",
    skill: "Casual",
  },
  {
    id: "ses_02",
    name: "Sharks Only — Punt FT%",
    scoringFormat: "8-CAT",
    teams: 10,
    rounds: 13,
    pickClockSec: 30,
    startsAt: new Date(now + 1000 * 60 * 38),
    joined: 7,
    host: "puntmaster",
    skill: "Sharks",
  },
  {
    id: "ses_03",
    name: "Friday Night Lights — Points League",
    scoringFormat: "POINTS",
    teams: 12,
    rounds: 15,
    pickClockSec: 90,
    startsAt: new Date(now + 1000 * 60 * 60 * 2),
    joined: 11,
    host: "hardwood",
    skill: "Competitive",
  },
  {
    id: "ses_04",
    name: "Roto Rumble — 14 Team Deep",
    scoringFormat: "ROTO",
    teams: 14,
    rounds: 14,
    pickClockSec: 60,
    startsAt: new Date(now + 1000 * 60 * 60 * 4),
    joined: 5,
    host: "dimedrop",
    skill: "Competitive",
  },
  {
    id: "ses_05",
    name: "Speed Mock — 30 sec clock",
    scoringFormat: "9-CAT",
    teams: 10,
    rounds: 13,
    pickClockSec: 30,
    startsAt: new Date(now + 1000 * 60 * 60 * 6),
    joined: 4,
    host: "fastbreak",
    skill: "Casual",
  },
  {
    id: "ses_06",
    name: "Saturday Slam — Premier 12",
    scoringFormat: "9-CAT",
    teams: 12,
    rounds: 13,
    pickClockSec: 60,
    startsAt: new Date(now + 1000 * 60 * 60 * 22),
    joined: 6,
    host: "ringerlife",
    skill: "Sharks",
  },
];

export function formatRelative(date: Date): string {
  const diffMin = Math.round((date.getTime() - Date.now()) / 60000);
  if (diffMin < 1) return "Starting now";
  if (diffMin < 60) return `in ${diffMin} min`;
  const hrs = Math.round(diffMin / 60);
  if (hrs < 24) return `in ${hrs} hr${hrs > 1 ? "s" : ""}`;
  const days = Math.round(hrs / 24);
  return `in ${days} day${days > 1 ? "s" : ""}`;
}
