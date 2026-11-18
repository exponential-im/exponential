import { describe, expect, it } from "vitest";
import { generateHTML } from "@tiptap/html";
import type { JSONContent } from "@tiptap/core";

import {
  collectPageLinkIds,
  publicDatabaseNode,
  remapPageLinkIds,
  sanitizeDocForPublic,
  type PageLinkRewrite,
  type PublicDatabaseTable,
} from "../public-doc";
import { buildPrdExtensions } from "~/lib/prd/extensions";
import { PublicDatabaseNode } from "~/app/_components/databases/publicDatabaseNode";

function doc(content: JSONContent[]): JSONContent {
  return { type: "doc", content };
}

function textWithMarks(marks: NonNullable<JSONContent["marks"]>): JSONContent {
  return { type: "text", text: "hi", marks };
}

describe("sanitizeDocForPublic", () => {
  it("keeps http(s) and mailto links", () => {
    const input = doc([
      {
        type: "paragraph",
        content: [
          textWithMarks([
            { type: "link", attrs: { href: "https://example.com" } },
          ]),
          textWithMarks([{ type: "link", attrs: { href: "mailto:a@b.c" } }]),
        ],
      },
    ]);
    const out = sanitizeDocForPublic(input);
    const texts = out.content![0]!.content!;
    expect(texts[0]!.marks).toHaveLength(1);
    expect(texts[1]!.marks).toHaveLength(1);
  });

  it("drops javascript: and data: link marks but keeps the text", () => {
    const input = doc([
      {
        type: "paragraph",
        content: [
          textWithMarks([
            { type: "bold" },
            { type: "link", attrs: { href: "javascript:alert(1)" } },
          ]),
        ],
      },
    ]);
    const out = sanitizeDocForPublic(input);
    const marks = out.content![0]!.content![0]!.marks!;
    expect(marks).toEqual([{ type: "bold" }]);
  });

  it("strips internal comment marks", () => {
    const input = doc([
      {
        type: "paragraph",
        content: [
          textWithMarks([{ type: "comment", attrs: { commentId: "c1" } }]),
        ],
      },
    ]);
    const out = sanitizeDocForPublic(input);
    expect(out.content![0]!.content![0]!.marks).toEqual([]);
  });

  it("removes images with unsafe srcs, keeps https images", () => {
    const input = doc([
      { type: "image", attrs: { src: "https://blob.example/a.png" } },
      { type: "image", attrs: { src: "data:image/png;base64,AAAA" } },
      { type: "image", attrs: {} },
    ]);
    const out = sanitizeDocForPublic(input);
    expect(out.content).toHaveLength(1);
    expect(out.content![0]!.attrs!.src).toBe("https://blob.example/a.png");
  });

  it("sanitizes nested content recursively", () => {
    const input = doc([
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "image", attrs: { src: "javascript:alert(1)" } },
              {
                type: "paragraph",
                content: [
                  textWithMarks([
                    { type: "link", attrs: { href: "vbscript:x" } },
                  ]),
                ],
              },
            ],
          },
        ],
      },
    ]);
    const out = sanitizeDocForPublic(input);
    const listItem = out.content![0]!.content![0]!;
    expect(listItem.content).toHaveLength(1);
    expect(listItem.content![0]!.content![0]!.marks).toEqual([]);
  });

  it("strips page ids and internal hrefs from page links, keeping the title", () => {
    const input = doc([
      {
        type: "pageLink",
        attrs: {
          pageId: "clx123",
          title: "Design notes",
          href: "/w/acme/pages/clx123",
        },
      },
      { type: "pageLink" },
    ]);
    const out = sanitizeDocForPublic(input);
    expect(out.content![0]).toEqual({
      type: "pageLink",
      attrs: { title: "Design notes" },
    });
    expect(out.content![1]).toEqual({
      type: "pageLink",
      attrs: { title: "Untitled" },
    });
  });

  it("links page links whose target is published, with the live title", () => {
    const input = doc([
      {
        type: "pageLink",
        attrs: { pageId: "clx1", title: "Old title", href: "/w/acme/pages/clx1" },
      },
      {
        type: "pageLink",
        attrs: { pageId: "clx2", title: "Private", href: "/w/acme/pages/clx2" },
      },
    ]);
    const out = sanitizeDocForPublic(
      input,
      new Map([["clx1", { title: "Live title", href: "/p/live-title-ab12cd34" }]]),
    );
    // Published target → paragraph linking to the public URL.
    expect(out.content![0]).toEqual({
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Live title",
          marks: [{ type: "link", attrs: { href: "/p/live-title-ab12cd34" } }],
        },
      ],
    });
    // Unpublished target → title-only node, no id/href leak.
    expect(out.content![1]).toEqual({
      type: "pageLink",
      attrs: { title: "Private" },
    });
  });

  it("falls back to title-only when a resolved href is not app-relative", () => {
    const input = doc([
      {
        type: "pageLink",
        attrs: { pageId: "clx1", title: "Cached", href: "/w/acme/pages/clx1" },
      },
    ]);
    const out = sanitizeDocForPublic(
      input,
      // A target whose href is somehow unsafe must never reach the HTML.
      new Map([["clx1", { title: "Live", href: "javascript:alert(1)" }]]),
    );
    expect(out.content![0]).toEqual({
      type: "pageLink",
      attrs: { title: "Cached" },
    });
  });

  it("does not mutate the input document", () => {
    const input = doc([
      { type: "image", attrs: { src: "data:image/png;base64,AAAA" } },
    ]);
    const snapshot = JSON.parse(JSON.stringify(input)) as JSONContent;
    sanitizeDocForPublic(input);
    expect(input).toEqual(snapshot);
  });
});

