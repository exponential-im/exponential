import type { ComparisonPage } from "./types";

/*
 * Exponential's side of every table, in one place so the pages agree.
 * Competitor facts live in each page and come only from the sources listed
 * on it; re-read them before editing a price or a plan.
 */
const EXP_LICENCE =
  "Open source under AGPL-3.0-or-later: the app, the MCP server, the CLI and the SDK";
const EXP_HOSTING =
  "exponential.im, or your own servers (one-click Railway template, Docker Compose or from source)";
const EXP_PRICE =
  "Free: $0 for any number of people, no card. A Team plan is coming; its price isn't set. Self-hosted: free.";
const EXP_AGENTS =
  "Assign an action to your AI Assistant and it works inside the workspace, then asks you to approve. External agents (Claude, Cursor, Codex) connect through a local MCP server, the CLI or the SDK, each under its own identity.";
const EXP_GOALS =
  "Native goals and OKRs: key results with start, current and target values, check-ins and automatic status";
const EXP_MEETINGS =
  "Meeting transcripts with summaries, AI-drafted actions and decisions you review, and a Decision Log";
const EXP_DEV =
  "HTTP API, TypeScript SDK, CLI with JSON output, and an MCP server";
const EXP_IMPORT =
  "No Linear or Jira importer yet. Two-way ticket sync with Notion; anything else is scriptable with the CLI or SDK.";
const EXP_COMPLIANCE =
  "No SOC 2 or ISO certification. Self-host to keep the data on your own infrastructure.";

