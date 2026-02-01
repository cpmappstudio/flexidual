"use client"

import { useState } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { format } from "date-fns"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

interface AttendanceDialogProps {
  scheduleId: Id<"classSchedule">
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title?: string
}

export function AttendanceDialog({ scheduleId, trigger, open, onOpenChange, title }: AttendanceDialogProps) {
  const t = useTranslations()
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen
  
  const handleOpenChange = (val: boolean) => {
    if (!isControlled) setInternalOpen(val)
    onOpenChange?.(val)
  }

  const stats = useQuery(api.schedule.getAttendanceDetails, isOpen ? { scheduleId } : "skip")
  const updateStatus = useMutation(api.schedule.updateAttendance)

  const handleStatusChange = async (studentId: Id<"users">, newStatus: string) => {
    try {
      await updateStatus({
        scheduleId,
        studentId,
        status: newStatus as any
      })
      toast.success(t("schedule.attendance.updated"))
    } catch (error) {
      toast.error(t("schedule.attendance.updateFailed"))
    }
  }

  const getStatusBadge = (status: string, isManual: boolean) => {
    const styles = {
      present: "bg-green-100 text-green-700 hover:bg-green-100",
      absent: "bg-red-100 text-red-700 hover:bg-red-100",
      partial: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
      excused: "bg-blue-100 text-blue-700 hover:bg-blue-100",
      pending: "bg-gray-100 text-gray-500 hover:bg-gray-100",
    }
    const label = status.charAt(0).toUpperCase() + status.slice(1)
    
    return (
      <div className="flex items-center gap-2">
        <Badge className={styles[status as keyof typeof styles] || styles.pending} variant="secondary">
          {label}
        </Badge>
        {isManual && <span className="text-[10px] text-muted-foreground">(Manual)</span>}
      </div>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('schedule.attendance.title')}: {title || t('class.session')}</DialogTitle>
          <DialogDescription>
            {t('schedule.attendance.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto mt-4">
          {!stats ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('student.name')}</TableHead>
                  <TableHead>{t('schedule.attendance.timeTracked')}</TableHead>
                  <TableHead>{t('schedule.attendance.status')}</TableHead>
                  <TableHead className="text-right">{t('common.action')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.map((student) => (
                  <TableRow key={student.studentId}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{student.fullName}</span>
                        <span className="text-xs text-muted-foreground">{student.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {student.totalMinutes}m
                      {student.lastSeen && (
                         <div className="text-xs text-muted-foreground">
                           {t('schedule.attendance.lastSeen')}: {format(student.lastSeen, "h:mm a")}
                         </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(student.status, student.isManual)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Select 
                        defaultValue={student.status === "pending" ? undefined : student.status} 
                        onValueChange={(val) => handleStatusChange(student.studentId, val)}
                      >
                        <SelectTrigger className="w-[130px] ml-auto h-8 text-xs">
                          <SelectValue placeholder={t('schedule.attendance.setStatus')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="present">{t('schedule.attendance.present')}</SelectItem>
                          <SelectItem value="partial">{t('schedule.attendance.partial')}</SelectItem>
                          <SelectItem value="excused">{t('schedule.attendance.excused')}</SelectItem>
                          <SelectItem value="absent">{t('schedule.attendance.absent')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}