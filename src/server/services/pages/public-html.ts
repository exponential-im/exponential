import "server-only";

import { generateHTML } from "@tiptap/html";
import type { JSONContent } from "@tiptap/core";

import { PublicDatabaseNode } from "~/app/_components/databases/publicDatabaseNode";
import { buildPrdExtensions } from "~/lib/prd/extensions";
import {
  sanitizeDocForPublic,
  type PublicDatabaseMap,
  type PublicPageLinkMap,
} from "~/lib/pages/public-doc";

/**
 * Render a Page's canonical ProseMirror `bodyDoc` to static HTML for the
 * unauthenticated `/p/[slugId]` route (ADR-0038). Runs the public sanitization
 * pass first — including resolving `pageLink` nodes against the supplied map
 * of published targets — then serializes through the same shared extension
 * schema the editor uses, so the public render and the editor agree on every
 * node type. Database blocks render through `PublicDatabaseNode`, drawn like
 * the editor's table.
 */
export function renderPublicPageHtml(
  bodyDoc: JSONContent,
  pageLinks?: PublicPageLinkMap,
  databases?: PublicDatabaseMap,
): string {
  return generateHTML(
    sanitizeDocForPublic(bodyDoc, pageLinks, databases),
    [...buildPrdExtensions(), PublicDatabaseNode],
  );
}
