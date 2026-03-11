"use client"

import { useTranslations } from "next-intl"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useState } from "react"
import { useParams } from "next/navigation"
import { Building2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Id } from "@/convex/_generated/dataModel"
import { Users, School, BookOpen, GraduationCap, Activity, LucideIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AdminClassTrackingCard } from "@/components/admin/admin-class-tracking-card"

export default function AdminDashboard() {
    const t = useTranslations()
    const params = useParams()
    
    // Resolve context
    let currentSlug = (params.orgSlug as string) || "system"
    if (currentSlug === "admin") currentSlug = "system"

    const orgContext = useQuery(api.organizations.resolveSlug, { slug: currentSlug })
    const isSystemDashboard = orgContext?.type === "system"

    // Superadmin filter state
    const [selectedSchoolId, setSelectedSchoolId] = useState<string>("all")
    const schools = useQuery(api.schools.list, isSystemDashboard ? {} : "skip")

    // Calculate effective query arguments
    let queryOrgType = orgContext?.type;
    let queryOrgId = orgContext?._id;
    let querySchoolId = undefined;

    if (isSystemDashboard && selectedSchoolId !== "all") {
        queryOrgType = "school";
        queryOrgId = selectedSchoolId as Id<"schools">;
        querySchoolId = selectedSchoolId as Id<"schools">;
    } else if (orgContext?.type === "school") {
        querySchoolId = orgContext._id as Id<"schools">;
    }

    // Pass the calculated arguments to the queries
    const teachers = useQuery(api.users.getUsers, orgContext ? { role: "teacher", isActive: true, orgType: queryOrgType, orgId: queryOrgId } : "skip")
    const students = useQuery(api.users.getUsers, orgContext ? { role: "student", isActive: true, orgType: queryOrgType, orgId: queryOrgId } : "skip")
    const activeClasses = useQuery(api.classes.list, orgContext ? { isActive: true, schoolId: querySchoolId } : "skip")
    const curriculums = useQuery(api.curriculums.list, orgContext ? { includeInactive: false, schoolId: querySchoolId } : "skip")
    
    // We intentionally leave this as {} so we don't trigger the Validator error. 
    // The rendered schedules are filtered automatically below because they only map to the activeClasses!
    const allSchedules = useQuery(api.schedule.getMySchedule, {})

    const isLoading = teachers === undefined || students === undefined || activeClasses === undefined || curriculums === undefined || allSchedules === undefined

    if (isLoading) {
        return (
            <div className="container mx-auto p-6 space-y-6 animate-pulse">
                <div className="h-24 bg-card rounded-xl border border-border"></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-card rounded-xl border border-border"></div>)}
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto p-4 sm:p-6 space-y-6">
            
            <div className="dashboard-header flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-black text-foreground mb-1">
                        {t('admin.title') || 'Admin Overview'}
                    </h1>
                    <p className="text-muted-foreground font-medium">
                        {t('admin.description') || 'Platform activity and quick statistics.'}
                    </p>
                </div>
                
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    {isSystemDashboard && (
                        <Select value={selectedSchoolId} onValueChange={setSelectedSchoolId}>
                            <SelectTrigger className="w-full sm:w-auto min-w-[200px] max-w-[350px]">
                                <div className="flex items-center gap-2 truncate">
                                    <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                                    <span className="truncate">
                                        {selectedSchoolId === "all" ? "All Schools" : schools?.find(s => s._id === selectedSchoolId)?.name || "Select School"}
                                    </span>
                                </div>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Schools</SelectItem>
                                {schools?.map((school) => (
                                    <SelectItem key={school._id} value={school._id}>
                                        {school.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    
                    <div className="hidden sm:flex items-center justify-center w-14 h-14 bg-primary/10 rounded-2xl border border-primary/20 shrink-0">
                        <Activity className="w-7 h-7 text-primary" />
                    </div>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                <StatCard 
                    title={t('navigation.students') || 'Active Students'} 
                    value={students?.length || 0} 
                    icon={GraduationCap} 
                    colorClass="text-blue-500" 
                    bgClass="bg-blue-500/10" 
                />
                <StatCard 
                    title={t('navigation.teachers') || 'Active Teachers'} 
                    value={teachers?.length || 0} 
                    icon={Users} 
                    colorClass="text-purple-500" 
                    bgClass="bg-purple-500/10" 
                />
                <StatCard 
                    title={t('navigation.allClasses') || 'Active Classes'} 
                    value={activeClasses?.length || 0} 
                    icon={School} 
                    colorClass="text-orange-500" 
                    bgClass="bg-orange-500/10" 
                />
                <StatCard 
                    title={t('navigation.allCurriculums') || 'Curriculums'} 
                    value={curriculums?.length || 0} 
                    icon={BookOpen} 
                    colorClass="text-green-500" 
                    bgClass="bg-green-500/10" 
                />
            </div>

            {/* Class & Teacher Tracking */}
            <div className="mt-10">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-xl sm:text-2xl font-black text-foreground">
                            {t('admin.classTracking') || 'Class & Teacher Tracking'}
                        </h2>
                        <p className="text-sm font-bold text-muted-foreground mt-1">
                            Monitor overall progress and verify instructor attendance.
                        </p>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                    {activeClasses?.length === 0 ? (
                        <Card className="dashboard-card p-8 text-center border-dashed">
                            <p className="text-muted-foreground font-bold">No active classes found.</p>
                        </Card>
                    ) : (
                        activeClasses?.map((cls) => {
                            const classSchedules = allSchedules?.filter(s => s.classId === cls._id) || []
                            const matchingCurriculum = curriculums?.find(c => c._id === cls.curriculumId)
                            const enrichedClassData = {
                                name: cls.name,
                                curriculumTitle: matchingCurriculum?.title,
                                students: cls.students,
                            }
                            
                            return (
                                <AdminClassTrackingCard 
                                    key={cls._id} 
                                    classData={enrichedClassData} 
                                    schedules={classSchedules} 
                                />
                            )
                        })
                    )}
                </div>
            </div>
        </div>
    )
}

function StatCard({ title, value, icon: Icon, colorClass, bgClass }: { title: string, value: number | string, icon: LucideIcon, colorClass: string, bgClass: string }) {
    return (
        <Card className="dashboard-card hover:-translate-y-1 transition-transform duration-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                    {title}
                </CardTitle>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bgClass}`}>
                    <Icon className={`w-5 h-5 ${colorClass}`} />
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-3xl font-black text-foreground">{value}</div>
            </CardContent>
        </Card>
    )
}