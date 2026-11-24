import { PRODUCT_NAME } from "~/lib/brand";

/**
 * Browser-tab names for the signed-in app's sections, so a tab reads
 * "Projects" or "Pages" rather than the product name on every page. Detail
 * pages put their entity's own name on top of this through useDocumentTitle.
 *
 * Keys are route paths with the dynamic segments dropped, written relative to
 * the workspace (`/w/<slug>/…`) or the app root. The longest key that prefixes
 * the URL wins, so `/w/x/pages/<id>` reads "Pages" until the page names
 * itself, and `/w/x/crm/contacts` reads "Contacts" rather than "CRM".
 */
const SECTION_TITLES: Record<string, string> = {
  "": "Home",
  act: "Act",
  actions: "Actions",
  activity: "Activity",
  admin: "Admin",
  "admin/ai-interactions": "AI interactions",
  "admin/assistant-usage": "Assistant usage",
  "admin/feature-requests": "Feature requests",
  "admin/feedback": "Feedback",
  "admin/knowledge-index": "Knowledge index",
  "admin/users": "Users",
  "admin/whatsapp": "WhatsApp",
  agent: "Assistant",
  "ai-history": "AI history",
  "ai-sales-blog": "AI sales blog",
  "ai-sales-demo": "AI sales demo",
  "ai-sales-feedback": "AI sales feedback",
  alignment: "Alignment",
  calendar: "Calendar",
  ceremonies: "Ceremony",
  "change-log": "Change log",
  connections: "Connections",
  content: "Content",
  crm: "CRM",
  "crm/automations": "Automations",
  "crm/broadcasts": "Broadcasts",
  "crm/contacts": "Contacts",
  "crm/forms": "Forms",
  "crm/lists": "Lists",
  "crm/organizations": "Organizations",
  "crm/pipeline": "Pipeline",
  "crm/pipeline/settings": "Pipeline settings",
  "daily-plan": "Daily plan",
  days: "Days",
  decisions: "Decisions",
  "decisions/graph": "Decision graph",
  features: "Features",
  "github-integration": "GitHub",
  goals: "Goals",
  "google-access": "Google access",
  habits: "Habits",
  home: "Home",
  inbox: "Inbox",
  integrations: "Integrations",
  journal: "Journal",
  "knowledge-base": "Knowledge",
  meetings: "Meetings",
  metrics: "Metrics",
  "okr-checkin": "OKR check-in",
  okrs: "OKRs",
  onboarding: "Onboarding",
  pages: "Pages",
  people: "People",
  pillars: "Pillars",
  plan: "Plan",
  "product-timeline": "Product timeline",
  productivity: "Productivity",
  "productivity-methods/team-weekly-planning": "Team weekly planning",
  "productivity-methods/weekly-plan": "Weekly plan",
  products: "Products",
  "products-grid": "Products",
  "products-projects": "Product projects",
  "products-roadmap": "Roadmap",
  "products/new": "New product",
  projects: "Projects",
  "projects-tasks": "Tasks",
  quotes: "Quotes",
  recording: "Recording",
  recordings: "Recordings",
  roadmap: "Roadmap",
  settings: "Settings",
  "settings/agents": "Agents",
  "settings/agents/new": "New agent",
  "settings/ai-history": "AI history",
  "settings/ai-tools": "AI tools",
  "settings/api-keys": "API keys",
  "settings/appearance": "Appearance",
  "settings/assistant": "Assistant settings",
  "settings/availability": "Availability",
  "settings/ceremonies": "Ceremony settings",
  "settings/decisions": "Decision settings",
  "settings/integrations": "Integrations",
  "settings/notifications": "Notifications",
  "settings/plugins": "Plugins",
  "settings/profile": "Profile",
  simli: "Simli",
  "slack-messages": "Slack messages",
  "startup-routine": "Startup routine",
  teams: "Teams",
  time: "Time",
  timeline: "Timeline",
  today: "Today",
  upcoming: "Upcoming",
  video: "Video",
  videos: "Videos",
  views: "Views",
  "voice-debug": "Voice debug",
  "weekly-plan": "Weekly plan",
  "weekly-plan/history": "Weekly plan history",
  "weekly-plan/settings": "Weekly plan settings",
  "weekly-team-checkin": "Weekly check-in",
  "weekly-team-checkin/settings": "Weekly check-in settings",
  welcome: "Welcome",
  "wheel-of-life": "Wheel of life",
  "wheel-of-life/assessment": "Wheel of life assessment",
  "wheel-of-life/coach": "Wheel of life coach",
  "wind-down": "Wind down",
  wiki: "Wiki",
  workflows: "Workflows",
  "workflows/elevator-pitch": "Elevator pitch",
  "workflows/monday": "Monday workflow",
  "workflows/notion": "Notion workflow",
  workspace: "Workspace",
  workspaces: "Workspaces",
  "workspaces/new": "New workspace",
};

/**
 * Routes whose pages export their own Next `metadata` title. Left alone here,
 * so the section name doesn't overwrite the title Next already set.
 */
const METADATA_OWNED = ["docs", "privacy", "terms", "welcome/menu", "dev"];

function startsWithSegments(segments: string[], key: string): boolean {
  if (key === "") return true;
  const keySegments = key.split("/");
  return keySegments.every((part, i) => segments[i] === part);
}

/**
 * The section name for a pathname, or null when the route's page names the
 * tab itself through Next metadata. A path this map doesn't know (a 404, or a
 * route added without a key here) reads as the product name, so the previous
 * page's name never lingers on the tab.
 */
export function sectionTitleForPath(pathname: string): string | null {
  let segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "w") segments = segments.slice(2);

  if (METADATA_OWNED.some((key) => startsWithSegments(segments, key))) return null;

  // Longest key first, so "crm/contacts" beats "crm".
  const depth = (key: string) => (key === "" ? 0 : key.split("/").length);
  let best: string | null = null;
  for (const key of Object.keys(SECTION_TITLES)) {
    if (!startsWithSegments(segments, key)) continue;
    if (best === null || depth(key) > depth(best)) best = key;
  }
  // "" (the workspace root) only matches the root itself, not unknown routes.
  if (best === null || (best === "" && segments.length > 0)) return PRODUCT_NAME;
  return SECTION_TITLES[best] ?? PRODUCT_NAME;
}
