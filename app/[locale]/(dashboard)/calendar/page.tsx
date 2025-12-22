"use client"

import { useState } from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import Calendar from "@/components/calendar/calendar"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { Video, Calendar as CalendarIcon } from "lucide-react"
import Link from "next/link"
import { CalendarEvent, Mode } from "@/components/calendar/calendar-types"

export default function CalendarPage() {
  const [mode, setMode] = useState<Mode>("month")
  const [date, setDate] = useState<Date>(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])

  // Fetch Universal Schedule
  const scheduleData = useQuery(api.schedule.getMySchedule, {})

  if (scheduleData === undefined) {
    return <div className="p-6"><Skeleton className="h-[600px] w-full" /></div>
  }

  // Transform to CalendarEvent format
  const calendarEvents: CalendarEvent[] = scheduleData.map(e => ({
    id: e.scheduleId,
    _id: e.scheduleId,
    scheduleId: e.scheduleId,
    lessonId: e.lessonId,
    classId: e.classId,
    curriculumId: e.curriculumId,
    title: e.title,
    description: e.description,
    start: new Date(e.start),
    end: new Date(e.end),
    color: e.color,
    className: e.className,
    curriculumTitle: e.curriculumTitle,
    roomName: e.roomName,
    isLive: e.isLive,
    status: e.status,
  }))

  // Prepare data for the List View (Upcoming)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const upcomingEvents = scheduleData
    .filter(e => e.start >= today.getTime())
    .sort((a, b) => a.start - b.start)
    .slice(0, 10) // Show 10 upcoming

  return (
    <div className="h-[calc(100vh-4rem)] p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Schedule</h1>
      </div>

      <Tabs defaultValue="month" className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="month">Month View</TabsTrigger>
            <TabsTrigger value="agenda">Agenda List</TabsTrigger>
          </TabsList>
        </div>

        {/* VIEW 1: The Graphical Calendar */}
        <TabsContent value="month" className="flex-1 border rounded-lg overflow-hidden bg-background p-2">
          <Calendar 
            events={calendarEvents}
            setEvents={setEvents}
            mode={mode}
            setMode={setMode}
            date={date}
            setDate={setDate}
            isLoading={false}
          />
        </TabsContent>

        {/* VIEW 2: The List / Agenda */}
        <TabsContent value="agenda" className="flex-1 overflow-auto">
          <div className="space-y-4 max-w-3xl mx-auto">
            {upcomingEvents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No upcoming lessons scheduled.
              </div>
            ) : (
              upcomingEvents.map((event) => (
                <Card key={event.scheduleId} className={event.isLive ? "border-green-500/50 bg-green-500/5" : ""}>
                  <CardContent className="p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    
                    {/* Time Box */}
                    <div className="flex flex-col items-center justify-center min-w-[80px] text-center p-2 bg-muted rounded-md">
                      <span className="text-sm font-bold uppercase text-muted-foreground">
                        {format(event.start, "MMM")}
                      </span>
                      <span className="text-2xl font-bold">
                        {format(event.start, "d")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(event.start, "h:mm a")}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">{event.title}</h3>
                        {event.isLive && (
                          <Badge variant="destructive" className="animate-pulse">
                            LIVE NOW
                          </Badge>
                        )}
                        {event.status === "cancelled" && (
                          <Badge variant="secondary">Cancelled</Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {event.curriculumTitle}
                      </p>
                      <p className="text-muted-foreground flex items-center gap-2">
                        <CalendarIcon className="h-3.5 w-3.5" />
                        {event.className}
                      </p>
                      {event.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {event.description}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="w-full sm:w-auto">
                      {event.status === "cancelled" ? (
                        <Button className="w-full sm:w-auto" variant="outline" disabled>
                          Cancelled
                        </Button>
                      ) : event.isLive ? (
                        <Button className="w-full sm:w-auto" variant="destructive" asChild>
                          <Link href={`/classroom/${event.roomName}`}>
                            <Video className="mr-2 h-4 w-4" />
                            Join Class
                          </Link>
                        </Button>
                      ) : (
                        <Button className="w-full sm:w-auto" variant="outline" asChild>
                          <Link href={`/classroom/${event.roomName}`}>
                            View Details
                          </Link>
                        </Button>
                      )}
                    </div>

                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}