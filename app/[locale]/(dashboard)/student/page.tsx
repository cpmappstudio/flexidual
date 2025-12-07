"use client";

import { SourceMenu } from "@/components/student/SourceMenu";
import { AssistanceWidget } from "@/components/student/AssistantWidget";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useState } from "react";
import { Loader2 } from "lucide-react";

export default function StudentDashboardPage() {
  const { user } = useUser();
  const router = useRouter();
  const locale = useLocale();
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  // Fetch full profile to get ID for widgets
  // We use the Clerk ID from the hook to query the database
  const convexUser = useQuery(api.users.getCurrentUser, 
    user?.id ? { clerkId: user.id } : "skip"
  );

  // 1. Drag Over Handler (Required to allow dropping)
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // This is crucial!
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  // 2. Drop Handler (The Magic Moment)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    // Retrieve the roomName we set in SourceMenu
    const roomName = e.dataTransfer.getData("roomName");
    
    if (roomName) {
      setIsNavigating(true);
      // Navigate to the Virtual Classroom
      router.push(`/${locale}/classroom/${encodeURIComponent(roomName)}`);
    }
  };

  if (!convexUser) return null;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0 h-full">
      
      {/* Header */}
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Student Lobby</h2>
      </div>
      
      <Separator />

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-[calc(100vh-180px)]">
        
        {/* LEFT COLUMN: Source Menu */}
        <div className="md:col-span-3 lg:col-span-3 flex flex-col gap-6 overflow-y-auto pr-2">
          {/* Account Card */}
          <div className="rounded-xl border bg-card p-4 flex items-center gap-3 shadow-sm">
             <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg">
                {convexUser.firstName?.charAt(0)}
             </div>
             <div>
                <p className="text-sm font-medium">{convexUser.fullName}</p>
                <p className="text-xs text-muted-foreground">
                    {convexUser.studentProfile?.gradeCode 
                        ? `Grade ${convexUser.studentProfile.gradeCode}` 
                        : 'Student'}
                </p>
             </div>
          </div>

          <AssistanceWidget studentId={convexUser._id} />

          <div className="flex-1 rounded-xl border bg-card shadow-sm p-4 overflow-y-auto">
             <SourceMenu />
          </div>
        </div>

        {/* CENTER COLUMN: Active Drop Zone */}
        <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
                md:col-span-9 lg:col-span-9 
                rounded-xl border-2 border-dashed 
                flex flex-col items-center justify-center relative overflow-hidden transition-all duration-300
                ${isDraggingOver 
                    ? 'border-green-500 bg-green-50/50 scale-[0.99]' 
                    : 'border-gray-300 bg-muted/30'}
            `}
        >
            {isNavigating ? (
                <div className="flex flex-col items-center animate-pulse">
                    <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                    <h3 className="text-xl font-bold text-primary">Connecting to Class...</h3>
                </div>
            ) : (
                <div className="text-center p-10 pointer-events-none">
                    <div className={`
                        w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl transition-transform duration-300
                        ${isDraggingOver ? 'bg-green-100 scale-110' : 'bg-blue-100'}
                    `}>
                        {isDraggingOver ? 'CX' : '👋'}
                    </div>
                    <h3 className="text-2xl font-bold text-gray-700">
                        {isDraggingOver ? 'Drop here to Join!' : 'Welcome to FlexiDual'}
                    </h3>
                    <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                        Select a class from the <strong>Source</strong> menu on the left and drag it here to enter your virtual classroom.
                    </p>
                </div>
            )}
        </div>

      </div>
    </div>
  );
}