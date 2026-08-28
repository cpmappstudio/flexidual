"use client";

import { useId, useState } from "react";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  CURRICULUM_ICON_KEYS,
  formatCurriculumIconName,
  getCurriculumIconSrc,
  isCurriculumIconKey,
  type CurriculumIconKey,
} from "@/lib/curriculum-icons";
import { cn } from "@/lib/utils";

export function CurriculumIcon({
  iconKey,
  className,
  size = 48,
}: {
  iconKey?: string;
  className?: string;
  size?: number;
}) {
  return (
    <Image
      src={getCurriculumIconSrc(iconKey)}
      alt=""
      width={size}
      height={size}
      unoptimized
      className={cn("size-10 shrink-0 object-contain", className)}
    />
  );
}

export function CurriculumIconPicker({
  value,
  onValueChange,
  label,
}: {
  value: CurriculumIconKey;
  onValueChange: (value: CurriculumIconKey) => void;
  label: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const selectedName = formatCurriculumIconName(value);

  return (
    <div className="grid gap-2">
      <Label id={`${id}-label`}>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-14 w-20 justify-between bg-sidebar p-2"
            aria-label={`${label}: ${selectedName}`}
            title={selectedName}
          >
            <CurriculumIcon iconKey={value} className="size-9" />
            <ChevronDown className="size-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="flex max-h-[min(22rem,var(--radix-popover-content-available-height))] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden p-0"
        >
          <div className="min-h-0 overflow-y-auto p-3">
            <RadioGroup
              value={value}
              aria-labelledby={`${id}-label`}
              onValueChange={(nextValue) => {
                if (!isCurriculumIconKey(nextValue)) return;
                onValueChange(nextValue);
                setOpen(false);
              }}
              className="grid grid-cols-5 gap-0 sm:grid-cols-6"
            >
              {CURRICULUM_ICON_KEYS.map((iconKey) => {
                const optionId = `${id}-${iconKey}`;
                const optionName = formatCurriculumIconName(iconKey);

                return (
                  <div key={iconKey} className="relative aspect-square">
                    <RadioGroupItem
                      id={optionId}
                      value={iconKey}
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor={optionId}
                      title={optionName}
                      className="flex size-full cursor-pointer items-center justify-center rounded-md bg-sidebar p-1.5 transition-colors hover:bg-accent peer-data-[state=checked]:border peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/10 peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
                    >
                      <CurriculumIcon iconKey={iconKey} className="size-full" />
                      <span className="sr-only">{optionName}</span>
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </div>
          <div className="shrink-0 border-t px-3 py-2 text-center text-[10px] text-muted-foreground">
            Icons:{" "}
            <a
              href="https://www.flaticon.com/authors/magnific"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              Magnific
            </a>{" "}
            ·{" "}
            <a
              href="https://www.flaticon.com/authors/jesus-chavarria"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              Jesus Chavarria
            </a>{" "}
            ·{" "}
            <a
              href="https://www.flaticon.com"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              Flaticon
            </a>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
