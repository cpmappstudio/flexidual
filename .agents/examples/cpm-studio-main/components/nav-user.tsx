"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import type { Preloaded } from "convex/react";
import { usePreloadedQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { ProfileSettingsDialog } from "@/components/profile/profile-settings-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemeToggle } from "@/components/theme-toggle";
import { HugeiconsIcon } from "@hugeicons/react";
import { AccountSetting01Icon, Logout01Icon } from "@hugeicons/core-free-icons";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getInitials, getOptionalImageSrc } from "@/lib/files/image";
import { useState } from "react";

export function NavUser({
  preloadedCurrentUser,
  workspaceLink,
  signOutRedirectHref,
  tenantSlug,
}: {
  preloadedCurrentUser: Preloaded<typeof api.users.current>;
  workspaceLink?: {
    href: string;
    label: string;
    detail?: string;
  };
  signOutRedirectHref?: string;
  tenantSlug?: string;
}) {
  const { signOut } = useAuthActions();
  const currentUser = usePreloadedQuery(preloadedCurrentUser);
  const t = useTranslations("Common");
  const { replace } = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const [isPending, setIsPending] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const displayUser = {
    name: currentUser?.name ?? currentUser?.email ?? t("fallbackUserName"),
    email: currentUser?.email ?? "",
    avatar: currentUser?.avatarUrl ?? "",
  };

  const fallback = getInitials(displayUser.name, "CP");

  function handleLocaleChange(nextLocale: AppLocale) {
    replace(pathname, { locale: nextLocale });
  }

  async function handleSignOut() {
    setIsPending(true);

    try {
      await signOut();
    } finally {
      replace(signOutRedirectHref ?? "/sign-in");
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-10 rounded-full"
            aria-label={displayUser.name}
          >
            <Avatar className="size-9 rounded-full">
              <AvatarImage
                src={getOptionalImageSrc(displayUser.avatar)}
                alt={displayUser.name}
              />
              <AvatarFallback className="rounded-full">
                {fallback}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-72 rounded-xl"
          align="end"
          sideOffset={8}
        >
          <DropdownMenuLabel className="flex flex-col gap-1 p-3 font-normal">
            <span className="truncate text-sm font-medium text-foreground">
              {displayUser.name}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {displayUser.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => setIsProfileOpen(true)}>
              <span>{t("profileSettings")}</span>
              <HugeiconsIcon
                icon={AccountSetting01Icon}
                strokeWidth={2}
                className="ml-auto"
                aria-hidden="true"
              />
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <div className="flex flex-col gap-1 px-2 py-1 text-xs">
            <div className="flex items-center justify-between gap-4">
              <span>{t("theme")}</span>
              <ThemeToggle
                labels={{
                  theme: t("theme"),
                  light: t("themeLight"),
                  dark: t("themeDark"),
                  system: t("themeSystem"),
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span>{t("language")}</span>
              <Select
                value={locale}
                onValueChange={(value) =>
                  handleLocaleChange(value as AppLocale)
                }
              >
                <SelectTrigger className="w-32 justify-between" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectGroup>
                    <SelectItem value="en">{t("languageEnglish")}</SelectItem>
                    <SelectItem value="es">{t("languageSpanish")}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DropdownMenuSeparator />
          {workspaceLink ? (
            <>
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link
                    href={workspaceLink.href}
                    className="flex w-full items-center justify-between gap-3"
                  >
                    <span>{workspaceLink.label}</span>
                    {workspaceLink.detail ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {workspaceLink.detail}
                      </span>
                    ) : null}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem
            onClick={() => void handleSignOut()}
            disabled={isPending}
          >
            <span>{t("signOut")}</span>
            <HugeiconsIcon
              icon={Logout01Icon}
              strokeWidth={2}
              className="ml-auto"
              aria-hidden="true"
            />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProfileSettingsDialog
        open={isProfileOpen}
        onOpenChange={setIsProfileOpen}
        currentUser={currentUser}
        onSignOutCurrentSession={handleSignOut}
        tenantSlug={tenantSlug}
      />
    </>
  );
}
