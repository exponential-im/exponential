import type { DatabaseView, PropertyDef, PropertyType } from "./schema";

/**
 * How a database draws, shared by the editor's table and the published
 * page's static render (ADR-0078), so the two stay alike.
 */

/**
 * A column's width before anyone drags it. Columns keep a width and the
 * table scrolls sideways, rather than squeezing every column into the page
 * column until long text wraps a word per line.
 */
const DEFAULT_WIDTHS: Partial<Record<PropertyType, number>> = {
  title: 280,
  text: 320,
  url: 240,
  relation: 240,
  multiSelect: 220,
  number: 120,
  checkbox: 100,
};
const FALLBACK_WIDTH = 180;

/** The width a column draws at: the saved one, else its type's default. */
export function columnWidth(def: PropertyDef, view?: DatabaseView): number {
  return view?.columnWidths?.[def.id] ?? DEFAULT_WIDTHS[def.type] ?? FALLBACK_WIDTH;
}

/** Width of the trailing "add a property" column. */
export const ADD_COLUMN_WIDTH = 44;

/**
 * Exponential has no status property type, so a single-select column named
 * "Status" is drawn the way Notion draws its status type: a rounded pill led
 * by a dot in the option's colour.
 */
export function isStatusColumn(def: PropertyDef): boolean {
  return def.type === "select" && def.name.trim().toLowerCase() === "status";
}
