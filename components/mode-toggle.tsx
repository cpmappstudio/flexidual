"use client"

import * as React from "react"
import { Moon, Sun, Monitor, ChevronsUpDown } from "lucide-react"
import { useTheme } from "next-themes"
import { useTranslations } from "next-intl"

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface ModeToggleProps {
    showText?: boolean
}

export function ModeToggle({ showText = true }: ModeToggleProps) {
    const { theme, setTheme, resolvedTheme } = useTheme()
    const t = useTranslations('common')
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
    }, [])

    // Optimización: Solo recalcular cuando cambian los temas o traducciones
    const themeLabel = React.useMemo(() => {
        switch (theme) {
            case "light": return t("light")
            case "dark": return t("dark")
            case "system": return t("system")
            default: return t("theme")
        }
    }, [theme, t])

    const themeIcon = React.useMemo(() => {
        if (theme === "system") {
            return <Monitor className="h-4 w-4" />
        }

        switch (resolvedTheme) {
            case "light": return <Sun className="h-4 w-4" />
            case "dark": return <Moon className="h-4 w-4" />
            default: return <Monitor className="h-4 w-4" />
        }
    }, [theme, resolvedTheme])

    // Durante hydration: valores por defecto neutrales
    if (!mounted) {
        return (
            <div className={`flex items-center ${showText ? 'justify-between w-full px-2' : 'justify-center w-8 h-8'} py-1.5 text-left text-sm rounded-md`}>
                <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4" />
                    {showText && <span className="font-medium">System</span>}
                </div>
                {showText && <ChevronsUpDown className="ml-auto h-4 w-4" />}
            </div>
        )
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <div className={`flex items-center ${showText ? 'justify-between w-full px-2' : 'justify-center w-8 h-8'} py-1.5 text-left text-sm cursor-pointer hover:bg-sidebar-accent hover:text-white rounded-md transition-colors`}>
                    <div className="flex items-center gap-2">
                        {themeIcon}
                        {showText && <span className="font-medium">{themeLabel}</span>}
                    </div>
                    {showText && <ChevronsUpDown className="ml-auto h-4 w-4" />}
                </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-full">
                <DropdownMenuItem onClick={() => setTheme("light")}>
                    <Sun className="mr-2 h-4 w-4" />
                    {t("light")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")}>
                    <Moon className="mr-2 h-4 w-4" />
                    {t("dark")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("system")}>
                    <Monitor className="mr-2 h-4 w-4" />
                    {t("system")}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}