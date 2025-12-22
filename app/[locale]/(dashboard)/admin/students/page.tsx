"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowRight, BookOpen, Video, Calendar as CalendarIcon, Clock } from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"

export default function StudentDashboard() {
  // 1. Fetch Universal Schedule
  const events = useQuery(api.schedule.getMySchedule, {})
  const user = useQuery(api.users.getCurrentUser, { clerkId: "skip" }) // Optional: Get user details if needed for "Hello Name"

  if (events === undefined) {
    return (
      <div className="p-8 space-y-8">
        <Skeleton className="h-12 w-1/3" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-48 col-span-2" />
          <Skeleton className="h-48" />
        </div>
      </div>
    )
  }

  // 2. Calculate "Up Next"
  const now = Date.now()
  // Sort by start time
  const sortedEvents = [...events].sort((a, b) => a.start - b.start)
  
  // Find the first event that ends in the future
  const nextLesson = sortedEvents.find(e => e.end > now)
  
  // Is it happening right now?
  const isLive = nextLesson && nextLesson.start <= now && nextLesson.end >= now

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Student Dashboard</h1>
        <p className="text-muted-foreground">
          {nextLesson 
            ? `You have a class ${isLive ? "happening now" : "coming up soon"}.`
            : "No upcoming classes scheduled for the immediate future."}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        
        {/* HERO CARD: Active/Next Class */}
        <Card className={`col-span-2 relative overflow-hidden ${isLive ? 'border-primary shadow-lg' : ''}`}>
          {isLive && (
            <div className="absolute top-0 right-0 p-4">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
            </div>
          )}
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {isLive ? "Happening Now" : "Up Next"}
            </CardTitle>
            <CardDescription>
              {nextLesson ? format(nextLesson.start, "EEEE, MMMM do") : "Relax, you're free!"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {nextLesson ? (
              <div className="space-y-6">
                <div>
                  <h3 className="text-3xl font-bold text-primary mb-2">{nextLesson.title}</h3>
                  <div className="flex items-center gap-2 text-lg text-muted-foreground">
                    <BookOpen className="h-5 w-5" />
                    <span>{nextLesson.className}</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 text-sm bg-muted/50 p-3 rounded-lg w-fit">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {format(nextLesson.start, "h:mm a")} - {format(nextLesson.end, "h:mm a")}
                    </span>
                  </div>
                  {isLive && (
                    <Badge variant="destructive" className="animate-pulse">
                      LIVE SESSION
                    </Badge>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                   {/* Primary Action: Join Video or View Content */}
                   {isLive ? (
                     <Button size="lg" className="w-full sm:w-auto font-bold" asChild>
                       <Link href={`/classroom/${nextLesson.roomName}`}>
                         <Video className="mr-2 h-5 w-5" /> Join Class Now
                       </Link>
                     </Button>
                   ) : (
                     <Button size="lg" className="w-full sm:w-auto" asChild>
                        <Link href={`/classroom/${nextLesson.roomName}`}>
                          Enter Classroom
                        </Link>
                     </Button>
                   )}
                   
                   {/* Secondary Action: Read Material */}
                   <Button variant="outline" size="lg" asChild>
                     <Link href={`/lessons/${nextLesson.lessonId}`}>
                       <BookOpen className="mr-2 h-4 w-4" /> View Material
                     </Link>
                   </Button>
                </div>
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-muted-foreground text-center">
                <CalendarIcon className="h-12 w-12 mb-4 opacity-20" />
                <p>No upcoming lessons.</p>
                <Button variant="link" asChild className="mt-2">
                  <Link href="/calendar">View Full Schedule</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SIDE CARD: Quick Schedule */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Your Schedule</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="space-y-4">
              {sortedEvents.slice(0, 4).map((event) => (
                <div key={event.scheduleId} className="flex items-start gap-3 text-sm border-b last:border-0 pb-3 last:pb-0">
                  <div className="flex flex-col items-center min-w-[3rem] bg-muted rounded p-1">
                    <span className="font-bold text-xs uppercase">{format(event.start, "MMM")}</span>
                    <span className="font-bold text-lg">{format(event.start, "d")}</span>
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium leading-none line-clamp-1">{event.title}</p>
                    <p className="text-xs text-muted-foreground">{format(event.start, "h:mm a")}</p>
                  </div>
                </div>
              ))}
              {events.length === 0 && <p className="text-sm text-muted-foreground">No events found.</p>}
            </div>
            
            <div className="mt-6 pt-4 border-t">
              <Button variant="outline" className="w-full" asChild>
                <Link href="/calendar">
                  Open Calendar <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}