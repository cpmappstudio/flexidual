"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowRight } from "lucide-react"
import Link from "next/link"
import { CurriculumDialog } from "@/components/teaching/curriculums/curriculum-dialog"
import { useCurrentUser } from "@/hooks/use-current-user"
import { useTranslations } from "next-intl"

export default function MyCurriculumsPage() {
  const t = useTranslations()
  const curriculums = useQuery(api.curriculums.list, { includeInactive: false })
  const { user } = useCurrentUser()
  const isAdmin = user?.role === "admin" || user?.role === "superadmin"

  if (curriculums === undefined) {
    return <div className="p-6 space-y-4"><Skeleton className="h-10 w-48"/><Skeleton className="h-64 w-full"/></div>
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('curriculum.myCurriculums')}</h1>
          <p className="text-muted-foreground">{t('curriculum.manageDescription')}</p>
        </div>
        {isAdmin && <CurriculumDialog />}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {curriculums?.map((curr) => (
          <Card key={curr._id} className="group hover:shadow-md transition-all relative">
             {isAdmin && <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <CurriculumDialog curriculum={curr} />
             </div>}

            <CardHeader>
              <div className="flex justify-between items-start">
                <CardTitle className="truncate pr-8">{curr.title}</CardTitle>
              </div>
              <div className="flex gap-2">
                 {curr.code && <span className="text-xs font-mono bg-muted px-2 py-1 rounded">{curr.code}</span>}
              </div>
              <CardDescription className="line-clamp-2 min-h-[40px]">
                {curr.description || t('common.noDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full group-hover:bg-primary group-hover:text-primary-foreground" asChild>
                <Link href={`/curriculums/${curr._id}`}>
                  {t('curriculum.manageLessons')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
        {curriculums?.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
            { isAdmin ? t('curriculum.noResults') : t('common.noResults')}
          </div>
        )}
      </div>
    </div>
  )
}