const calendarColorClasses = {
  blue: {
    event: "border-primary bg-primary/10 hover:bg-primary/20",
    text: "text-primary",
    dot: "bg-primary",
  },
  indigo: {
    event: "border-info bg-info/10 hover:bg-info/20",
    text: "text-info",
    dot: "bg-info",
  },
  pink: {
    event: "border-chart-5 bg-chart-5/10 hover:bg-chart-5/20",
    text: "text-chart-5",
    dot: "bg-chart-5",
  },
  red: {
    event: "border-destructive bg-destructive/10 hover:bg-destructive/20",
    text: "text-destructive",
    dot: "bg-destructive",
  },
  orange: {
    event: "border-secondary bg-secondary/10 hover:bg-secondary/20",
    text: "text-secondary",
    dot: "bg-secondary",
  },
  amber: {
    event: "border-warning bg-warning/10 hover:bg-warning/20",
    text: "text-warning",
    dot: "bg-warning",
  },
  emerald: {
    event: "border-success bg-success/10 hover:bg-success/20",
    text: "text-success",
    dot: "bg-success",
  },
  green: {
    event: "border-success bg-success/10 hover:bg-success/20",
    text: "text-success",
    dot: "bg-success",
  },
  gray: {
    event: "border-neutral-status bg-neutral-status/10 hover:bg-neutral-status/20",
    text: "text-neutral-status",
    dot: "bg-neutral-status",
  },
} as const

export const colorOptions = [
  { value: "blue", label: "Blue", className: calendarColorClasses.blue.dot },
  { value: "indigo", label: "Indigo", className: calendarColorClasses.indigo.dot },
  { value: "pink", label: "Pink", className: calendarColorClasses.pink.dot },
  { value: "red", label: "Red", className: calendarColorClasses.red.dot },
  { value: "orange", label: "Orange", className: calendarColorClasses.orange.dot },
  { value: "amber", label: "Amber", className: calendarColorClasses.amber.dot },
  { value: "emerald", label: "Emerald", className: calendarColorClasses.emerald.dot },
] as const

export function getCalendarColorClasses(color?: string) {
  const normalizedColor = color?.replace("#", "").toLowerCase()
  return calendarColorClasses[
    normalizedColor as keyof typeof calendarColorClasses
  ] ?? calendarColorClasses.blue
}
