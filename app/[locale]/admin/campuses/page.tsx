"use client"

import { useState } from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { useTranslations } from "next-intl"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MapPin, Building2 } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { CampusDialog } from "@/components/admin/campuses/campus-dialog"

export default function CampusesPage() {
    const t = useTranslations()
    const [selectedSchoolId, setSelectedSchoolId] = useState<string>("all")

    const schools = useQuery(api.schools.list, {})
    
    const campuses = useQuery(api.campuses.list, 
        selectedSchoolId === "all" ? {} : { schoolId: selectedSchoolId as Id<"schools"> }
    )

    const schoolMap = new Map(schools?.map(s => [s._id, s.name]) || [])

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t("admin.campuses")}</h1>
                    <p className="text-muted-foreground">
                        {t("admin.campusesDescription")}
                    </p>
                </div>
                
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    {/* School Filter Dropdown */}
                    <Select value={selectedSchoolId} onValueChange={setSelectedSchoolId}>
                        <SelectTrigger className="w-full sm:w-[200px]">
                            <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-muted-foreground" />
                                <SelectValue placeholder={t("admin.allSchools")} />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t("admin.allSchools")}</SelectItem>
                            {schools?.map(school => (
                                <SelectItem key={school._id} value={school._id}>
                                    {school.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    
                    <CampusDialog />
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-emerald-500" />
                        {t("admin.activeCampuses")}
                    </CardTitle>
                    <CardDescription>
                        {t("admin.activeCampusesDescription")}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {!campuses || !schools ? (
                        <div className="space-y-2">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                    ) : (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t("admin.campusName")}</TableHead>
                                        <TableHead>{t("admin.parentSchool")}</TableHead>
                                        <TableHead>{t("admin.urlSlug")}</TableHead>
                                        <TableHead>{t("common.status")}</TableHead>
                                        <TableHead className="text-right">{t("common.actions")}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {campuses.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center text-muted-foreground h-24">
                                                {t("admin.noCampusesFound")}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        campuses.map((campus) => (
                                            <TableRow key={campus._id}>
                                                <TableCell className="font-medium">{campus.name}</TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    {schoolMap.get(campus.schoolId) || "Unknown"}
                                                </TableCell>
                                                <TableCell className="font-mono text-muted-foreground text-xs">
                                                    /{campus.slug}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={campus.isActive ? "default" : "secondary"}>
                                                        {campus.isActive ? t("common.active") : t("common.inactive")}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <CampusDialog campus={campus} />
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}