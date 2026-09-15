export default function CalendarHeader({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 shrink-0 items-center justify-between gap-1 sm:gap-2">
      {children}
    </div>
  );
}
