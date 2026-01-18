"use client"

import { useTranslations } from "next-intl"
import { UsersTable } from "@/components/admin/users/users-table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ShieldCheck, GraduationCap, Users, School } from "lucide-react"

export default function UserManagementPage() {
    const t = useTranslations()

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">{t('navigation.users')}</h1>
                <p className="text-muted-foreground">
                    Manage system access, roles, and permissions.
                </p>
            </div>

            <Tabs defaultValue="all" className="w-full">
                <TabsList className="grid w-full grid-cols-4 lg:w-[400px]">
                    <TabsTrigger value="all">{t('common.all') || "All"}</TabsTrigger>
                    <TabsTrigger value="admins">{t('navigation.admin')}</TabsTrigger>
                    <TabsTrigger value="teachers">{t('navigation.teachers')}</TabsTrigger>
                    <TabsTrigger value="students">{t('navigation.students')}</TabsTrigger>
                </TabsList>

                {/* ALL USERS TAB - Can see everyone, create anyone (except maybe superadmin depending on logic) */}
                <TabsContent value="all" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Users className="h-5 w-5" />
                                All Users
                            </CardTitle>
                            <CardDescription>
                                Overview of all registered users in the platform.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <UsersTable />
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ADMINS TAB - Locked to creating Admins only */}
                <TabsContent value="admins" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ShieldCheck className="h-5 w-5 text-destructive" />
                                Administrators
                            </CardTitle>
                            <CardDescription>
                                Users with full system access and configuration privileges.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <UsersTable 
                                roleFilter="admin" 
                                allowedRoles={["admin", "superadmin"]} // Limit creation to Admin/Superadmin
                            />
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* TEACHERS TAB - Locked to creating Teachers only (No Admin role visible) */}
                <TabsContent value="teachers" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <School className="h-5 w-5 text-primary" />
                                Teachers & Tutors
                            </CardTitle>
                            <CardDescription>
                                Academic staff who manage classes and curriculum.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <UsersTable 
                                roleFilter="teacher" 
                                allowedRoles={["teacher", "tutor"]} // STRICT LIMIT: Only Teacher/Tutor options
                            />
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* STUDENTS TAB */}
                <TabsContent value="students" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <GraduationCap className="h-5 w-5 text-blue-500" />
                                Students
                            </CardTitle>
                            <CardDescription>
                                Enrolled learners.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <UsersTable 
                                roleFilter="student" 
                                allowedRoles={["student"]} 
                            />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}