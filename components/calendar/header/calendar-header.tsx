export default function CalendarHeader({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex shrink-0 flex-col justify-between gap-3 py-3 lg:flex-row lg:items-center">
      {children}
    </div>
  )
}
