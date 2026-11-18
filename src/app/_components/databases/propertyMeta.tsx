import {
  IconAlignLeft,
  IconArrowUpRight,
  IconCalendar,
  IconCircleChevronDown,
  IconClock,
  IconHash,
  IconLetterCase,
  IconLink,
  IconList,
  IconSquareCheck,
  IconUser,
  IconUserCircle,
  type Icon,
} from "@tabler/icons-react";
import type { DatabaseView, PropertyDef, PropertyType } from "~/lib/databases/schema";

/** The glyph a property's type shows beside its name, in the table header and on the row page. */
export const PROPERTY_TYPE_ICONS: Record<PropertyType, Icon> = {
  title: IconLetterCase,
  text: IconAlignLeft,
  number: IconHash,
  select: IconCircleChevronDown,
  multiSelect: IconList,
  date: IconCalendar,
  checkbox: IconSquareCheck,
  url: IconLink,
  person: IconUser,
  relation: IconArrowUpRight,
  createdTime: IconClock,
  lastEditedTime: IconClock,
  createdBy: IconUserCircle,
};

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
