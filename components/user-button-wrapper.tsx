"use client"

import * as React from "react"
import { UserButton, useUser } from "@clerk/nextjs"
import { Skeleton } from "@/components/ui/skeleton"

interface UserButtonWrapperProps {
    showName?: boolean
    collapsed?: boolean
}

export function UserButtonWrapper({ showName = true, collapsed = false }: UserButtonWrapperProps) {
    const { isLoaded } = useUser()

    // Contenedor con dimensiones fijas para evitar layout shifting
    const containerStyle = {
        padding: !collapsed ? "0.62rem 0.5rem" : "0.1rem",
        minHeight: !collapsed ? "3.6rem" : "2.5rem", // Altura fija reservada
    }

    if (!isLoaded) {
        return (
            <div
                className="flex items-center space-x-4 w-full"
                style={containerStyle}
            >
                <Skeleton className="h-7 w-7 rounded-full" />
                {showName && !collapsed && (
                    <div className="space-y-2 flex-1">
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-3/4" />
                    </div>
                )}
            </div>
        )
    }

    return (
        <div
            className="w-full"
            style={containerStyle}
        >
            <UserButton
                appearance={{
                    elements: {
                        userButtonBox: {
                            flexDirection: "row-reverse",
                            textAlign: "left",
                            width: "100%",
                        },
                        userButtonOuterIdentifier: {
                            color: "var(--sidebar-foreground)",
                        },
                        userButtonPopoverCard: { pointerEvents: "initial" },
                    },
                }}
                showName={showName}
            />
        </div>
    )
}
