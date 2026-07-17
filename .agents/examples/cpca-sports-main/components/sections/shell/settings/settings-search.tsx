"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useSettingsSearch } from "@/hooks/use-settings-search";
import { getSettingsIcon } from "@/lib/navigation";

interface SettingsSearchProps {
  basePath: string;
  enabledLabelKeys: string[];
}

export function SettingsSearch({
  basePath,
  enabledLabelKeys,
}: SettingsSearchProps) {
  const router = useRouter();
  const t = useTranslations("Settings.search");
  const [open, setOpen] = useState(false);
  const { query, results, search, reset } = useSettingsSearch(
    basePath,
    enabledLabelKeys,
  );

  const handleSelect = (path: string) => {
    router.push(path);
    setOpen(false);
    reset();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full bg-white hover:bg-white justify-start gap-2 font-normal text-muted-foreground"
        >
          <MagnifyingGlassIcon className="size-4 shrink-0" />
          <span className="truncate">{t("placeholder")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t("placeholder")}
            value={query}
            onValueChange={search}
          />
          <CommandList>
            <CommandEmpty>{t("noResults")}</CommandEmpty>
            {results.length > 0 && (
              <CommandGroup>
                {results.map((result) => {
                  const Icon = getSettingsIcon(result.labelKey);
                  return (
                    <CommandItem
                      key={`${result.path}-${result.section}`}
                      value={result.fullPath}
                      onSelect={() => handleSelect(result.fullPath)}
                      className="flex cursor-pointer flex-col items-start gap-0.5 py-2 !bg-transparent hover:!bg-accent hover:!text-accent-foreground"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="size-4 text-muted-foreground" />
                        <span className="font-medium">{result.title}</span>
                      </div>
                      <span className="ml-6 text-xs text-muted-foreground">
                        {result.parentLabel}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
