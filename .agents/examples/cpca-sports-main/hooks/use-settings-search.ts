"use client";

import { useMemo, useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import {
  SETTINGS_SEARCH_ITEMS,
  type SettingsSearchItem,
} from "@/lib/settings/search-config";

export type SettingsSearchResult = SettingsSearchItem & {
  title: string;
  description: string;
  parentLabel: string;
};

export function useSettingsSearch(
  basePath: string,
  enabledLabelKeys: string[],
) {
  const t = useTranslations("Settings");
  const [query, setQuery] = useState("");
  const enabledKeySet = useMemo(
    () => new Set(enabledLabelKeys),
    [enabledLabelKeys],
  );

  const searchIndex = useMemo(() => {
    return SETTINGS_SEARCH_ITEMS.filter((item) =>
      enabledKeySet.has(item.labelKey),
    ).map((item) => {
      let title: string;
      let description: string;

      try {
        title = t(`${item.translationKey}.title`);
        description = t(`${item.translationKey}.description`);
      } catch {
        title = t.has(item.translationKey)
          ? t(item.translationKey as never)
          : item.section;
        description = "";
      }

      const parentLabel = t(`nav.${item.labelKey}`);

      const searchableText = [
        title,
        description,
        parentLabel,
        ...(item.extraKeywords || []),
      ]
        .join(" ")
        .toLowerCase();

      return {
        ...item,
        title,
        description,
        parentLabel,
        searchableText,
        fullPath: item.path ? `${basePath}/${item.path}` : basePath,
      };
    });
  }, [t, basePath, enabledKeySet]);

  const results = useMemo(() => {
    if (!query.trim()) return [];

    const q = query.toLowerCase().trim();
    const words = q.split(/\s+/);

    return searchIndex
      .filter((item) =>
        words.every((word) => item.searchableText.includes(word)),
      )
      .slice(0, 6);
  }, [query, searchIndex]);

  const search = useCallback((newQuery: string) => {
    setQuery(newQuery);
  }, []);

  const reset = useCallback(() => {
    setQuery("");
  }, []);

  return {
    query,
    results,
    search,
    reset,
    hasResults: results.length > 0,
    isSearching: query.trim().length > 0,
  };
}
