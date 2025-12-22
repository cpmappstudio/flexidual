"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Loader2, Video } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface JoinClassButtonProps {
  lessonId: Id<"lessons">
}

export function JoinClassButton({ lessonId }: JoinClassButtonProps) {
  const router = useRouter()
  
  // 1. Get my entire schedule (Universal Query)
  const mySchedule = useQuery(api.schedule.getMySchedule, {})

  // 2. Find if this specific lesson is currently LIVE for me
  //    We check if we have a schedule item for this lessonId that is marked 'isLive'
  const activeSession = mySchedule?.find(
    (s) => s.lessonId === lessonId && s.isLive === true
  )

  const handleJoin = () => {
    if (activeSession?.roomName) {
      router.push(`/classroom/${activeSession.roomName}`)
    } else {
      toast.error("Class is not currently active.")
    }
  }

  // Loading State
  if (mySchedule === undefined) {
    return (
      <Button disabled variant="outline" size="sm">
        <Loader2 className="w-4 h-4 animate-spin mr-2"/> 
        Checking...
      </Button>
    )
  }

  // Active State (Green Pulse Button)
  if (activeSession) {
    return (
      <Button 
        onClick={handleJoin} 
        size="lg" 
        className="w-full md:w-auto bg-green-600 hover:bg-green-700 text-white animate-pulse font-bold"
      >
        <Video className="w-5 h-5 mr-2" />
        Join Live Class
      </Button>
    )
  }

  // Inactive State (Optional: Don't render, or render disabled)
  // Usually better to render nothing if not active, or a "Not Started" badge
  return (
    <Button disabled variant="secondary">
      Not Live
    </Button>
  )
}