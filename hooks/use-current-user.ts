"use client"

import { useConvexAuth, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"

/**
 * Hook to get the current user from Convex database
 * This ensures the user exists in our database before allowing access
 * 
 * Usage:
 * const { isLoading, isAuthenticated, user } = useCurrentUser()
 * 
 * Returns:
 * - isLoading: true while checking auth or waiting for user to be synced
 * - isAuthenticated: true only when user is authenticated AND exists in our database
 * - user: the user document from Convex, or null if not authenticated
 */
export function useCurrentUser() {
    const { isLoading: isConvexLoading, isAuthenticated: isConvexAuthenticated } = useConvexAuth()
    const convexUser = useQuery(
        api.users.getCurrentUser,
        isConvexAuthenticated ? {} : "skip"
    )

    // Combine the authentication state with the user existence check
    const isLoading = isConvexLoading || (isConvexAuthenticated && convexUser === undefined)
    const isAuthenticated = isConvexAuthenticated && convexUser !== null

    return {
        isLoading,
        isAuthenticated,
        user: convexUser,
    }
}
