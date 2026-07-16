"use client";

import * as React from "react";
import { Languages, ChevronsUpDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "./button";

interface LangToggleProps {
    showText?: boolean;
}

const LOCALES = ["en", "es"] as const;

export function LangToggle({ showText = true }: LangToggleProps) {
    const router = useRouter();
    const pathname = usePathname();
    const locale = useLocale();
    const t = useTranslations("Common");
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    const changeLanguage = React.useCallback(
        (newLocale: "en" | "es") => {
            if (newLocale === locale) return;
            router.replace(pathname, { locale: newLocale });
        },
        [router, pathname, locale],
    );

    const getLangLabel = React.useCallback(
        (localeCode: string) => t(`languages.${localeCode}`),
        [t],
    );

    const currentLangLabel = getLangLabel(locale);

    if (!mounted) {
        return (
            <div
                className={`flex items-center ${showText ? "justify-between w-full px-2" : "justify-center w-8 h-8"} py-1.5 text-left text-sm rounded-md`}
            >
                <div className="flex items-center gap-2">
                    <Languages className="h-4 w-4" />
                    {showText && <span className="font-medium">English</span>}
                </div>
                {showText && <ChevronsUpDown className="ml-auto h-4 w-4" />}
            </div>
        );
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="secondary"
                    className={`${showText ? "justify-between" : "justify-center w-8 h-8"} max-w-3xs`}
                >
                    <Languages className="h-4 w-4" />
                    {showText && (
                        <span className="font-medium">{currentLangLabel}</span>
                    )}
                    {/* {showText && <ChevronsUpDown className="ml-auto h-4 w-4" />} */}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
                {LOCALES.map((localeOption) => (
                    <DropdownMenuItem
                        key={localeOption}
                        onClick={() => changeLanguage(localeOption)}
                    >
                        <Languages className="mr-2 h-4 w-4" />
                        {getLangLabel(localeOption)}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
