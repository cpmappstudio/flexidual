"use client"

import * as React from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import {
    SidebarMenu,
    SidebarMenuItem,
    useSidebar,
} from "@/components/ui/sidebar"

export function UniversityLogo() {
    const { state } = useSidebar()
    const t = useTranslations('university')
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
    }, [])

    const isCollapsed = mounted && state === "collapsed"

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <div className={`flex w-full items-center gap-1 rounded-md pb-2 text-left text-sm ${isCollapsed ? 'justify-center px-0' : 'px-1'}`}>
                    <div className={`flex aspect-square items-center justify-center ${isCollapsed ? 'size-8' : 'size-14'}`}>
                        <Image
                            src="/flexidual-icon.png"
                            alt="flexidual logo"
                            width={isCollapsed ? 32 : 56}
                            height={isCollapsed ? 32 : 56}
                            className="object-contain"
                        />
                    </div>
                    {!isCollapsed && (
                        <div className="grid flex-1 text-left text-sm antialiased leading-tight">
                            <span className="truncate font-medium text-base">
                                {t('name')}
                            </span>
                            <span className="truncate text-xs font-semibold text-sidebar-accent-foreground tracking-wider">
                                {t('academicRecords')}
                            </span>
                        </div>
                    )}
                </div>
            </SidebarMenuItem>
        </SidebarMenu>
    )
}
