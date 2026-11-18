/**
 * Scheduled posts: a post whose frontmatter `date` is in the future is held
 * back until that day (UTC). That lets several approved posts merge at once
 * and still go out one a week; the blog pages revalidate hourly, so a post
 * appears within an hour of midnight UTC on its date.
 */
export function isPublished(date: string | undefined, now: Date = new Date()): boolean {
  if (!date) return true;
  // "YYYY-MM-DD" parses as UTC midnight; a full ISO timestamp keeps its time.
  const at = new Date(date);
  if (Number.isNaN(at.getTime())) return true;
  return at.getTime() <= now.getTime();
}
