"use client"

import * as React from "react"
import { Languages, ChevronsUpDown } from "lucide-react"
import { useRouter, usePathname } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface LangToggleProps {
    showText?: boolean
}

const LOCALES = ['en', 'es', 'pt-BR'] as const

export function LangToggle({ showText = true }: LangToggleProps) {
    const router = useRouter()
    const pathname = usePathname()
    const locale = useLocale()
    const t = useTranslations('common')
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
    }, [])

    // Memoizar función de cambio de idioma
    const changeLanguage = React.useCallback((newLocale: string) => {
        if (newLocale === locale) return

        // Reemplazar el locale en la URL actual
        const newPath = pathname.replace(`/${locale}`, `/${newLocale}`)
        router.push(newPath)
    }, [router, pathname, locale])

    // Optimización: Solo recalcular cuando cambia el idioma
    const getCurrentLangLabel = React.useMemo(() => {
        switch (locale) {
            case 'en': return t('english')
            case 'es': return t('spanish')
            case 'pt-BR': return t('portuguese')
            default: return t('language')
        }
    }, [locale, t])

    // Helper para obtener label de cualquier locale
    const getLangLabel = React.useCallback((localeCode: string) => {
        switch (localeCode) {
            case 'en': return t('english')
            case 'es': return t('spanish')
            case 'pt-BR': return t('portuguese')
            default: return t('language')
        }
    }, [t])

    // Durante hydration: valores por defecto
    if (!mounted) {
        return (
            <div className={`flex items-center ${showText ? 'justify-between w-full px-2' : 'justify-center w-8 h-8'} py-1.5 text-left text-sm rounded-md`}>
                <div className="flex items-center gap-2">
                    <Languages className="h-4 w-4" />
                    {showText && <span className="font-medium">English</span>}
                </div>
                {showText && <ChevronsUpDown className="ml-auto h-4 w-4" />}
            </div>
        )
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <div className={`flex items-center ${showText ? 'justify-between w-full px-2' : 'justify-center w-8 h-8'} py-1.5 text-left text-sm cursor-pointer hover:bg-[oklch(0.45_0.0568_265.16)] hover:text-white rounded-md transition-colors`}>
                    <div className="flex items-center gap-2">
                        <Languages className="h-4 w-4" />
                        {showText && <span className="font-medium">{getCurrentLangLabel}</span>}
                    </div>
                    {showText && <ChevronsUpDown className="ml-auto h-4 w-4" />}
                </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
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
    )
}