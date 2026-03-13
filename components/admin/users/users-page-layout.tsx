"use client";

import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { UsersTable } from "@/components/admin/users/users-table";
import FlexidualHeader from "@/components/flexidual-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, GraduationCap, Users, School } from "lucide-react";

export default function UsersPageLayout() {
  const t = useTranslations();
  const params = useParams();
  
  const orgSlug = (params.orgSlug as string) || "system";
  const isSystemDashboard = orgSlug === "system" || orgSlug === "admin";

  return (
    <>
      <FlexidualHeader
        title={t("navigation.users")}
        subtitle={t("dashboard.usersSummary")}
      />
      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-5 lg:w-[500px]">
                <TabsTrigger value="all">{t('common.all') || "All"}</TabsTrigger>
                <TabsTrigger value="admins">{t('navigation.admins')}</TabsTrigger>
                <TabsTrigger value="principals">{t('navigation.principals') || "Principals"}</TabsTrigger>
                <TabsTrigger value="teachers">{t('navigation.teachers')}</TabsTrigger>
                <TabsTrigger value="students">{t('navigation.students')}</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            {t('navigation.allUsers')}
                        </CardTitle>
                        <CardDescription>
                            {t('navigation.allUsersDescription')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <UsersTable />
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="admins" className="mt-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-destructive" />
                            {t('navigation.admins')}
                        </CardTitle>
                        <CardDescription>
                            {t('navigation.adminsDescription')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <UsersTable 
                            roleFilter="admin" 
                            allowedRoles={isSystemDashboard ? ["admin", "superadmin"] : ["admin"]}
                        />
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="principals" className="mt-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-indigo-500" />
                            {t('navigation.principals') || "Principals"}
                        </CardTitle>
                        <CardDescription>
                            {t('navigation.principalsDescription')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <UsersTable 
                            roleFilter="principal" 
                            allowedRoles={["principal"]} 
                        />
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="teachers" className="mt-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <School className="h-5 w-5 text-primary" />
                            {t('navigation.teachers')}
                        </CardTitle>
                        <CardDescription>
                            {t('navigation.teachersDescription')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <UsersTable 
                            roleFilter="teacher" 
                            allowedRoles={["teacher", "tutor"]}
                        />
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="students" className="mt-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <GraduationCap className="h-5 w-5 text-blue-500" />
                            {t('navigation.students')}
                        </CardTitle>
                        <CardDescription>
                            {t('navigation.studentsDescription')}
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
    </>
  );
}