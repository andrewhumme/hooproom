// Editable site copy. Each field's `default` is the built-in wording; admins
// can override any field in Admin Tools → Site content (stored in the
// site_content table). Empty or missing overrides fall back to the default,
// so the site never shows a blank.

export type ContentKind = "text" | "textarea" | "markdown";

export type ContentField = {
  key: string;
  page: "Homepage" | "Terms of Service" | "Privacy Policy";
  section: string;
  label: string;
  kind: ContentKind;
  default: string;
  /** Page to open when previewing this field. */
  path: string;
};

const home = (section: string, key: string, label: string, kind: ContentKind, def: string) => ({
  key: `home.${key}`,
  page: "Homepage" as const,
  section,
  label,
  kind,
  default: def,
  path: "/",
});

const FEATURES: Array<[string, string]> = [
  [
    "Snake & auction",
    "Run a classic snake or a full auction with concurrent nominations and per-team quotas. Your call.",
  ],
  [
    "Custom everything",
    "Roster slots, scoring, pick clocks, budgets, nomination caps. Configure the lobby to match your league.",
  ],
  [
    "Live or slow",
    "Real-time rooms with sub-second picks, or multi-day slow drafts with autopick queues. Draft on your schedule.",
  ],
  [
    "Export anywhere",
    "One-click CSV export. Drop your results into ESPN, Yahoo, Sleeper, Fantrax — wherever your league actually lives.",
  ],
  [
    "Personal rankings & queues",
    "Pre-rank your board. Powers 'best available' suggestions and autopicks when you can't make it.",
  ],
  [
    "Offline draft assist",
    "Drafting in person? Use HoopRoom as the war room — track picks, see best available, export when you're done.",
  ],
];

const COMPARE_ROWS = [
  "Snake + auction in one tool",
  "Custom rules, clocks & rosters",
  "Concurrent auction nominations",
  "Slow drafts with autopick queues",
  "1-click CSV export to any platform",
  "Offline / in-person draft assist",
];

const TERMS_BODY = `Welcome to HoopRoom. These Terms of Service outline the basic rules for using our platform. By creating an account or joining a draft room, you agree to these terms.

## Use of the Platform
HoopRoom is a fantasy basketball draft tool. You may use the platform to create, join, and manage draft rooms. You are responsible for any activity that happens under your account.

## User Conduct
Please be respectful in draft rooms and public areas. Do not use HoopRoom to harass others, share harmful content, or attempt to disrupt the service.

## Accounts & Data
We may suspend or terminate accounts that violate these terms or abuse the platform. We reserve the right to remove content or data that we determine is inappropriate.

## Limitations
HoopRoom is provided as-is. We do not guarantee that the platform will always be available, error-free, or suitable for every league's specific rules. Draft results and stats are for entertainment and preparation purposes.

## Changes to These Terms
We may update these terms from time to time. Continued use of HoopRoom after changes means you accept the updated terms.

## Contact
Questions about these terms? Reach out through your HoopRoom account settings.`;

const PRIVACY_BODY = `This Privacy Policy describes how HoopRoom handles your information. By using the platform, you agree to the practices described here.

## Information We Collect
We collect basic account information (such as your email address and display name) and data related to your use of HoopRoom, including draft rooms you create or join.

## How We Use Information
We use your information to operate the platform, provide draft features, send optional notifications, and improve the service. We do not sell your personal information.

## Sharing & Disclosure
Your draft room activity may be visible to other participants in the same room, depending on the room settings. We may share information with service providers who help us run the platform, or when required by law.

## Cookies & Analytics
We may use cookies and similar technologies to keep you signed in and understand how the platform is used. You can manage cookie preferences through your browser settings.

## Data Retention
We keep your information for as long as your account is active or as needed to provide the service. You may request deletion of your account by contacting us.

## Changes to This Policy
We may update this Privacy Policy occasionally. We will notify users of significant changes by posting the new policy on this page.

## Contact
For privacy-related questions, please reach out through your HoopRoom account settings.`;

