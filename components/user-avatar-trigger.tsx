"use client"

import * as React from "react"
import { useUser } from "@clerk/clerk-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import Image from "next/image"

interface UserAvatarTriggerProps {
  className?: string
  size?: number
}

export function UserAvatarTrigger({ 
  className = "", 
  size = 28 
}: UserAvatarTriggerProps) {
  const { user } = useUser()
  
  // Keep track of the last valid image URL to prevent glitches
  const [lastValidImageUrl, setLastValidImageUrl] = React.useState<string | undefined>(undefined)

  // Determine which image to show
  const imageUrl = React.useMemo(() => {
    if (user?.imageUrl) {
      setLastValidImageUrl(user.imageUrl)
      return user.imageUrl
    }
    // If user.imageUrl is being reloaded and is temporarily undefined,
    // keep showing the last valid image
    return lastValidImageUrl
  }, [user?.imageUrl, lastValidImageUrl])

  if (!user) {
    return null
  }

  return (
    <Avatar
      className={`rounded-full overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    >
      <AvatarImage
        src={imageUrl}
        alt={user.fullName || user.username || "User"}
        className="object-cover"
      />
      <AvatarFallback className="bg-muted">
        <Image 
          src="/default-avatar.png" 
          alt="Default avatar" 
          width={size} 
          height={size}
          className="object-cover"
        />
      </AvatarFallback>
    </Avatar>
  )
}