describe("sanitizeDocForPublic — database blocks (ADR-0078)", () => {
  const metrics: PublicDatabaseTable = {
    name: "Metrics",
    columns: [
      { name: "Name", type: "title", width: 280 },
      { name: "Status", type: "select", width: 180, status: true },
    ],
    rows: [
      {
        cells: [{ text: "Alert latency" }, { text: "Tracked", pills: [{ label: "Tracked", color: "green" }] }],
        href: "/p/alert-latency-abcd1234",
      },
      { cells: [{ text: "Coverage" }, { text: "" }] },
    ],
  };
  const databaseNode = { type: "database", attrs: { databaseId: "db1", name: "Metrics" } };
  const render = (content: JSONContent) => generateHTML(content, [...buildPrdExtensions(), PublicDatabaseNode]);

  it("renders a projected database like the editor's table, the title linking to the published row", () => {
    const out = sanitizeDocForPublic(doc([databaseNode]), undefined, new Map([["db1", metrics]]));
    expect(out.content?.[0]?.type).toBe("publicDatabase");
    const html = render(out);
    expect(html).toContain('data-type="public-database"');
    expect(html).toContain("Metrics");
    expect(html).toContain("2 rows");
    // Columns keep their widths, so the table scrolls sideways.
    expect(html).toContain('<th scope="col" width="280">');
    expect(html).toContain('<th scope="col" width="180">');
    // A type glyph in each header; the title links to the published row.
    expect(html.match(/<th[^>]*>\s*<span[^>]*>\s*<svg/g)).toHaveLength(2);
    expect(html).toContain('<a href="/p/alert-latency-abcd1234">Alert latency</a>');
    // A Status option is a tinted pill led by a dot.
    expect(html).toContain('data-variant="status"');
    expect(html).toContain('data-color="green"');
    expect(html).not.toContain("db1");
  });

  it("leaves an unpublished row's title as text and an empty cell empty", () => {
    const html = render(sanitizeDocForPublic(doc([databaseNode]), undefined, new Map([["db1", metrics]])));
    expect(html).not.toContain('href="/p/coverage');
    expect(html).toMatch(/Coverage<\/span>[\s\S]*?<\/td>\s*<td[^>]*><\/td>/);
  });

  it("drops a database block the caller did not project, leaving no id or name behind", () => {
    const out = sanitizeDocForPublic(doc([databaseNode, { type: "paragraph", content: [{ type: "text", text: "after" }] }]));
    expect(out.content?.map((n) => n.type)).toEqual(["paragraph"]);
    expect(JSON.stringify(out)).not.toContain("Metrics");
  });

  it("links the title column wherever the view put it", () => {
    const node = publicDatabaseNode({
      name: "Metrics",
      columns: [
        { name: "Status", type: "select", width: 180 },
        { name: "Name", type: "title", width: 280 },
      ],
      titleIndex: 1,
      rows: [{ cells: [{ text: "" }, { text: "Alert latency" }], href: "/p/alert-latency-abcd1234" }],
    });
    const html = render(doc([node!]));
    expect(html).toMatch(/<td[^>]*><\/td>\s*<td[^>]*>\s*<span[^>]*>\s*<svg[\s\S]*?<a href="\/p\/alert-latency-abcd1234">/);
  });

  it("refuses unsafe links, unknown colours and unbounded widths", () => {
    const node = publicDatabaseNode({
      name: "Metrics",
      columns: [
        { name: "Name", type: "title", width: 99999 },
        { name: "Link", type: "url", width: Number.NaN },
        { name: "Tag", type: "select", width: 10 },
      ],
      rows: [
        {
          cells: [
            { text: "x" },
            { text: "bad", href: "javascript:alert(1)" },
            { text: "t", pills: [{ label: "t", color: "red\" onmouseover=\"x" as never }] },
          ],
          href: "javascript:alert(1)",
        },
      ],
    });
    const table = node!.attrs!.table as PublicDatabaseTable;
    expect(table.columns.map((c) => c.width)).toEqual([1200, 180, 40]);
    expect(table.rows[0]!.href).toBeUndefined();
    expect(table.rows[0]!.cells[1]!.href).toBeUndefined();
    expect(table.rows[0]!.cells[2]!.pills).toBeUndefined();
    const html = render(doc([node!]));
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("onmouseover");
  });

  it("drops a publicDatabase node the author put in the doc, and the renderer re-checks any it is handed", () => {
    const authored = {
      type: "publicDatabase",
      attrs: {
        table: {
          name: "Forged",
          columns: [{ name: "Name", type: "title", width: 280 }],
          rows: [{ cells: [{ text: "click" }], href: "javascript:alert(document.domain)" }],
        },
      },
    };
    const out = sanitizeDocForPublic(doc([authored, { type: "paragraph", content: [{ type: "text", text: "after" }] }]));
    expect(out.content?.map((n) => n.type)).toEqual(["paragraph"]);
    // Even rendered directly, without the sanitizer, the link is refused.
    const html = render(doc([authored]));
    expect(html).toContain("click");
    expect(html).not.toContain("javascript:");
    // Junk attrs render nothing rather than throwing.
    expect(() => render(doc([{ type: "publicDatabase", attrs: { table: { columns: "x" } } }]))).not.toThrow();
  });

  it("refuses protocol-relative row links", () => {
    for (const href of ["//evil.example/p/x", "/\\evil.example"]) {
      const node = publicDatabaseNode({ ...metrics, rows: [{ cells: [{ text: "x" }, { text: "" }], href }] });
      expect((node!.attrs!.table as PublicDatabaseTable).rows[0]!.href).toBeUndefined();
    }
  });

  it("escapes names and values", () => {
    const html = render(
      doc([
        publicDatabaseNode({
          name: "<script>alert(1)</script>",
          columns: [{ name: "<b>Name</b>", type: "title", width: 280 }],
          rows: [{ cells: [{ text: "<img src=x onerror=alert(1)>" }] }],
        })!,
      ]),
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
  });

  it("draws a checkbox as a ticked or empty box", () => {
    const html = render(
      doc([
        publicDatabaseNode({
          name: "Done",
          columns: [
            { name: "Name", type: "title", width: 280 },
            { name: "Done", type: "checkbox", width: 100 },
          ],
          rows: [
            { cells: [{ text: "a" }, { text: "Yes", checked: true }] },
            { cells: [{ text: "b" }, { text: "No", checked: false }] },
          ],
        })!,
      ]),
    );
    expect(html).toContain('aria-label="Checked"');
    expect(html).toContain('aria-label="Not checked"');
  });
});

describe("remapPageLinkIds", () => {
  const remap = new Map<string, PageLinkRewrite>([
    ["old1", { pageId: "new1", href: "/w/acme/pages/new1" }],
    ["old2", { pageId: "new2", href: "/w/acme/pages/new2" }],
  ]);

  it("rewrites pageId and href for remapped targets, in nested nodes", () => {
    const input = doc([
      {
        type: "pageLink",
        attrs: { pageId: "old1", title: "One", href: "/w/acme/pages/old1" },
      },
      {
        type: "blockquote",
        content: [
          {
            type: "pageLink",
            attrs: { pageId: "old2", title: "Two", href: "/w/acme/pages/old2" },
          },
        ],
      },
    ]);
    const out = remapPageLinkIds(input, remap);
    expect(out.content![0]!.attrs).toEqual({
      pageId: "new1",
      title: "One",
      href: "/w/acme/pages/new1",
    });
    expect(out.content![1]!.content![0]!.attrs).toEqual({
      pageId: "new2",
      title: "Two",
      href: "/w/acme/pages/new2",
    });
  });

  it("leaves links whose target is not in the remap untouched", () => {
    const input = doc([
      {
        type: "pageLink",
        attrs: { pageId: "other", title: "Kept", href: "/w/acme/pages/other" },
      },
    ]);
    const out = remapPageLinkIds(input, remap);
    expect(out.content![0]!.attrs).toEqual({
      pageId: "other",
      title: "Kept",
      href: "/w/acme/pages/other",
    });
  });

  it("does not mutate the input document", () => {
    const input = doc([
      {
        type: "pageLink",
        attrs: { pageId: "old1", title: "One", href: "/w/acme/pages/old1" },
      },
    ]);
    const snapshot = JSON.parse(JSON.stringify(input)) as JSONContent;
    remapPageLinkIds(input, remap);
    expect(input).toEqual(snapshot);
  });
});

describe("collectPageLinkIds", () => {
  it("collects distinct ids in document order, including nested nodes", () => {
    const input = doc([
      { type: "pageLink", attrs: { pageId: "b", title: "B" } },
      {
        type: "blockquote",
        content: [{ type: "pageLink", attrs: { pageId: "a", title: "A" } }],
      },
      { type: "pageLink", attrs: { pageId: "b", title: "B again" } },
      { type: "pageLink" },
      { type: "paragraph", content: [{ type: "text", text: "no links" }] },
    ]);
    expect(collectPageLinkIds(input)).toEqual(["b", "a"]);
  });

  it("returns empty for empty or missing docs", () => {
    expect(collectPageLinkIds(null)).toEqual([]);
    expect(collectPageLinkIds(doc([]))).toEqual([]);
  });
});

// Mirrors the exact composition in renderPublicPageHtml (server-only, so it
// can't be imported here): generateHTML(sanitizeDocForPublic(doc), extensions).
// Guards the /p/ public render path for tables end-to-end without a DB.
describe("public render path (tables)", () => {
  const cell = (text: string): JSONContent => ({
    type: "tableCell",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
  const headerCell = (text: string): JSONContent => ({
    type: "tableHeader",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
  const tableDoc = doc([
    {
      type: "table",
      content: [
        { type: "tableRow", content: [headerCell("Name"), headerCell("Role")] },
        { type: "tableRow", content: [cell("Ada"), cell("Engineer")] },
      ],
    },
  ]);

  it("renders a table node to real table HTML", () => {
    const html = generateHTML(
      sanitizeDocForPublic(tableDoc),
      buildPrdExtensions(),
    );
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain("<td");
    expect(html).toContain("Ada");
    expect(html).toContain("Engineer");
  });

  it("keeps the table intact through public sanitization", () => {
    const out = sanitizeDocForPublic(tableDoc);
    const table = out.content?.find((n) => n.type === "table");
    expect(table?.content?.length).toBe(2);
  });
});

// The bubble menu's marks and the `/divider` block on the same public render
// path: the shared schema emits the tags the `.prd-document` styles target.
describe("public render path (marks and divider)", () => {
  it("renders underline, strike, highlight and a divider as their tags", () => {
    const html = generateHTML(
      sanitizeDocForPublic(
        doc([
          {
            type: "paragraph",
            content: [
              { type: "text", text: "u", marks: [{ type: "underline" }] },
              { type: "text", text: "s", marks: [{ type: "strike" }] },
              { type: "text", text: "m", marks: [{ type: "highlight" }] },
            ],
          },
          { type: "horizontalRule" },
        ]),
      ),
      buildPrdExtensions(),
    );
    expect(html).toContain("<u>u</u>");
    expect(html).toContain("<s>s</s>");
    expect(html).toContain("<mark>m</mark>");
    expect(html).toContain("<hr>");
  });
});
