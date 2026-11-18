import type { PropertyType } from "~/lib/databases/schema";

/**
 * Path data for the Tabler icons the database table draws (Tabler Icons,
 * MIT), for the published page, whose static HTML render cannot mount the
 * React icon components. Same glyphs as `PROPERTY_TYPE_ICONS`; drawn on a
 * 24×24 outline grid at stroke 1.5.
 */
export const PROPERTY_TYPE_ICON_PATHS: Record<PropertyType, readonly string[]> = {
  title: ["M17.5 15.5m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0", "M3 19v-10.5a3.5 3.5 0 0 1 7 0v10.5", "M3 13h7", "M21 12v7"],
  text: ["M4 6l16 0", "M4 12l10 0", "M4 18l14 0"],
  number: ["M5 9l14 0", "M5 15l14 0", "M11 4l-4 16", "M17 4l-4 16"],
  select: ["M15 11l-3 3l-3 -3", "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0 -18z"],
  multiSelect: ["M9 6l11 0", "M9 12l11 0", "M9 18l11 0", "M5 6l0 .01", "M5 12l0 .01", "M5 18l0 .01"],
  date: ["M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z", "M16 3v4", "M8 3v4", "M4 11h16", "M11 15h1", "M12 15v3"],
  checkbox: ["M3 3m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z", "M9 12l2 2l4 -4"],
  url: ["M9 15l6 -6", "M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464", "M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"],
  person: ["M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0", "M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"],
  relation: ["M17 7l-10 10", "M8 7l9 0l0 9"],
  createdTime: ["M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0", "M12 7v5l3 3"],
  lastEditedTime: ["M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0", "M12 7v5l3 3"],
  createdBy: ["M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M12 10m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M6.168 18.849a4 4 0 0 1 3.832 -2.849h4a4 4 0 0 1 3.834 2.855"],
};

/** The page glyph beside a row title. */
export const FILE_ICON_PATHS: readonly string[] = ["M14 3v4a1 1 0 0 0 1 1h4", "M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z"];

/** The table glyph on the view tab. */
export const TABLE_ICON_PATHS: readonly string[] = ["M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14z", "M3 10h18", "M10 3v18"];
