import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import type { ChangelogGroup } from "@/lib/changelog/types";
import { cn } from "@/lib/utils";

function ChangelogSectionBadge({
  children,
  tone,
}: {
  children: string;
  tone: ChangelogGroup["type"];
}) {
  const toneClassName = {
    new: "bg-green-600/10 text-green-600 focus-visible:ring-green-600/20 dark:bg-green-400/10 dark:text-green-400 dark:focus-visible:ring-green-400/40 [a&]:hover:bg-green-600/5 dark:[a&]:hover:bg-green-400/5",
    updates:
      "bg-sky-600/10 text-sky-600 focus-visible:ring-sky-600/20 dark:bg-sky-400/10 dark:text-sky-400 dark:focus-visible:ring-sky-400/40 [a&]:hover:bg-sky-600/5 dark:[a&]:hover:bg-sky-400/5",
    fixes:
      "bg-amber-600/10 text-amber-600 focus-visible:ring-amber-600/20 dark:bg-orange-400/10 dark:text-orange-400 dark:focus-visible:ring-orange-400/40 [a&]:hover:bg-amber-600/5 dark:[a&]:hover:bg-orange-400/5",
  }[tone];

  return (
    <Badge
      className={cn("h-6 rounded-sm border-none px-2", toneClassName)}
    >
      {children}
    </Badge>
  );
}

function ChangelogAccordionList({ group }: { group: ChangelogGroup }) {
  return (
    <AccordionContent className="text-muted-foreground">
      {group.items.length ? (
        <ul className="flex list-inside list-disc flex-col gap-3 text-sm text-muted-foreground">
          {group.items.map((item) => (
            <li key={item.title}>{item.title}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No items yet.</p>
      )}
    </AccordionContent>
  );
}

export function ChangelogReleaseContent({
  description,
  groups,
  title,
}: {
  description: string | null;
  groups: ChangelogGroup[];
  title: string;
}) {
  const firstGroupWithItems = groups.find((group) => group.items.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        {description ? (
          <p className="text-sm whitespace-pre-line text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <Accordion
        type="multiple"
        className="-mt-4 mb-0 w-full border-none"
        defaultValue={firstGroupWithItems ? [firstGroupWithItems.type] : []}
      >
        {groups.map((group) => (
          <AccordionItem
            key={group.type}
            value={group.type}
            className="bg-transparent"
          >
            <AccordionTrigger className="px-0 hover:no-underline [&>svg]:size-6!">
              <ChangelogSectionBadge tone={group.type}>
                {group.title}
              </ChangelogSectionBadge>
            </AccordionTrigger>
            <ChangelogAccordionList group={group} />
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
