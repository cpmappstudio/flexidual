"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export function AssistanceWidget({ studentId }: { studentId: string }) {
  // We cast the string ID to Convex ID type safely
  const profile = useQuery(api.users.getUser, { userId: studentId as Id<"users"> });

  const isOnline = profile?.onlineStatus?.state === "in_class";
  
  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-sm">Student Assistance</span>
        {/* Blinking Green Light */}
        <span className={`relative flex h-3 w-3`}>
          {isOnline && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          )}
          <span className={`relative inline-flex rounded-full h-3 w-3 ${isOnline ? 'bg-green-500' : 'bg-gray-300'}`}></span>
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">STATUS</span>
          <span className={`font-bold ${isOnline ? 'text-green-600' : 'text-muted-foreground'}`}>
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
        
        {/* Placeholder for Timer */}
        <div className="bg-muted rounded-md p-2 text-center">
           <span className="font-mono text-lg font-bold tracking-widest">
             00:00:00
           </span>
           <p className="text-[10px] text-muted-foreground mt-1">Time in Class</p>
        </div>
      </div>
    </div>
  );
}