export const SITE_CONTENT: ContentField[] = [
  // ---- Homepage ----
  home("Search & sharing", "meta.title", "Page title (browser tab & search results)", "text", "HoopRoom — Real-time NBA Mock Drafts"),
  home(
    "Search & sharing",
    "meta.description",
    "Description (search results & link previews)",
    "textarea",
    "Live NBA fantasy mock drafts with real-time picks, smart rankings, and AI draft grades. The modern alternative to legacy mock draft sites.",
  ),
  home("Hero", "hero.badge", "Badge above the headline", "text", "NBA Season 25-26 · Build Your Draft, Your Way"),
  home("Hero", "hero.title", "Headline", "text", "The most customizable"),
  home("Hero", "hero.titleHighlight", "Headline — highlighted second line", "text", "draft room in fantasy hoops."),
  home(
    "Hero",
    "hero.subtitle",
    "Subheading",
    "textarea",
    "Snake or auction. Live, slow, or offline. You set the rules, the clock, the rosters — we handle the board. When you're done, export your draft results and let the games begin!",
  ),
  home("Hero", "hero.primaryCta", "Main button", "text", "Host a Draft"),
  home("Hero", "hero.secondaryCta", "Second button", "text", "Browse Lobby"),
  home("Hero", "stats.1.number", "Stat 1 — big text", "text", "Live or Slow"),
  home("Hero", "stats.1.label", "Stat 1 — label", "text", "Snake or auction, your call"),
  home("Hero", "stats.2.number", "Stat 2 — big text", "text", "450+"),
  home("Hero", "stats.2.label", "Stat 2 — label", "text", "Active NBA players"),
  home("Hero", "stats.3.number", "Stat 3 — big text", "text", "1-Click"),
  home("Hero", "stats.3.label", "Stat 3 — label", "text", "Export to any platform"),
  home("About", "about.title", "Heading", "text", "About HoopRoom"),
  home(
    "About",
    "about.body",
    "Text",
    "markdown",
    "**HoopRoom** is a free web app for running NBA fantasy basketball drafts. Commissioners create a draft room, invite their league, and run a live snake draft, an auction draft, a multi-day slow draft, or an in-person offline draft — with fully customizable roster slots, pick clocks, budgets and keepers. When the draft ends, every team's results can be exported to CSV and viewed on a draft summary page.",
  ),
  home("Features", "features.eyebrow", "Small label", "text", "The Toolkit"),
  home("Features", "features.title", "Heading", "text", "Built for managers who want control."),
  ...FEATURES.flatMap(([title, copy], i) => [
    home("Features", `features.${i + 1}.title`, `Feature ${i + 1} — title`, "text", title),
    home("Features", `features.${i + 1}.copy`, `Feature ${i + 1} — text`, "textarea", copy),
  ]),
  home("Comparison", "compare.eyebrow", "Small label", "text", "The Difference"),
  home("Comparison", "compare.title", "Heading", "text", "HoopRoom vs. the old guard."),
  home(
    "Comparison",
    "compare.subtitle",
    "Text",
    "textarea",
    "Most mock sites lock you into their format and their platform. HoopRoom is the pre-draft toolkit — you customize the room, then take the results wherever you want.",
  ),
  home("Comparison", "compare.competitor", "Competitor column heading", "text", "Legacy mock sites"),
  ...COMPARE_ROWS.map((label, i) =>
    home("Comparison", `compare.${i + 1}`, `Row ${i + 1}`, "text", label),
  ),
  home("Sign up", "signup.eyebrow", "Small label", "text", "Free to join"),
  home("Sign up", "signup.title", "Heading", "text", "Get in before tip-off."),
  home(
    "Sign up",
    "signup.body",
    "Text",
    "textarea",
    "Create your free HoopRoom account to host drafts, join your league's room, and keep your rankings and queues ready for draft day.",
  ),
  home("Sign up", "signup.button", "Button (signed-out visitors)", "text", "Create free account"),
  home("Sign up", "signup.signedInButton", "Button (signed-in members)", "text", "Host a draft"),
  home("Sign up", "signup.footnote", "Small print", "text", "Free to use. No credit card needed."),

  // ---- Terms ----
  ...legal("terms", "Terms of Service", "/terms", "HoopRoom terms of service and usage guidelines.", TERMS_BODY),
  // ---- Privacy ----
  ...legal("privacy", "Privacy Policy", "/privacy", "HoopRoom privacy policy and data practices.", PRIVACY_BODY),
];

function legal(
  prefix: string,
  page: "Terms of Service" | "Privacy Policy",
  path: string,
  description: string,
  body: string,
): ContentField[] {
  const f = (key: string, section: string, label: string, kind: ContentKind, def: string) => ({
    key: `${prefix}.${key}`,
    page,
    section,
    label,
    kind,
    default: def,
    path,
  });
  return [
    f("meta.title", "Search & sharing", "Page title (browser tab & search results)", "text", `${page} — HoopRoom`),
    f("meta.description", "Search & sharing", "Description (search results & link previews)", "textarea", description),
    f("title", "Page", "Heading", "text", page),
    f("updated", "Page", "Last updated line", "text", "Last updated: August 7, 2026"),
    f("body", "Page", "Body", "markdown", body),
  ];
}

const DEFAULTS = new Map(SITE_CONTENT.map((f) => [f.key, f.default]));

export type ContentMap = Record<string, string>;

/** The value to show for `key`: the admin override if set, else the default. */
export function contentValue(overrides: ContentMap | undefined, key: string): string {
  const v = overrides?.[key];
  return v != null && v.trim() !== "" ? v : (DEFAULTS.get(key) ?? "");
}

/** Bound lookup for a page: `const c = contentReader(data); c("home.hero.title")`. */
export function contentReader(overrides: ContentMap | undefined) {
  return (key: string) => contentValue(overrides, key);
}

/** Route `head` for a legal page, from its editable title/description. */
export function legalHead(prefix: "terms" | "privacy", overrides: ContentMap | undefined) {
  const c = contentReader(overrides);
  const title = c(`${prefix}.meta.title`);
  const description = c(`${prefix}.meta.description`);
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  };
}
