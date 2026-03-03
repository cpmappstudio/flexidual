"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useTranslations } from "next-intl"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MapPin, Plus, Edit } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

export default function CampusesPage() {
    const t = useTranslations()
    const campuses = useQuery(api.campuses.list, {})
    const schools = useQuery(api.schools.list, {})

    // Helper map to quickly find school names by ID
    const schoolMap = new Map(schools?.map(s => [s._id, s.name]) || [])

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Campuses</h1>
                    <p className="text-muted-foreground">
                        Manage physical or logical branches of your schools.
                    </p>
                </div>
                <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Campus
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-emerald-500" />
                        Active Campuses
                    </CardTitle>
                    <CardDescription>
                        All operational branches grouped by their parent school.
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
                                        <TableHead>Campus Name</TableHead>
                                        <TableHead>Parent School</TableHead>
                                        <TableHead>URL Slug</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {campuses.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center text-muted-foreground h-24">
                                                No campuses found.
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
                                                        {campus.isActive ? "Active" : "Inactive"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="ghost" size="icon">
                                                        <Edit className="h-4 w-4 text-muted-foreground" />
                                                    </Button>
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