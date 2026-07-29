export default function CalendarHeaderActions({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-nowrap items-center gap-1 sm:gap-2">
      {children}
    </div>
  );
}
