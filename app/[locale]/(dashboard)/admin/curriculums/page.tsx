"use client"

import { useTranslations } from "next-intl"
import { CurriculumsTable } from "./curriculums-table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BookOpen, Library } from "lucide-react"

export default function CurriculumsPage() {
    const t = useTranslations()

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">{t('navigation.curriculums')}</h1>
                <p className="text-muted-foreground">
                    {t('navigation.curriculumsDescription')}
                </p>
            </div>

            <Tabs defaultValue="active" className="w-full">
                <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
                    <TabsTrigger value="active">{t('common.active')}</TabsTrigger>
                    <TabsTrigger value="all">{t('common.all')}</TabsTrigger>
                </TabsList>

                {/* ACTIVE CURRICULUMS TAB */}
                <TabsContent value="active" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <BookOpen className="h-5 w-5 text-primary" />
                                {t('curriculum.activeList')}
                            </CardTitle>
                            <CardDescription>
                                {t('navigation.curriculumsDescription2')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <CurriculumsTable includeInactive={false} />
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ALL / ARCHIVED TAB */}
                <TabsContent value="all" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Library className="h-5 w-5 text-muted-foreground" />
                                {t('curriculum.allList')}
                            </CardTitle>
                            <CardDescription>
                                View all curriculums including archived and legacy programs.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <CurriculumsTable includeInactive={true} />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}