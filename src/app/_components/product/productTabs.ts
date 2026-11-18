import {
  IconHome,
  IconLayoutList,
  IconBulb,
  IconCalendarClock,
  IconClipboardList,
  IconFlag,
  IconAffiliate,
  IconTargetArrow,
} from "@tabler/icons-react";

/**
 * The tabs of a product page, in tab-bar order. `href` is relative to
 * `/w/<workspace>/products/<product>`.
 *
 * Shared by the product layout (the tab bar) and the Cmd+K palette (which
 * offers each tab as somewhere to navigate), so a new tab shows up in both.
 * `keywords` are extra words the palette matches on, for tabs whose label is
 * not the word people search for ("tickets" finds Backlog).
 */
export const PRODUCT_TABS = [
  { value: "overview", href: "", label: "Overview", icon: IconHome, keywords: [] },
  { value: "backlog", href: "/tickets", label: "Backlog", icon: IconLayoutList, keywords: ["tickets"] },
  { value: "features", href: "/features", label: "Features", icon: IconBulb, keywords: [] },
  { value: "graph", href: "/graph", label: "Graph", icon: IconAffiliate, keywords: [] },
  { value: "cycles", href: "/cycles", label: "Cycles", icon: IconCalendarClock, keywords: ["sprints"] },
  { value: "insights", href: "/insights", label: "Insights", icon: IconTargetArrow, keywords: [] },
  { value: "decisions", href: "/decisions", label: "Decisions", icon: IconFlag, keywords: [] },
  {
    value: "retro",
    href: "/retrospectives",
    label: "Retro",
    icon: IconClipboardList,
    keywords: ["retrospectives"],
  },
] as const;
