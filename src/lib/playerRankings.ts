// Curated 9-CAT-ish consensus ranking for autopick fallback ordering.
// Source: hand-curated 2024-25 fantasy basketball composite (FantasyPros / Hashtag Basketball
// blended). Intentionally conservative — used ONLY when the pick clock expires and we need
// a sensible "best available" fallback. Refresh per season.
//
// Names match balldontlie's first_name + " " + last_name format. Ties broken by curator's
// gut. Anyone NOT on this list falls to the end of the autopick order, sorted alphabetically.

export const TOP_RANKED_PLAYERS: string[] = [
  "Nikola Jokic",
  "Luka Doncic",
  "Shai Gilgeous-Alexander",
  "Victor Wembanyama",
  "Giannis Antetokounmpo",
  "Anthony Davis",
  "Tyrese Haliburton",
  "Jayson Tatum",
  "Domantas Sabonis",
  "Trae Young",
  "Anthony Edwards",
  "Damian Lillard",
  "Karl-Anthony Towns",
  "Donovan Mitchell",
  "LaMelo Ball",
  "De'Aaron Fox",
  "Paolo Banchero",
  "Devin Booker",
  "Jalen Brunson",
  "Cade Cunningham",
  "Jaren Jackson Jr.",
  "Pascal Siakam",
  "Bam Adebayo",
  "Stephen Curry",
  "Scottie Barnes",
  "Alperen Sengun",
  "Jaylen Brown",
  "Tyrese Maxey",
  "Kawhi Leonard",
  "Evan Mobley",
  "Kyrie Irving",
  "James Harden",
  "Chet Holmgren",
  "Darius Garland",
  "Jalen Williams",
  "Kevin Durant",
  "LeBron James",
  "Franz Wagner",
  "Jamal Murray",
  "Brandon Ingram",
  "Lauri Markkanen",
  "Ja Morant",
  "Joel Embiid",
  "Zion Williamson",
  "Devin Vassell",
  "Mikal Bridges",
  "Desmond Bane",
  "Julius Randle",
  "DeMar DeRozan",
  "Jrue Holiday",
  "Fred VanVleet",
  "Coby White",
  "Tyler Herro",
  "Jalen Johnson",
  "Walker Kessler",
  "Nikola Vucevic",
  "Brook Lopez",
  "Myles Turner",
  "Rudy Gobert",
  "Jakob Poeltl",
  "Daniel Gafford",
  "Jarrett Allen",
  "OG Anunoby",
  "Andrew Wiggins",
  "Michael Porter Jr.",
  "RJ Barrett",
  "Dejounte Murray",
  "CJ McCollum",
  "Zach LaVine",
  "Klay Thompson",
  "Bradley Beal",
  "Jordan Poole",
  "Anfernee Simons",
  "Immanuel Quickley",
  "Kyle Kuzma",
  "Bogdan Bogdanovic",
  "Buddy Hield",
  "Norman Powell",
  "Malik Monk",
  "Austin Reaves",
  "Nicolas Claxton",
  "Onyeka Okongwu",
  "Isaiah Hartenstein",
  "Naz Reid",
  "Jonas Valanciunas",
  "Robert Williams III",
  "Mitchell Robinson",
  "Christian Braun",
  "Aaron Gordon",
  "Herbert Jones",
  "Khris Middleton",
  "Tobias Harris",
  "John Collins",
  "Bobby Portis",
  "Jaden McDaniels",
  "Dyson Daniels",
  "Cam Thomas",
  "Brandon Miller",
  "Amen Thompson",
  "Toumani Camara",
  "Reed Sheppard",
  "Stephon Castle",
  "Zaccharie Risacher",
  "Donovan Clingan",
  "Alex Sarr",
];

const RANK_INDEX: Map<string, number> = new Map(
  TOP_RANKED_PLAYERS.map((name, i) => [name.toLowerCase(), i])
);

/** Lower number = higher priority. Unranked players get a large sentinel rank. */
export function rankOf(playerName: string): number {
  return RANK_INDEX.get(playerName.toLowerCase()) ?? 9999;
}

export function compareByRank(a: { name: string }, b: { name: string }): number {
  const ra = rankOf(a.name);
  const rb = rankOf(b.name);
  if (ra !== rb) return ra - rb;
  return a.name.localeCompare(b.name);
}
