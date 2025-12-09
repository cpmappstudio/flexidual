"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { BookOpen, MoreVertical } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { Id } from "@/convex/_generated/dataModel";

export function SourceMenu() {
  const { user } = useUser();
  const router = useRouter();
  const locale = useLocale();
  
//   // Get studentId from Clerk user metadata
//   const studentId = user?.publicMetadata?.convexUserId as Id<"users"> | undefined;
  
  const classes = useQuery(api.students.getStudentClasses);

  if (!user) {
    return <div className="p-4 text-sm text-muted-foreground">Loading user...</div>;
  }

  if (classes === undefined) {
    return <div className="p-4 text-sm text-muted-foreground">Loading classes...</div>;
  }

  // When dragging starts, we send the roomName
  const handleDragStart = (e: React.DragEvent, roomName: string) => {
    e.dataTransfer.setData("roomName", roomName);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleClassClick = (roomName: string) => {
    router.push(`/${locale}/classroom/${encodeURIComponent(roomName)}`);
  };

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">
        My Classes
      </h3>
      
      {classes.length === 0 ? (
        <div className="text-sm text-muted-foreground px-2">No classes assigned.</div>
      ) : (
        classes.map((cls) => (
          <div
            key={cls.curriculumId}
            draggable
            onDragStart={(e) => handleDragStart(e, cls.roomName)}
            onClick={() => handleClassClick(cls.roomName)}
            className="
              group flex items-center gap-3 p-3 rounded-xl 
              bg-card border shadow-sm 
              cursor-grab active:cursor-grabbing hover:shadow-md hover:border-primary/50
              transition-all
            "
          >
            {/* Class Icon */}
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold">
              <BookOpen className="w-5 h-5" />
            </div>
            
            {/* Class Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate text-foreground">
                {cls.name}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {cls.teacher?.name || "No Teacher Assigned"}
              </p>
            </div>

            {/* Drag Handle */}
            <MoreVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        ))
      )}
    </div>
  );
}