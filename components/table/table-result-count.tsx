export function TableResultCount({ count }: { count: number | null }) {
  if (count === null) return null;

  return (
    <span className="ml-1 font-normal tabular-nums text-muted-foreground">
      ({count})
    </span>
  );
}
