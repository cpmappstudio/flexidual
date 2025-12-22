"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowRight } from "lucide-react"
import Link from "next/link"
import { CurriculumDialog } from "@/components/teaching/curriculums/curriculum-dialog"

export default function MyCurriculumsPage() {
  const curriculums = useQuery(api.curriculums.list, { includeInactive: false })

  if (curriculums === undefined) {
    return <div className="p-6 space-y-4"><Skeleton className="h-10 w-48"/><Skeleton className="h-64 w-full"/></div>
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Curriculums</h1>
          <p className="text-muted-foreground">Manage your course templates and lessons.</p>
        </div>
        <CurriculumDialog />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {curriculums.map((curr) => (
          <Card key={curr._id} className="group hover:shadow-md transition-all">
            <CardHeader>
              <div className="flex justify-between items-start">
                <CardTitle>{curr.title}</CardTitle>
                {curr.code && <span className="text-xs font-mono bg-muted px-2 py-1 rounded">{curr.code}</span>}
              </div>
              <CardDescription className="line-clamp-2">{curr.description || "No description"}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full group-hover:bg-primary group-hover:text-primary-foreground" asChild>
                <Link href={`/curriculums/${curr._id}`}>
                  Manage Lessons
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
        {curriculums.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            No curriculums found. Create one to get started.
          </div>
        )}
      </div>
    </div>
  )
}