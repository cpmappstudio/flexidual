"use client";

import * as React from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { Building2, LogOut, Settings2, UserRound } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { useSettingsContext } from "@/hooks/use-settings-context";
import { cn } from "@/lib/utils";

type AppLocale = (typeof routing.locales)[number];

export function AccountMenu({ className }: { className?: string }) {
  const t = useTranslations("settings");
  const common = useTranslations("common");
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useClerk();
  const { user } = useUser();
  const { context, basePath, profilePath } = useSettingsContext();
  const [isSigningOut, setIsSigningOut] = React.useState(false);

  const name =
    user?.fullName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress ||
    t("fallbackUser");
  const email = user?.primaryEmailAddress?.emailAddress || "";
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const changeLocale = (nextLocale: AppLocale) => {
    if (nextLocale !== locale) router.replace(pathname, { locale: nextLocale });
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut({ redirectUrl: `/${locale}/sign-in` });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-10 rounded-full p-0", className)}
          aria-label={name}
        >
          <Image
            src="/settings-icon.svg"
            alt=""
            width={32}
            height={32}
            unoptimized
            className="size-8"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-72 rounded-xl"
        align="end"
        sideOffset={8}
      >
        <DropdownMenuLabel className="flex items-center gap-2 p-3 font-normal">
          <Avatar className="size-10 border">
            <AvatarImage
              className="object-cover"
              src={user?.imageUrl}
              alt={name}
            />
            <AvatarFallback className="text-xs font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{name}</p>
            {email && (
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href={profilePath} className="flex w-full items-center">
              <UserRound />
              {t("profileAndSecurity")}
              <Settings2 className="ml-auto" />
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <div className="px-2 py-2 text-xs">
          <div className="flex items-center justify-between gap-4">
            <span>{common("language")}</span>
            <Select
              value={locale}
              onValueChange={(value) => changeLocale(value as AppLocale)}
            >
              <SelectTrigger size="sm" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="en">{common("english")}</SelectItem>
                <SelectItem value="es">{common("spanish")}</SelectItem>
                <SelectItem value="pt-BR">{common("portuguese")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DropdownMenuSeparator />
        {context?.canManageInstitution && (
          <>
            <DropdownMenuItem asChild>
              <Link href={basePath} className="flex w-full items-center">
                <Building2 />
                {t("institution")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          variant="destructive"
          disabled={isSigningOut}
          onSelect={() => void handleSignOut()}
        >
          <LogOut />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
