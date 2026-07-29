export default function CalendarHeader({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2">
      {children}
    </div>
  );
}
