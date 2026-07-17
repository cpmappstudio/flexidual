"use client";

import React from "react";
import clsx from "clsx";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsSearch } from "@/components/sections/shell/settings/settings-search";
import {
  getSettingsNavConfig,
  isItemActive,
  type NavContext,
  type SettingsNavItem,
} from "@/lib/navigation";
import { useTranslations } from "next-intl";

interface SettingsLayoutProps {
  children: React.ReactNode;
  context: NavContext;
  orgSlug?: string;
}

function SettingsSidebar({
  items,
  basePath,
  orgSlug,
}: {
  items: SettingsNavItem[];
  basePath: string;
  orgSlug?: string;
}) {
  const pathname = usePathname();
  const t = useTranslations("Settings.nav");

  return (
    <nav className="flex w-56 shrink-0 flex-col gap-y-1 pr-6">
      <div className="mb-4">
        <SettingsSearch
          basePath={basePath}
          enabledLabelKeys={items.map((item) => item.labelKey)}
        />
      </div>
      {items.map((item) => {
        const href = item.href(orgSlug);
        const isActive = isItemActive(pathname, href, item.isIndex);
        return (
          <Link
            key={item.labelKey}
            href={href}
            className={clsx(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "",
            )}
          >
            <item.icon className="size-5" />
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}

function SettingsNavSelect({
  items,
  orgSlug,
}: {
  items: SettingsNavItem[];
  orgSlug?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("Settings.nav");

  const currentItem = items.find((item) => {
    const href = item.href(orgSlug);
    return isItemActive(pathname, href, item.isIndex);
  });

  return (
    <div className="mb-6 border-b border-zinc-200 pb-4 dark:border-zinc-700">
      <Select
        value={currentItem?.href(orgSlug) ?? items[0]?.href(orgSlug)}
        onValueChange={(value: string) => router.push(value)}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select page" />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => {
            const href = item.href(orgSlug);
            return (
              <SelectItem key={item.labelKey} value={href}>
                <div className="flex items-center gap-2">
                  <item.icon className="size-4" />
                  {t(item.labelKey)}
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

export function SettingsLayout({
  children,
  context,
  orgSlug,
}: SettingsLayoutProps) {
  const { items, basePath } = getSettingsNavConfig(context);
  const resolvedBasePath = basePath(orgSlug);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Mobile: Select navigation */}
      <div className="lg:hidden">
        <SettingsNavSelect items={items} orgSlug={orgSlug} />
      </div>

      {/* Desktop: Sidebar + Content */}
      <div className="flex flex-1 gap-8">
        {/* Sidebar - hidden on mobile */}
        <div className="hidden lg:block">
          <SettingsSidebar
            items={items}
            basePath={resolvedBasePath}
            orgSlug={orgSlug}
          />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
