"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
// import { useTranslations } from "next-intl"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Building2 } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { SchoolDialog } from "@/components/admin/schools/school-dialog"

export default function SchoolsPage() {
    // const t = useTranslations()
    const schools = useQuery(api.schools.list, {})

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Schools & Districts</h1>
                    <p className="text-muted-foreground">
                        Manage your top-level educational institutions.
                    </p>
                </div>
                <SchoolDialog />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-blue-500" />
                        Active Schools
                    </CardTitle>
                    <CardDescription>
                        All educational networks registered in the system.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {!schools ? (
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
                                        <TableHead>Name</TableHead>
                                        <TableHead>URL Slug</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {schools.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center text-muted-foreground h-24">
                                                No schools found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        schools.map((school) => (
                                            <TableRow key={school._id}>
                                                <TableCell className="font-medium">{school.name}</TableCell>
                                                <TableCell className="font-mono text-muted-foreground text-xs">
                                                    /{school.slug}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={school.isActive ? "default" : "secondary"}>
                                                        {school.isActive ? "Active" : "Inactive"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <SchoolDialog school={school} />
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