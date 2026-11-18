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
import type { PropertyType } from "~/lib/databases/schema";

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

export { ADD_COLUMN_WIDTH, columnWidth } from "~/lib/databases/presentation";
