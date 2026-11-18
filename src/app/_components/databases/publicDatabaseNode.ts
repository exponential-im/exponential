import { Node } from "@tiptap/core";
import type { DOMOutputSpec } from "@tiptap/pm/model";

import type { PublicDatabaseCell, PublicDatabaseColumn, PublicDatabaseTable } from "~/lib/pages/public-doc";
import styles from "./DatabaseBlock.module.css";
import { FILE_ICON_PATHS, PROPERTY_TYPE_ICON_PATHS, TABLE_ICON_PATHS } from "./propertyIconPaths";

/**
 * A database block on a published page (ADR-0078), drawn like the editor's
 * table: the same stylesheet and classes, the same type glyphs, widths and
 * pills, as static HTML. The node exists only in the public render: the
 * sanitizer turns each `database` node into one, carrying a projection it
 * has already made safe (`publicDatabaseNode`), and `renderPublicPageHtml`
 * adds this extension. Every value below is text or an attribute the
 * serializer escapes.
 *
 * No inline styles: ProseMirror sets `style` through `dom.style.cssText`,
 * which the server-side DOM `generateHTML` uses ignores. A column's width is
 * its header's `width` attribute; a pill's colour is its `data-color`, which
 * the stylesheet turns into the palette's tint, as it does in the editor.
 */

const SQUARE_PATH = "M3 3m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z";
const CHECK_PATH = "M9 12l2 2l4 -4";

/** Joins CSS module class names, dropping any the build left undefined. */
function cls(...names: (string | undefined)[]): string | null {
  const kept = names.filter(Boolean);
  return kept.length > 0 ? kept.join(" ") : null;
}

function icon(paths: readonly string[], extra: Record<string, string | null> = {}): DOMOutputSpec {
  return [
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: "16",
      height: "16",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      ...extra,
    },
    ...paths.map((d): DOMOutputSpec => ["path", { d }]),
  ];
}

function headerCell(column: PublicDatabaseColumn): DOMOutputSpec {
  return [
    "th",
    { scope: "col", width: String(column.width) },
    [
      "span",
      { class: cls(styles.headerLabel) },
      icon(PROPERTY_TYPE_ICON_PATHS[column.type]),
      ["span", {}, column.name],
    ],
  ];
}

function pills(cell: PublicDatabaseCell, status: boolean): DOMOutputSpec {
  return [
    "span",
    { class: cls(styles.pillButton) },
    ...(cell.pills ?? []).map((pill): DOMOutputSpec => {
      const dot: DOMOutputSpec[] = status ? [["span", { class: cls(styles.pillDot), "aria-hidden": "true" }]] : [];
      return [
        "span",
        {
          class: cls(styles.pill),
          "data-variant": status ? "status" : null,
          "data-color": pill.color,
          title: pill.label,
        },
        ...dot,
        pill.label,
      ];
    }),
  ];
}

function bodyCell(
  column: PublicDatabaseColumn,
  cell: PublicDatabaseCell,
  isTitle: boolean,
  rowHref: string | undefined,
): DOMOutputSpec {
  if (isTitle) {
    const label = cell.text || "Untitled";
    return [
      "td",
      { class: cls(styles.cell, styles.titleCell) },
      [
        "span",
        { class: cls(styles.titleInner) },
        icon(FILE_ICON_PATHS),
        rowHref ? ["a", { href: rowHref }, label] : ["span", { class: cls(styles.cellText) }, label],
      ],
    ];
  }
  if (cell.pills?.length) {
    return ["td", { class: cls(styles.cell) }, pills(cell, column.status === true)];
  }
  if (column.type === "checkbox" && typeof cell.checked === "boolean") {
    return [
      "td",
      { class: cls(styles.cell) },
      icon(cell.checked ? [SQUARE_PATH, CHECK_PATH] : [SQUARE_PATH], {
        class: cls(styles.staticCheck),
        "data-checked": cell.checked ? "true" : "false",
        "aria-hidden": null,
        role: "img",
        "aria-label": cell.checked ? "Checked" : "Not checked",
      }),
    ];
  }
  if (!cell.text) return ["td", { class: cls(styles.cell) }];
  if (cell.href) {
    return [
      "td",
      { class: cls(styles.cell) },
      ["a", { class: cls(styles.urlLink), href: cell.href, rel: "noopener noreferrer nofollow", target: "_blank" }, cell.text],
    ];
  }
  return ["td", { class: cls(styles.cell) }, ["span", { class: cls(styles.cellText) }, cell.text]];
}

/** The static block for one projected database. */
export function publicDatabaseSpec(table: PublicDatabaseTable): DOMOutputSpec {
  const titleIndex = table.titleIndex ?? 0;
  const count = table.rows.length;
  const body: DOMOutputSpec[] =
    count === 0
      ? [["tr", {}, ["td", { class: cls(styles.empty), colspan: String(Math.max(table.columns.length, 1)) }, "No rows"]]]
      : table.rows.map((row): DOMOutputSpec => [
          "tr",
          {},
          ...table.columns.map((column, index) =>
            bodyCell(column, row.cells[index] ?? { text: "" }, index === titleIndex, row.href),
          ),
        ]);
  return [
    "div",
    { class: cls(styles.block), "data-type": "public-database" },
    ["div", { class: cls(styles.titleRow) }, ["div", { class: cls(styles.name) }, table.name]],
    [
      "div",
      { class: cls(styles.header) },
      ["span", { class: cls(styles.viewTab) }, icon(TABLE_ICON_PATHS), "Table"],
      ["span", { class: cls(styles.meta) }, `${count} row${count === 1 ? "" : "s"}`],
    ],
    [
      "div",
      { class: cls(styles.tableWrap) },
      [
        "table",
        { class: cls(styles.table) },
        ["thead", {}, ["tr", {}, ...table.columns.map(headerCell)]],
        ["tbody", {}, ...body],
      ],
    ],
  ];
}

export const PublicDatabaseNode = Node.create({
  name: "publicDatabase",
  group: "block",
  atom: true,

  addAttributes() {
    return { table: { default: null, rendered: false } };
  },

  renderHTML({ node }) {
    const table = node.attrs.table as PublicDatabaseTable | null;
    return table ? publicDatabaseSpec(table) : ["div", {}];
  },
});
