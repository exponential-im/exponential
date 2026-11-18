const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * A recurring task's repeat pattern in words: "Every day", "Every 2 weeks on
 * Mon, Thu", "Every month". Unknown patterns read as "Repeats".
 */
export function describeRecurrence(task: {
  repeatPattern: string;
  repeatDays: readonly number[];
  repeatInterval: number;
}): string {
  const unit = { daily: "day", weekly: "week", monthly: "month" }[task.repeatPattern];
  if (!unit) return "Repeats";
  const every = task.repeatInterval > 1 ? `Every ${task.repeatInterval} ${unit}s` : `Every ${unit}`;
  const days = [...task.repeatDays]
    .filter((d) => d >= 0 && d <= 6)
    .sort((a, b) => a - b)
    .map((d) => DAY_NAMES[d]);
  return task.repeatPattern === "weekly" && days.length > 0 ? `${every} on ${days.join(", ")}` : every;
}
