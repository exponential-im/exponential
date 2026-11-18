import type { JSONContent } from "@tiptap/core";

import { PILL_COLORS, PROPERTY_TYPES, type PillColor, type PropertyType } from "~/lib/databases/schema";
import { youTubeVideoFromAttrs } from "~/lib/prd/youtube";

/**
 * Sanitize a canonical ProseMirror `bodyDoc` for the unauthenticated public
 * render (ADR-0038). The schema already constrains what `generateHTML` can
 * emit; this pass closes the attribute-level gaps:
 *
 *  - `link` marks keep only http(s)/mailto hrefs (drops `javascript:` etc.)
 *  - `image` nodes keep only http(s) srcs (drops `data:`/`javascript:`)
 *  - `youtube` nodes keep only a valid video id and start second
 *  - `comment` marks are internal collaboration artifacts and are stripped,
 *    matching the Markdown projection, which also drops them (ADR-0024)
 *  - `pageLink` nodes resolve through the caller-supplied map of **published**
 *    targets: a published target becomes a plain paragraph linking to its
 *    public URL (live title); an unpublished/unknown target keeps only the
 *    cached title — the page id and internal workspace path are private and
 *    must not leak into public HTML
 *  - `database` nodes (ADR-0078) become `publicDatabase` nodes carrying the
 *    caller-supplied projection; a database not in the map is dropped
 *
 * Pure and isomorphic — unit-testable without a DOM.
 */

const SAFE_LINK_HREF = /^(?:https?:|mailto:)/i;
const SAFE_IMAGE_SRC = /^https?:/i;

/** A published pageLink target: its live title and public path (`/p/…`). */
export interface PublicPageLinkTarget {
  title: string;
  href: string;
}

export type PublicPageLinkMap = ReadonlyMap<string, PublicPageLinkTarget>;

/** A column of a database on the public render: its name, type (for the header glyph) and width. */
export interface PublicDatabaseColumn {
  name: string;
  type: PropertyType;
  /** Pixels; the saved width, else the type's default (`columnWidth`). */
  width: number;
  /** A single-select named "Status": its pills are rounded and led by a dot. */
  status?: boolean;
}

/** A select option as the public render draws it. */
export interface PublicDatabasePill {
  label: string;
  color: PillColor;
}

/** One cell: its text, plus what lets the render draw it as the editor does. */
export interface PublicDatabaseCell {
  text: string;
  /** `select` / `multiSelect`: the chosen options, drawn as coloured pills. */
  pills?: PublicDatabasePill[];
  /** `checkbox`: whether it is ticked. */
  checked?: boolean;
  /** `url`: the link, when it is http(s) or mailto. */
  href?: string;
}

/** One row of a database as the public render shows it: one cell per visible column. */
export interface PublicDatabaseRow {
  cells: PublicDatabaseCell[];
  /** The row page's public path when it is published; the title cell links there. */
  href?: string;
}

/** A database projected for the public render (ADR-0078): visible columns in view order. */
export interface PublicDatabaseTable {
  name: string;
  columns: PublicDatabaseColumn[];
  rows: PublicDatabaseRow[];
  /** Which column is the title — the one that links to the row page. Defaults to 0. */
  titleIndex?: number;
}

export type PublicDatabaseMap = ReadonlyMap<string, PublicDatabaseTable>;

const KNOWN_PROPERTY_TYPES: ReadonlySet<string> = new Set(PROPERTY_TYPES);
const KNOWN_PILL_COLORS: ReadonlySet<string> = new Set(PILL_COLORS);
const MIN_COLUMN_WIDTH = 40;
const MAX_COLUMN_WIDTH = 1200;
const FALLBACK_COLUMN_WIDTH = 180;

function safeWidth(width: unknown): number {
  return typeof width === "number" && Number.isFinite(width)
    ? Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width)))
    : FALLBACK_COLUMN_WIDTH;
}

function safeCell(cell: PublicDatabaseCell | undefined): PublicDatabaseCell {
  const out: PublicDatabaseCell = { text: typeof cell?.text === "string" ? cell.text : "" };
  const pills = cell?.pills?.filter(
    (p) => typeof p.label === "string" && KNOWN_PILL_COLORS.has(p.color),
  );
  if (pills?.length) out.pills = pills.map((p) => ({ label: p.label, color: p.color }));
  if (typeof cell?.checked === "boolean") out.checked = cell.checked;
  if (typeof cell?.href === "string" && SAFE_LINK_HREF.test(cell.href.trim())) out.href = cell.href.trim();
  return out;
}

/**
 * A database block as a `publicDatabase` node: the projection itself, made
 * safe to emit. The public render draws it like the editor's table
 * (`PublicDatabaseNode`); its style attributes are built only from what this
 * keeps — a palette colour name and a clamped number — and its links only
 * from an app-relative row path or an http(s)/mailto URL.
 */
export function publicDatabaseNode(table: PublicDatabaseTable): JSONContent {
  const columns = table.columns.map((column) => ({
    name: typeof column.name === "string" ? column.name : "",
    type: KNOWN_PROPERTY_TYPES.has(column.type) ? column.type : "text",
    width: safeWidth(column.width),
    ...(column.status === true ? { status: true } : {}),
  }));
  const rows = table.rows.map((row) => ({
    cells: columns.map((_, index) => safeCell(row.cells[index])),
    ...(typeof row.href === "string" && row.href.startsWith("/") ? { href: row.href } : {}),
  }));
  const titleIndex =
    typeof table.titleIndex === "number" && table.titleIndex >= 0 && table.titleIndex < columns.length
      ? table.titleIndex
      : 0;
  const safe: PublicDatabaseTable = { name: table.name, columns, rows, titleIndex };
  return { type: "publicDatabase", attrs: { table: safe } };
}

