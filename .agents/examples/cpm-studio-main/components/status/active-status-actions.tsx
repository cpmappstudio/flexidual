"use client";

import {
  Delete02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
} from "@/components/ui/context-menu";
import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

type ActiveStatusActionLabels = {
  activate: string;
  deactivate: string;
};

type ActiveStatusActionProps = {
  canManage: boolean;
  isActive: boolean;
  isPending?: boolean;
  labels: ActiveStatusActionLabels;
  onSetActive: (isActive: boolean) => void;
};

function getActiveStatusAction({
  isActive,
  labels,
}: {
  isActive: boolean;
  labels: ActiveStatusActionLabels;
}) {
  return isActive
    ? {
        icon: Delete02Icon,
        label: labels.deactivate,
        nextIsActive: false,
        tone: "destructive" as const,
      }
    : {
        icon: Tick02Icon,
        label: labels.activate,
        nextIsActive: true,
        tone: "success" as const,
      };
}

const activeStatusActionClassName =
  "justify-between data-[tone=success]:text-success data-[tone=success]:focus:bg-success/10 data-[tone=success]:focus:text-success data-[tone=success]:*:[svg]:text-success";

export function ActiveStatusDropdownMenuContent({
  canManage,
  isActive,
  isPending = false,
  labels,
  onSetActive,
}: ActiveStatusActionProps) {
  const action = getActiveStatusAction({ isActive, labels });

  return (
    <DropdownMenuContent align="end" className="w-52">
      <DropdownMenuGroup>
        <DropdownMenuItem
          data-tone={action.tone}
          variant={action.tone === "destructive" ? "destructive" : "default"}
          disabled={!canManage || isPending}
          className={activeStatusActionClassName}
          onClick={() => onSetActive(action.nextIsActive)}
        >
          <span>{action.label}</span>
          <HugeiconsIcon
            icon={action.icon}
            strokeWidth={2}
            aria-hidden="true"
          />
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  );
}

export function ActiveStatusContextMenuContent({
  canManage,
  isActive,
  isPending = false,
  labels,
  onSetActive,
}: ActiveStatusActionProps) {
  const action = getActiveStatusAction({ isActive, labels });

  return (
    <ContextMenuContent className="w-52">
      <ContextMenuGroup>
        <ContextMenuItem
          data-tone={action.tone}
          variant={action.tone === "destructive" ? "destructive" : "default"}
          disabled={!canManage || isPending}
          className={activeStatusActionClassName}
          onSelect={() => onSetActive(action.nextIsActive)}
        >
          <span>{action.label}</span>
          <HugeiconsIcon
            icon={action.icon}
            strokeWidth={2}
            aria-hidden="true"
          />
        </ContextMenuItem>
      </ContextMenuGroup>
    </ContextMenuContent>
  );
}