export const comparisons: ComparisonPage[] = [
  {
    kind: "versus",
    slug: "linear",
    competitor: "Linear",
    eyebrow: "Exponential vs Linear",
    seoTitle: "Linear Alternative: Exponential vs Linear",
    seoDescription:
      "Exponential vs Linear, compared honestly: licence, self-hosting, pricing, agents, goals and OKRs, and where Linear is still the better choice.",
    headline: "An open-source Linear alternative for teams that work with agents.",
    intro:
      "Linear is a hosted issue tracker and does that one job very well. Exponential is open source and broader: goals and OKRs, meetings, decisions and a CRM around the work, with AI agents as part of the team. Here's how they compare, including where Linear wins.",
    summary:
      "Linear is the polished, hosted issue tracker. Exponential is open source and puts goals, meetings and agents around the work.",
    checkedOn: "15 November 2026",
    pickCompetitor: [
      "Your team lives in issues and cycles, and you want a tracker that does only that, very well",
      "You need SOC 2, ISO 27001, HIPAA, SAML or SCIM today",
      "You want a hosted MCP endpoint, or third-party coding agents such as Codex or Devin assigned like teammates",
      "You want one-click importers from Jira, Asana, GitHub Issues or Shortcut",
    ],
    pickExponential: [
      "You want the code: AGPL-licensed, and self-hostable on your own infrastructure",
      "Goals, OKRs, meetings and decisions should live next to the work instead of in other tools",
      "You want to hand actions to an AI assistant that works inside the workspace and asks before it finishes",
      "You'd rather not have a free plan capped at 250 issues and two teams",
    ],
    rows: [
      {
        label: "Licence",
        exponential: EXP_LICENCE,
        competitor: "Proprietary. Linear's pages don't offer source code or self-hosting.",
      },
      {
        label: "Hosting",
        exponential: EXP_HOSTING,
        competitor: "Hosted by Linear, in the EU or US region chosen when the workspace is created",
      },
      {
        label: "Pricing",
        exponential: EXP_PRICE,
        competitor:
          "Free $0. Basic $10 per user/month billed yearly ($12 monthly). Business $16 yearly ($18 monthly). Enterprise custom, annual billing only.",
      },
      {
        label: "Free plan",
        exponential: "No limit on people, projects or actions",
        competitor: "Unlimited members, 2 teams, 250 issues, 10 MB uploads",
      },
      {
        label: "Agents and AI",
        exponential: EXP_AGENTS,
        competitor:
          "Agents are workspace members you assign issues to (Linear Agent, Codex, Devin and others), on all plans. Hosted MCP server at mcp.linear.app. Coding sessions and Loops are billed from prepaid credits.",
      },
      {
        label: "Goals and OKRs",
        exponential: EXP_GOALS,
        competitor: "Initiatives express goals and objectives. A separate OKR object isn't stated.",
      },
      {
        label: "Meetings and decisions",
        exponential: EXP_MEETINGS,
        competitor: "Not part of Linear's stated feature set",
      },
      {
        label: "Docs",
        exponential: "Knowledge pages with comments, history and public sharing",
        competitor: "Documents",
      },
      {
        label: "CRM",
        exponential: "Contacts, organisations and a deal pipeline",
        competitor: "Customer Requests; no CRM stated",
      },
      {
        label: "Developer access",
        exponential: EXP_DEV,
        competitor: "GraphQL API (the one Linear uses internally), TypeScript SDK, webhooks, OAuth 2.0",
      },
      {
        label: "Importing",
        exponential: EXP_IMPORT,
        competitor: "Importers from Jira, GitHub Issues, Asana, Shortcut and other Linear workspaces. CSV export.",
      },
      {
        label: "Compliance",
        exponential: EXP_COMPLIANCE,
        competitor: "SOC 2 Type II, ISO/IEC 27001:2022, HIPAA with a BAA, GDPR. SAML, SCIM and IP restrictions.",
      },
    ],
    competitorStrengths: [
      {
        title: "A focused, polished tracker",
        body: "Linear's whole product is the issue tracker, and it shows. Exponential spreads its effort across goals, meetings, agents and a CRM, and in places that breadth is newer and rougher.",
      },
      {
        title: "Compliance and identity",
        body: "SOC 2 Type II, ISO 27001, HIPAA with a BAA, SAML, SCIM and IP restrictions. If your security review needs those certificates today, Linear has them and Exponential doesn't.",
      },
      {
        title: "A bigger agent ecosystem",
        body: "Linear has a hosted MCP server any client can reach and a roster of third-party coding agents that take issues like teammates. Exponential's MCP server runs locally, so clients that need a hosted URL, such as ChatGPT, can't connect yet.",
      },
      {
        title: "Importers and scale",
        body: "One-click imports from Jira, Asana, GitHub Issues and Shortcut, and more than 50,000 companies on it by Linear's own count. Moving in is easy, and you won't be the first at your size.",
      },
    ],
    exponentialDifferences: [
      {
        title: "Open source and self-hostable",
        body: "The app, MCP server, CLI and SDK are AGPL-3.0. Run your own copy with the Railway template or Docker Compose, keep the data on your infrastructure, and read exactly what the software does.",
      },
      {
        title: "The why around the work",
        body: "Goals and OKRs with measurable key results and check-ins, projects linked to them, and a weekly plan that puts neglected projects first. The issue tracker is one part of the system rather than the whole of it.",
      },
      {
        title: "Meetings and decisions in the same place",
        body: "Bring meetings in from Fireflies or the Chrome extension, review AI-drafted actions and decisions, and keep a Decision Log that links every decision to the words it came from.",
      },
      {
        title: "An AI teammate inside the workspace",
        body: "Assign an action to your Assistant and it works on its own inside Exponential, asks whoever assigned it when it's stuck, and never marks work done without you. External agents use the MCP server, CLI and SDK under their own names.",
      },
    ],
    migration: {
      heading: "Moving from Linear",
      paragraphs: [
        "There's no one-click Linear importer yet, and it's better to read that here than to find out in your first hour. Linear exports issues, projects and initiatives as CSV, and its GraphQL API returns everything.",
        "From there a short script does the move. The exponential CLI's actions upsert creates one action per Linear issue, keyed on the issue's id, so re-running it updates rather than duplicates; tickets create covers a product backlog. Or connect Claude or Codex to the Exponential MCP server, hand it the CSV and let it do the typing.",
        "You don't have to move everything at once. Engineering can keep its issues in Linear while goals, meetings and weekly planning live in Exponential.",
      ],
    },
    faqs: [
      {
        question: "Is Exponential a Linear clone?",
        answer:
          "No. It has an issue tracker (tickets, cycles, dependencies) but is built around goals, meetings, decisions and AI agents as well. If you only want issues and cycles, Linear is more focused.",
      },
      {
        question: "Can I self-host Linear?",
        answer:
          "Not according to Linear's own pages: it's a hosted service with EU or US data regions. Exponential can be self-hosted under the AGPL.",
      },
      {
        question: "Which is cheaper?",
        answer:
          "Exponential's hosted plan is free today for any number of people, and self-hosting is free. Linear's Free plan allows 250 issues and two teams; paid plans start at $10 per user per month billed yearly. Exponential's Team plan has no price yet.",
      },
      {
        question: "Do both work with AI agents?",
        answer:
          "Yes. Linear has an agent platform and a hosted MCP server. Exponential has an AI Assistant you assign actions to, plus a local MCP server, a CLI and an SDK for external agents.",
      },
      {
        question: "Can I import my Linear data?",
        answer:
          "Not with a built-in importer yet. Export from Linear as CSV or through its API, then create actions or tickets with the exponential CLI or SDK, or let an agent do it through the MCP server.",
      },
    ],
    sources: [
      { label: "Linear pricing", url: "https://linear.app/pricing" },
      { label: "Linear security", url: "https://linear.app/security" },
      { label: "Linear MCP server", url: "https://linear.app/docs/mcp" },
      { label: "Linear agents", url: "https://linear.app/agents" },
      { label: "Linear AI credits", url: "https://linear.app/docs/ai-credits" },
      { label: "Linear initiatives", url: "https://linear.app/docs/initiatives" },
      { label: "Linear API and webhooks", url: "https://linear.app/docs/api-and-webhooks" },
      { label: "Linear import", url: "https://linear.app/docs/import-issues" },
      { label: "Linear export", url: "https://linear.app/docs/exporting-data" },
    ],
    related: [
      { label: "Exponential vs Jira", href: "/compare/jira" },
      { label: "Exponential vs Plane", href: "/compare/plane" },
      { label: "Open-source Linear alternatives", href: "/compare/open-source-linear-alternatives" },
      { label: "Pricing", href: "/pricing" },
      { label: "Self-hosting", href: "/docs/self-hosting" },
    ],
  },
  {
    kind: "versus",
    slug: "jira",
    competitor: "Jira",
    eyebrow: "Exponential vs Jira",
    seoTitle: "Jira Alternative for Startups and AI Agents",
    seoDescription:
      "Exponential vs Jira for startups: open source and self-hostable, with goals, meetings and agents built in, and where Jira is still the better choice.",
    headline: "A Jira alternative for startups that work with agents.",
    intro:
      "Jira is the default for large engineering organisations: deep workflows, a huge marketplace and a long list of compliance certificates. Exponential is built for small teams that want goals, meetings and AI agents around the work, and want to own the code. Atlassian stopped selling self-managed Data Center to new customers in March 2026, so if you need to self-host, Exponential is an option Jira no longer is.",
    summary:
      "Jira is the enterprise standard with a vast marketplace. Exponential is open source, self-hostable and built for small teams with agents.",
    checkedOn: "15 November 2026",
    pickCompetitor: [
      "You're a large organisation, or will be soon: Jira scales to 100,000 users per site",
      "You need certifications such as SOC 2, ISO 27001, HIPAA or FedRAMP",
      "You depend on Marketplace apps, Confluence or complex custom workflows",
      "You need planning across projects: dependencies, capacity and scenarios",
    ],
    pickExponential: [
      "You're a startup of a few people to a few dozen and want less to configure",
      "You need to self-host, and Data Center is no longer sold to new customers",
      "Goals, OKRs, meetings and decisions should sit next to the work without extra apps",
      "You want AI agents on a free plan; Rovo isn't included in Jira Free",
    ],
    rows: [
      {
        label: "Licence",
        exponential: EXP_LICENCE,
        competitor: "Proprietary",
      },
      {
        label: "Hosting",
        exponential: EXP_HOSTING,
        competitor:
          "Jira Cloud. Data Center (self-managed) hasn't been sold to new customers since 30 March 2026 and reaches end of life on 28 March 2029. Server support ended in February 2024.",
      },
      {
        label: "Pricing",
        exponential: EXP_PRICE,
        competitor:
          "Free for up to 10 users. At 10 users, Standard is $9.70 per user/month and Premium $19.60, with lower per-user rates at larger tiers. Enterprise is by quote for 801 or more users.",
      },
      {
        label: "Free plan",
        exponential: "No limit on people, projects or actions",
        competitor: "10 users, 2 GB storage, 150 automation steps a month, no Rovo AI",
      },
      {
        label: "Agents and AI",
        exponential: EXP_AGENTS,
        competitor:
          "Rovo Search, Chat and Agents on paid plans, with monthly credit allowances of 25, 70 or 150 per user. Rovo MCP Server. Agents can run as steps in automation rules.",
      },
      {
        label: "Goals and OKRs",
        exponential: EXP_GOALS,
        competitor: "Goals on every plan; \"Goals, projects, and communication\" is marked beta",
      },
      {
        label: "Planning",
        exponential:
          "Projects, actions, tickets with dependencies, cycles, sprints and a weekly plan",
        competitor:
          "Boards, backlogs, sprints and timelines. Plans (advanced planning) on Premium and above.",
      },
      {
        label: "Meetings and decisions",
        exponential: EXP_MEETINGS,
        competitor: "Not part of Jira's stated feature set",
      },
      {
        label: "Docs",
        exponential: "Knowledge pages with comments, history and public sharing",
        competitor: "Confluence, a separate product",
      },
      {
        label: "Developer access",
        exponential: EXP_DEV,
        competitor: "REST API v3, webhooks, Forge and Connect app frameworks, the Atlassian CLI for admins",
      },
      {
        label: "Importing",
        exponential: EXP_IMPORT,
        competitor: "CSV and JSON import; direct import from Asana, Notion and Trello. Full site backup export.",
      },
      {
        label: "Compliance",
        exponential: EXP_COMPLIANCE,
        competitor:
          "35 compliance listings, including SOC 2, ISO/IEC 27001, HIPAA and FedRAMP. 99.9% uptime SLA on Premium, 99.95% on Enterprise.",
      },
    ],
    competitorStrengths: [
      {
        title: "Scale and governance",
        body: "Up to 100,000 users per site, up to 150 sites on Enterprise, and uptime SLAs. Exponential is built for small teams and doesn't claim that scale.",
      },
      {
        title: "Compliance",
        body: "Atlassian's trust centre lists 35 compliance items, from SOC 2 and ISO 27001 to HIPAA and FedRAMP. Exponential has no certifications.",
      },
      {
        title: "The ecosystem",
        body: "Confluence, the Atlassian Marketplace and years of integrations. If a tool exists, it probably connects to Jira.",
      },
      {
        title: "Planning depth",
        body: "Plans on Premium handles dependencies across projects, capacity and scenario modelling. Exponential has dependencies and cycles but no capacity or scenario planning.",
      },
    ],
    exponentialDifferences: [
      {
        title: "Self-hosting is still on the table",
        body: "The whole product is AGPL-3.0 and runs on your own servers with the Railway template or Docker Compose. With Data Center closed to new customers, that matters if your data can't leave your infrastructure.",
      },
      {
        title: "Less to configure",
        body: "No workflow schemes or permission schemes to design before the team can start. Projects, actions and a weekly plan work on day one, and advanced features (sprints, estimates, blockers) are switches you turn on when you need them.",
      },
      {
        title: "Goals, meetings and decisions included",
        body: "Native OKRs with check-ins, meeting transcripts that turn into reviewed actions and decisions, and a Decision Log, without buying and wiring up extra apps.",
      },
      {
        title: "Agents on every plan",
        body: "Assign an action to your AI Assistant, or connect Claude, Cursor or Codex through the MCP server, CLI and SDK, on the free plan.",
      },
    ],
    migration: {
      heading: "Moving from Jira",
      paragraphs: [
        "There's no Jira importer in Exponential yet. Jira exports work items as CSV, and its REST API returns everything else, including comments and links.",
        "Map Jira projects to Exponential projects, epics to epics, and work items to actions or tickets, then script the import with the exponential CLI or SDK. Using actions upsert keyed on the Jira issue key makes the script safe to re-run. An agent with the MCP server connected can do the same from a CSV.",
        "Workflows, automation rules and Marketplace app data don't carry over. Check which ones your team depends on before you switch.",
      ],
    },
    faqs: [
      {
        question: "Can I still self-host Jira?",
        answer:
          "Not as a new customer. Atlassian stopped selling Data Center to new customers on 30 March 2026; existing customers can buy until 30 March 2028, and Data Center reaches end of life on 28 March 2029.",
      },
      {
        question: "Is Exponential cheaper than Jira?",
        answer:
          "Exponential's hosted plan is free today for any number of people, and self-hosting is free. Jira is free for up to 10 users; at 10 users, Standard is $9.70 per user per month.",
      },
      {
        question: "Does Exponential have sprints?",
        answer:
          "Yes: cycles in the Product Management plugin, and sprints on actions when advanced action features are on.",
      },
      {
        question: "Does Exponential replace Confluence?",
        answer:
          "Knowledge pages cover specs, PRDs and notes, with comments, history and public sharing. Large wikis with complex permission structures are where Confluence stays stronger.",
      },
      {
        question: "Can I import from Jira?",
        answer:
          "Not with a built-in importer yet. Export as CSV or use Jira's REST API, then create projects, actions and tickets with the exponential CLI or SDK.",
      },
    ],
    sources: [
      { label: "Jira pricing", url: "https://www.atlassian.com/software/jira/pricing" },
      { label: "Jira licensing", url: "https://www.atlassian.com/licensing/jira" },
      { label: "Atlassian Data Center timeline", url: "https://www.atlassian.com/migration" },
      { label: "Server end of support", url: "https://www.atlassian.com/licensing/server-end-of-support" },
      { label: "Jira AI and Rovo", url: "https://www.atlassian.com/software/jira/ai" },
      { label: "Rovo MCP Server", url: "https://www.atlassian.com/platform/rovo-mcp" },
      { label: "Jira REST API", url: "https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/" },
      { label: "Atlassian CLI", url: "https://developer.atlassian.com/cloud/acli/guides/introduction/" },
      { label: "Importing into Jira", url: "https://support.atlassian.com/jira-cloud-administration/docs/migrate-from-other-issue-trackers/" },
      { label: "Atlassian compliance", url: "https://www.atlassian.com/trust/compliance/resources" },
    ],
    related: [
      { label: "Exponential vs Linear", href: "/compare/linear" },
      { label: "Exponential vs OpenProject", href: "/compare/openproject" },
      { label: "Pricing", href: "/pricing" },
      { label: "Self-hosting", href: "/docs/self-hosting" },
      { label: "Exponential CLI", href: "/features/integrations/cli" },
    ],
  },
  {
    kind: "versus",
    slug: "plane",
    competitor: "Plane",
    eyebrow: "Exponential vs Plane",
    seoTitle: "Plane Alternative: Exponential vs Plane",
    seoDescription:
      "Exponential vs Plane: two AGPL project tools compared on self-hosting, pricing, AI, goals and meetings, including where Plane is the better choice.",
    headline: "Two open-source tools, built around different questions.",
    intro:
      "Plane and Exponential are both AGPL-licensed and both self-hostable. Plane is an open-source issue and project tracker in the Linear and Jira mould, with a commercial edition for its paid features. Exponential puts goals, meetings, decisions and AI agents around the work, and the self-hosted version is the whole product. Here's the honest comparison.",
    summary:
      "Both are AGPL. Plane is a full-featured tracker with a commercial edition; Exponential self-hosts the whole product and adds goals, meetings and agents.",
    checkedOn: "15 November 2026",
    pickCompetitor: [
      "You want a Linear- or Jira-style tracker with Gantt, modules, milestones and dashboards",
      "You need importers from Jira, Linear, Asana or ClickUp",
      "You need SOC 2 or ISO 27001, SAML or an air-gapped deployment",
      "You want a hosted MCP server and Python as well as Node SDKs",
    ],
    pickExponential: [
      "You want every feature when you self-host, with no separate commercial edition",
      "Goals and OKRs with key results and check-ins should be first-class",
      "Meetings, decisions and a CRM belong in the same tool as the work",
      "You want an AI assistant you can assign actions to, on the free plan",
    ],
    rows: [
      {
        label: "Licence",
        exponential: EXP_LICENCE,
        competitor:
          "Community Edition AGPL-3.0, matching the Free plan's features. Paid features need the Commercial Edition.",
      },
      {
        label: "Hosting",
        exponential: EXP_HOSTING,
        competitor:
          "Plane Cloud, or self-hosted with Docker Compose, Kubernetes, Docker Swarm, Coolify, Portainer and more. An air-gapped edition is available.",
      },
      {
        label: "Pricing",
        exponential: EXP_PRICE,
        competitor:
          "Free $0. Pro $6 per seat/month yearly ($8 monthly). Business $13 yearly ($15 monthly). Enterprise Grid by quote. Same prices cloud and self-hosted; self-hosted paid plans need at least 10 seats.",
      },
      {
        label: "Free plan",
        exponential: "No limit on people, projects or actions",
        competitor:
          "12 users. No wiki, time tracking, initiatives, dashboards, AI credits or GitHub and Slack integrations on Free.",
      },
      {
        label: "Agents and AI",
        exponential: EXP_AGENTS,
        competitor:
          "Plane AI and assignable agents, on credits: 500 per seat a month on Pro, 1,000 on Business, none listed for Free. Hosted MCP server (MIT) with 30 tools. Self-hosters bring their own model keys.",
      },
      {
        label: "Goals and OKRs",
        exponential: EXP_GOALS,
        competitor: "Initiatives to \"codify your mission and objectives\"; native OKRs not stated",
      },
      {
        label: "Planning",
        exponential:
          "Projects, actions, tickets with dependencies, cycles and a weekly plan",
        competitor:
          "Work items, cycles, modules, epics, milestones, releases, Gantt with dependencies, dashboards",
      },
      {
        label: "Meetings and decisions",
        exponential: EXP_MEETINGS,
        competitor: "Not part of Plane's stated feature set",
      },
      {
        label: "Docs and CRM",
        exponential: "Knowledge pages; contacts, organisations and a deal pipeline",
        competitor: "Pages on every plan, wiki on Pro and up. A Customers feature on Business; no CRM stated.",
      },
      {
        label: "Developer access",
        exponential: EXP_DEV,
        competitor:
          "REST API with 180+ endpoints and an OpenAPI spec, webhooks, Node and Python SDKs, Plane Compose CLI",
      },
      {
        label: "Importing",
        exponential: EXP_IMPORT,
        competitor:
          "Jira, Linear, Asana, ClickUp and CSV on all plans; Notion and Confluence on Business. CSV, Excel and JSON export on Pro.",
      },
      {
        label: "Compliance",
        exponential: EXP_COMPLIANCE,
        competitor: "SOC 2, ISO 27001, GDPR and CCPA, by Plane's own pages; 99.95% uptime SLA",
      },
    ],
    competitorStrengths: [
      {
        title: "A deeper tracker",
        body: "Modules, milestones, releases, Gantt with dependencies and dashboards. If what you need is a full-featured issue and project tracker, Plane has more of it than Exponential.",
      },
      {
        title: "Importers on every plan",
        body: "Jira, Linear, Asana, ClickUp and CSV, even on Free. Exponential has no importers for these tools yet.",
      },
      {
        title: "Enterprise and air-gapped",
        body: "SOC 2 and ISO 27001 by Plane's own account, SAML on Business, LDAP and audit logs on Enterprise, and an air-gapped edition. Exponential has none of these.",
      },
      {
        title: "Developer tooling and community",
        body: "A hosted MCP server, Node and Python SDKs, a project-as-code CLI, and tens of thousands of GitHub stars. A larger community means more answers already written.",
      },
    ],
    exponentialDifferences: [
      {
        title: "The whole product, self-hosted",
        body: "There's no commercial edition. Self-host Exponential and you get every feature, for any number of people, under the AGPL.",
      },
      {
        title: "Goals and OKRs first",
        body: "Objectives with measurable key results, automatic status on every check-in, and projects linked to the goals they serve. A weekly plan puts the neglected projects first.",
      },
      {
        title: "Meetings, decisions and a CRM",
        body: "Meeting transcripts become reviewed actions and decisions, the Decision Log keeps the quote each decision came from, and contacts and deals live alongside the work.",
      },
      {
        title: "AI on the free plan",
        body: "Assign an action to your AI Assistant, or connect Claude, Cursor or Codex through the MCP server, CLI and SDK, without buying a paid plan or credits.",
      },
    ],
    migration: {
      heading: "Moving from Plane",
      paragraphs: [
        "There's no Plane importer yet. Plane exports CSV, Excel and JSON on Pro and above, and its REST API and SDKs return everything on any plan.",
        "Script the move with the exponential CLI or SDK: actions upsert, keyed on the Plane work item's id, makes the script safe to re-run, and tickets create covers a product backlog. An agent connected to both MCP servers can do the copying for you.",
      ],
    },
    faqs: [
      {
        question: "Are both really open source?",
        answer:
          "Yes, both are AGPL-3.0. The difference is that Plane's paid features are in a separate Commercial Edition, while Exponential's self-hosted version is the whole product.",
      },
      {
        question: "Which is cheaper?",
        answer:
          "Exponential's hosted plan is free today for any number of people, and self-hosting is free. Plane's Free plan allows 12 users; Pro is $6 per seat per month billed yearly. Exponential's Team plan has no price yet.",
      },
      {
        question: "Does Plane have OKRs?",
        answer:
          "Plane's pages describe initiatives for mission and objectives, but not native OKRs with key results. Exponential has OKRs built in.",
      },
      {
        question: "Can I import from Plane?",
        answer:
          "Not with a built-in importer. Export from Plane or use its API, then create actions or tickets with the exponential CLI or SDK.",
      },
    ],
    sources: [
      { label: "Plane pricing", url: "https://plane.so/pricing" },
      { label: "Plane self-hosted", url: "https://plane.so/self-hosted" },
      { label: "Plane editions", url: "https://developers.plane.so/self-hosting/editions-and-versions" },
      { label: "Plane AI", url: "https://plane.so/ai" },
      { label: "Plane MCP server", url: "https://developers.plane.so/dev-tools/mcp-server" },
      { label: "Plane developer docs", url: "https://developers.plane.so/" },
      { label: "Plane source on GitHub", url: "https://github.com/makeplane/plane" },
    ],
    related: [
      { label: "Open-source Linear alternatives", href: "/compare/open-source-linear-alternatives" },
      { label: "Exponential vs OpenProject", href: "/compare/openproject" },
      { label: "Exponential vs Linear", href: "/compare/linear" },
      { label: "Self-hosting", href: "/docs/self-hosting" },
      { label: "OKRs", href: "/features/okrs" },
    ],
  },
  {
    kind: "versus",
    slug: "openproject",
    competitor: "OpenProject",
    eyebrow: "Exponential vs OpenProject",
    seoTitle: "OpenProject Alternative: Exponential",
    seoDescription:
      "Exponential vs OpenProject: classic open-source project management against an AI-native one. Licences, hosting, pricing, meetings, OKRs and agents compared.",
    headline: "Classic project management, or AI-native execution?",
    intro:
      "OpenProject is mature, GPL-licensed project management: Gantt charts, baselines, budgets, time and cost tracking and a meetings module, with strong EU hosting. Exponential is younger and built for small teams working alongside AI agents, with goals, decisions and an assistant at the centre. Both can run on your own servers.",
    summary:
      "OpenProject is mature, classic project and portfolio management. Exponential is AI-native, with goals, decisions and agents at its centre.",
    checkedOn: "15 November 2026",
    pickCompetitor: [
      "You run classic, plan-driven projects: Gantt, baselines, work breakdown structures, budgets",
      "You need portfolio or resource management, or BIM for construction",
      "You want a free Jira Migrator, and time and cost tracking on a free edition",
      "EU hosting and a long track record matter more than AI features",
    ],
    pickExponential: [
      "You want AI agents doing real work, with an assistant on the free plan and an MCP server on every plan",
      "OKRs with measurable key results should be native, not modelled as work packages",
      "Your team is small and moves in cycles and weekly plans rather than Gantt charts",
      "Decisions, meeting outcomes and a CRM should live next to the work",
    ],
    rows: [
      {
        label: "Licence",
        exponential: EXP_LICENCE,
        competitor:
          "GPL-3.0 Community edition. Team planner, SSO, MCP, portfolio and resource management and more are in paid Enterprise editions.",
      },
      {
        label: "Hosting",
        exponential: EXP_HOSTING,
        competitor:
          "Self-hosted with DEB/RPM packages, Docker, Kubernetes or Helm, or OpenProject's cloud, with Enterprise cloud data stored in the EU",
      },
      {
        label: "Pricing",
        exponential: EXP_PRICE,
        competitor:
          "Community free, unlimited users. Basic $7.25 (€5.95), Professional $13.50 (€10.95), Premium $19.50 (€15.95) per user/month on a yearly term; Corporate on request. Minimums from 5 to 250 users.",
      },
      {
        label: "Free edition",
        exponential: "The whole product, hosted or self-hosted, for any number of people",
        competitor:
          "Community: unlimited users and projects, with Gantt, boards, wiki, meetings, time and cost tracking",
      },
      {
        label: "Agents and AI",
        exponential: EXP_AGENTS,
        competitor:
          "No built-in generative AI yet (text assistance and semantic search are planned). An MCP server is an Enterprise add-on on Professional and above.",
      },
      {
        label: "Goals and OKRs",
        exponential: EXP_GOALS,
        competitor: "Modelled as work packages with parent-child links in a dedicated project",
      },
      {
        label: "Planning",
        exponential:
          "Projects, actions, tickets with dependencies, cycles and a weekly plan",
        competitor:
          "Work packages, Gantt, baselines, work breakdown structure, agile boards with backlogs, versions and roadmaps",
      },
      {
        label: "Meetings",
        exponential: EXP_MEETINGS,
        competitor: "A Meetings module, in the free Community edition",
      },
      {
        label: "Time and cost",
        exponential: "Time entries on actions, with timers and a day view",
        competitor: "Time tracking, costs and budgets in Community",
      },
      {
        label: "Developer access",
        exponential: EXP_DEV,
        competitor: "REST API v3 with an OpenAPI spec, webhooks, SCIM, BCF for BIM. Community client libraries only.",
      },
      {
        label: "Importing",
        exponential: EXP_IMPORT,
        competitor: "Free Jira Migrator on all plans. CSV import is in development.",
      },
    ],
    competitorStrengths: [
      {
        title: "Classic project management depth",
        body: "Gantt charts, baselines, work breakdown structures, budgets, costs, and portfolio and resource management. Exponential has none of baselines, budgets or resource planning.",
      },
      {
        title: "A generous free edition",
        body: "Unlimited users with meetings, time tracking and cost tracking included. If those are what you need, OpenProject Community gives them away.",
      },
      {
        title: "Maturity and EU hosting",
        body: "Over 30 million downloads and 425 contributors by OpenProject's count, and Enterprise cloud data held in the EU. It has been doing this far longer than Exponential.",
      },
      {
        title: "A free Jira Migrator",
        body: "Projects, issues, history, comments, attachments, users and groups come over from Jira on every plan. Exponential has no importer yet.",
      },
    ],
    exponentialDifferences: [
      {
        title: "Built for agents",
        body: "An AI Assistant you assign actions to, plus an MCP server, CLI and SDK for Claude, Cursor and Codex, all on the free plan. OpenProject's MCP server needs an Enterprise edition, and its generative AI is still planned.",
      },
      {
        title: "Native OKRs",
        body: "Key results with start, current and target values, check-ins and automatic status, linked to the projects meant to move them, rather than work packages arranged to look like OKRs.",
      },
      {
        title: "Decisions and meeting outcomes",
        body: "Meeting transcripts become reviewed actions and decisions, and the Decision Log keeps the words each decision came from.",
      },
      {
        title: "Lighter by design",
        body: "Cycles, a weekly plan and a Today view for small teams that move fast, instead of plans drawn up in advance. If you need a baseline, that's a reason to pick OpenProject.",
      },
    ],
    migration: {
      heading: "Moving from OpenProject",
      paragraphs: [
        "There's no OpenProject importer yet. OpenProject exports work packages as CSV, XLS or PDF, and its REST API returns everything, including relations.",
        "Map projects to projects and work packages to actions or tickets, then script the move with the exponential CLI or SDK. Using actions upsert keyed on the work package id makes the script safe to re-run.",
      ],
    },
    faqs: [
      {
        question: "Are both open source?",
        answer:
          "Yes. OpenProject's Community edition is GPL-3.0, with more features in paid Enterprise editions. Exponential is AGPL-3.0, and the self-hosted version is the whole product.",
      },
      {
        question: "Does OpenProject have AI?",
        answer:
          "Not built in yet: OpenProject says text assistance and semantic search are planned. Its MCP server, for connecting your own AI client, is an Enterprise add-on on Professional and above.",
      },
      {
        question: "Does Exponential have Gantt charts?",
        answer:
          "It has a timeline view for projects and goals, but not baselines, work breakdown structures or budgets. For plan-driven projects, OpenProject is the stronger tool.",
      },
      {
        question: "Can I import from OpenProject?",
        answer:
          "Not with a built-in importer. Export work packages or use OpenProject's API, then create actions or tickets with the exponential CLI or SDK.",
      },
    ],
    sources: [
      { label: "OpenProject pricing", url: "https://www.openproject.org/pricing/" },
      { label: "OpenProject Community edition", url: "https://www.openproject.org/community-edition/" },
      { label: "OpenProject installation", url: "https://www.openproject.org/download-and-installation/" },
      { label: "OpenProject AI", url: "https://www.openproject.org/ai/" },
      { label: "OpenProject MCP server", url: "https://www.openproject.org/docs/system-admin-guide/integrations/mcp-server/" },
      { label: "OpenProject API", url: "https://www.openproject.org/docs/api/" },
      { label: "OpenProject OKRs", url: "https://www.openproject.org/okr-software/" },
      { label: "OpenProject Jira Migrator", url: "https://www.openproject.org/jira-migrator/" },
      { label: "OpenProject security and privacy", url: "https://www.openproject.org/security-and-privacy/" },
    ],
    related: [
      { label: "Exponential vs Plane", href: "/compare/plane" },
      { label: "Exponential vs Jira", href: "/compare/jira" },
      { label: "Open-source Linear alternatives", href: "/compare/open-source-linear-alternatives" },
      { label: "OKRs", href: "/features/okrs" },
      { label: "Self-hosting", href: "/docs/self-hosting" },
    ],
  },
  {
    kind: "roundup",
    slug: "open-source-linear-alternatives",
    eyebrow: "Open-source Linear alternatives",
    seoTitle: "Open-Source Linear Alternatives Compared",
    seoDescription:
      "Plane, OpenProject and Exponential compared as open-source Linear alternatives: licence, self-hosting, pricing and AI agents, with who each one suits.",
    headline: "Open-source Linear alternatives, compared.",
    intro:
      "Linear isn't open source and can't be self-hosted. If either matters to you, these are the open-source options we'd look at: Plane, OpenProject and our own, Exponential. Each suits a different kind of team.",
    summary:
      "Plane, OpenProject and Exponential side by side: licence, hosting, pricing and agents, and which kind of team each one suits.",
    checkedOn: "15 November 2026",
    criteria: [
      "An OSI-approved open-source licence for the code you can run",
      "Self-hosting you can actually do, and what it leaves out",
      "Price, hosted and self-hosted",
      "Support for AI agents: assistants, MCP servers, APIs and CLIs",
      "How close it feels to Linear's issue-and-cycle workflow",
    ],
    alternatives: [
      {
        name: "Plane",
        href: "/compare/plane",
        licence:
          "AGPL-3.0 Community Edition, matching the Free plan's features; paid features in a Commercial Edition",
        hosting:
          "Plane Cloud or self-hosted (Docker Compose, Kubernetes, Swarm and more), including air-gapped",
        pricing:
          "Free for 12 users; Pro $6 and Business $13 per seat/month billed yearly",
        agents:
          "Plane AI and assignable agents on credits (Pro and up); hosted MCP server; Node and Python SDKs",
        bestFor:
          "Teams that want the closest thing to Linear, open source: cycles, modules, Gantt, and importers from Linear and Jira",
        watchOut:
          "Self-hosted Community Edition has only the Free plan's features; the wiki, time tracking and initiatives are paid",
      },
      {
        name: "OpenProject",
        href: "/compare/openproject",
        licence: "GPL-3.0 Community edition; more in paid Enterprise editions",
        hosting:
          "Self-hosted (packages, Docker, Kubernetes) or OpenProject's EU cloud",
        pricing:
          "Community free for unlimited users; Basic from $7.25 per user/month on a yearly term",
        agents:
          "No built-in generative AI yet; MCP server is an Enterprise add-on",
        bestFor:
          "Plan-driven projects that need Gantt, baselines, budgets, meetings and time tracking",
        watchOut:
          "It's classic project management, not a fast issue tracker; most of Linear's feel is missing by design",
      },
      {
        name: "Exponential",
        licence:
          "AGPL-3.0: the app, MCP server, CLI and SDK; no commercial edition",
        hosting:
          "exponential.im, or self-hosted with a one-click Railway template or Docker Compose",
        pricing:
          "Free for any number of people today; Team plan coming, price not set; self-hosting free",
        agents:
          "An AI Assistant you assign actions to; a local MCP server, CLI and SDK for Claude, Cursor and Codex",
        bestFor:
          "Small teams that want goals, OKRs, meetings and decisions around the work, with AI agents as part of the team",
        watchOut:
          "Younger than both: no importers from Linear or Jira yet, no compliance certifications, and a tracker that's less deep than Plane's",
      },
    ],
    faqs: [
      {
        question: "Is Linear open source?",
        answer:
          "No. Linear is a proprietary hosted service, and its pages don't offer self-hosting.",
      },
      {
        question: "Which alternative is closest to Linear?",
        answer:
          "Plane. Its cycles, modules and issue views follow the same model, and it imports from Linear directly.",
      },
      {
        question: "Which one is best for AI agents?",
        answer:
          "Exponential and Plane both have MCP servers and APIs. Exponential includes an assistant you can assign actions to on its free plan; Plane's AI and agents need a paid plan's credits. OpenProject's MCP server is an Enterprise add-on.",
      },
      {
        question: "Can I self-host all of them for free?",
        answer:
          "Yes, with differences. Exponential self-hosts the whole product. Plane's free Community Edition matches its Free plan. OpenProject's free Community edition leaves some features to paid editions.",
      },
    ],
    sources: [
      { label: "Linear pricing", url: "https://linear.app/pricing" },
      { label: "Plane pricing", url: "https://plane.so/pricing" },
      { label: "Plane editions", url: "https://developers.plane.so/self-hosting/editions-and-versions" },
      { label: "Plane source on GitHub", url: "https://github.com/makeplane/plane" },
      { label: "OpenProject pricing", url: "https://www.openproject.org/pricing/" },
      { label: "OpenProject AI", url: "https://www.openproject.org/ai/" },
      { label: "OpenProject source on GitHub", url: "https://github.com/opf/openproject" },
    ],
    related: [
      { label: "Exponential vs Linear", href: "/compare/linear" },
      { label: "Exponential vs Plane", href: "/compare/plane" },
      { label: "Exponential vs OpenProject", href: "/compare/openproject" },
      { label: "Self-hosting", href: "/docs/self-hosting" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
];

export function getComparisonBySlug(slug: string): ComparisonPage | undefined {
  return comparisons.find((c) => c.slug === slug);
}

export function getAllComparisonSlugs(): string[] {
  return comparisons.map((c) => c.slug);
}