function isSafeLinkMark(mark: { attrs?: Record<string, unknown> }): boolean {
  const href = mark.attrs?.href;
  return typeof href === "string" && SAFE_LINK_HREF.test(href.trim());
}

function sanitizeNode(
  node: JSONContent,
  pageLinks: PublicPageLinkMap,
  databases: PublicDatabaseMap,
): JSONContent | null {
  if (node.type === "database") {
    // A database the caller projected becomes a static table; one it did not
    // (deleted, or the caller chose not to publish it) is left out entirely,
    // so neither its id nor its name reaches the public HTML.
    const databaseId = node.attrs?.databaseId;
    const table = typeof databaseId === "string" ? databases.get(databaseId) : undefined;
    return table ? publicDatabaseNode(table) : null;
  }

  if (node.type === "pageLink") {
    const pageId = node.attrs?.pageId;
    const target =
      typeof pageId === "string" ? pageLinks.get(pageId) : undefined;
    // A published target with a safe app-relative href becomes a real link to
    // its public URL with its live title. The href is built from trusted
    // values (buildPublicPagePath always emits `/p/…`), but this is a public
    // HTML render, so we still refuse anything that isn't an app-relative path
    // — defense-in-depth against a `javascript:`/`data:` href slipping in.
    if (target && target.href.startsWith("/")) {
      return {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: target.title || "Untitled",
            marks: [{ type: "link", attrs: { href: target.href } }],
          },
        ],
      };
    }
    // Otherwise (unpublished / unknown / unsafe href): title-only text, with no
    // page id or internal workspace path leaked.
    const title = node.attrs?.title;
    return {
      type: "pageLink",
      attrs: { title: typeof title === "string" && title ? title : "Untitled" },
    };
  }

  if (node.type === "youtube") {
    // The iframe src is rebuilt from the id at render time; keep only a valid
    // id and start so nothing else rides along into the public HTML.
    const video = youTubeVideoFromAttrs(node.attrs);
    return video
      ? { type: "youtube", attrs: { videoId: video.videoId, start: video.start ?? null } }
      : null;
  }

  if (node.type === "image") {
    const src = node.attrs?.src as unknown;
    if (typeof src !== "string" || !SAFE_IMAGE_SRC.test(src.trim())) {
      return null;
    }
  }

  const marks = node.marks?.filter((mark) => {
    if (mark.type === "comment") return false;
    if (mark.type === "link") return isSafeLinkMark(mark);
    return true;
  });

  const content = node.content
    ?.map((child) => sanitizeNode(child, pageLinks, databases))
    .filter((child): child is JSONContent => child !== null);

  return {
    ...node,
    ...(marks !== undefined ? { marks } : {}),
    ...(content !== undefined ? { content } : {}),
  };
}

const NO_LINKS: PublicPageLinkMap = new Map();
const NO_DATABASES: PublicDatabaseMap = new Map();

export function sanitizeDocForPublic(
  doc: JSONContent,
  pageLinks: PublicPageLinkMap = NO_LINKS,
  databases: PublicDatabaseMap = NO_DATABASES,
): JSONContent {
  return sanitizeNode(doc, pageLinks, databases) ?? { type: "doc", content: [] };
}

/**
 * Collect the distinct page ids referenced by `pageLink` nodes in a document,
 * in document order. Pure; used by the public render (to resolve published
 * targets) and by the publish flow (to walk the linked-page graph).
 */
export function collectPageLinkIds(
  doc: JSONContent | null | undefined,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const walk = (node: JSONContent) => {
    if (node.type === "pageLink") {
      const pageId = node.attrs?.pageId;
      if (typeof pageId === "string" && pageId && !seen.has(pageId)) {
        seen.add(pageId);
        ids.push(pageId);
      }
    }
    node.content?.forEach(walk);
  };
  if (doc) walk(doc);
  return ids;
}

/** A `pageLink` node's rewritten target: the new page id and its in-app href. */
export interface PageLinkRewrite {
  pageId: string;
  href: string;
}

/**
 * Rewrite `pageLink` node targets through a remap (old page id → new
 * {pageId, href}). Used by duplicate-with-sub-pages (ADR-0039) so a copied tree
 * links to the copies, not the originals. Links whose target isn't in the remap
 * (un-copyable / out-of-scope pages) are left untouched. Pure; returns a new doc
 * and never mutates the input.
 */
export function remapPageLinkIds(
  doc: JSONContent,
  remap: ReadonlyMap<string, PageLinkRewrite>,
): JSONContent {
  const rewrite = (node: JSONContent): JSONContent => {
    let next = node;
    if (node.type === "pageLink") {
      const pageId = node.attrs?.pageId;
      const target = typeof pageId === "string" ? remap.get(pageId) : undefined;
      if (target) {
        next = {
          ...node,
          attrs: { ...node.attrs, pageId: target.pageId, href: target.href },
        };
      }
    }
    if (next.content) {
      return { ...next, content: next.content.map(rewrite) };
    }
    return next;
  };
  return rewrite(doc);
}
