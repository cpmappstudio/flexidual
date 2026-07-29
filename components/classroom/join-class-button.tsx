"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Loader2, Video } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { useCurrentMinute } from "@/hooks/use-current-minute"

interface JoinClassButtonProps {
  lessonId: Id<"lessons">
}

export function JoinClassButton({ lessonId }: JoinClassButtonProps) {
  const t = useTranslations()
  const router = useRouter()
  const params = useParams()
  const orgSlug = (params.orgSlug as string) || "system"
  const locale = (params.locale as string) || "en"
  const now = useCurrentMinute()
  
  // 1. Get my entire schedule (Universal Query)
  const mySchedule = useQuery(api.schedule.getMySchedule, {
    now,
    includeAttendance: false,
    includeRecordings: false,
  })

  // 2. Find if this specific lesson is currently LIVE for me
  //    Check if we have a schedule item with this lessonId in the lessonIds array that is marked 'isLive'
  const activeSession = mySchedule?.find(
    (s) => s.lessonIds?.includes(lessonId) && s.isLive === true
  )

  const handleJoin = () => {
    if (activeSession?.roomName) {
      router.push(`/${locale}/${orgSlug}/classroom/${activeSession.roomName}`)
    } else {
      toast.error(t('classroom.notActive'))
    }
  }

  // Loading State
  if (mySchedule === undefined) {
    return (
      <Button disabled variant="outline" size="sm">
        <Loader2 className="w-4 h-4 animate-spin mr-2"/> 
        {t('classroom.checking')}
      </Button>
    )
  }

  // Active State (Green Pulse Button)
  if (activeSession) {
    return (
      <Button 
        onClick={handleJoin} 
        size="lg" 
        className="w-full md:w-auto bg-success hover:bg-success/90 text-success-foreground animate-pulse font-bold"
      >
        <Video className="w-5 h-5 mr-2" />
        {t('classroom.joinLive')}
      </Button>
    )
  }

  // Inactive State (Optional: Don't render, or render disabled)
  // Usually better to render nothing if not active, or a "Not Started" badge
  return (
    <Button disabled variant="secondary">
      {t('classroom.notLive')}
    </Button>
  )
}
