"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowRight, BookOpen, Video } from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"

export default function StudentDashboard() {
  const events = useQuery(api.schedule.getMySchedule, {})
  
  // Find the absolute next lesson
  const now = Date.now()
  const nextLesson = events?.find(e => e.end > now)
  const isLive = nextLesson && nextLesson.start <= now && nextLesson.end >= now

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Student Dashboard</h1>
        <p className="text-muted-foreground">Welcome back to your learning space.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        
        {/* HERO CARD: Next Class */}
        <Card className={`col-span-2 ${isLive ? 'border-primary shadow-lg' : ''}`}>
          <CardHeader>
            <CardTitle>Up Next</CardTitle>
          </CardHeader>
          <CardContent>
            {nextLesson ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-2xl font-bold text-primary">{nextLesson.title}</h3>
                  <p className="text-lg text-muted-foreground">{nextLesson.className}</p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="bg-muted px-3 py-1 rounded-full font-medium">
                    {format(nextLesson.start, "EEEE, h:mm a")}
                  </div>
                  {isLive && <span className="text-red-500 font-bold animate-pulse">● HAPPENING NOW</span>}
                </div>
                <Button size="lg" className="w-full sm:w-auto" asChild>
                  <Link href={`/classroom/${nextLesson.roomName}`}>
                    {isLive ? <><Video className="mr-2"/> Join Class</> : "Enter Classroom"}
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                No upcoming lessons scheduled. Enjoy your break!
              </div>
            )}
          </CardContent>
        </Card>

        {/* QUICK LINK: Schedule */}
        <Card>
          <CardHeader>
            <CardTitle>My Schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              View your full calendar and upcoming assignments.
            </p>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/calendar">
                View Calendar <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}