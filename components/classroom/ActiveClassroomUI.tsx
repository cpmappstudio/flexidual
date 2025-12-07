"use client";

import { 
  useTracks, 
  TrackReferenceOrPlaceholder,
  VideoTrack,
  useParticipants,
  ControlBar
} from "@livekit/components-react";
import { Track, Participant } from "livekit-client";

export function ActiveClassroomUI() {
  // Get all camera tracks
  const tracks = useTracks([Track.Source.Camera]);

  // Filter tracks based on roles (Metadata we set in the Token!)
  // Note: We need to parse metadata because it comes as a JSON string
  const getRole = (p: Participant) => {
    try {
      const md = JSON.parse(p.metadata || "{}");
      return md.role;
    } catch {
      return "student";
    }
  };

  const teacherTrack = tracks.find((t) => getRole(t.participant) === "teacher");
  const tutorTracks = tracks.filter((t) => getRole(t.participant) === "tutor");
  const studentTracks = tracks.filter((t) => getRole(t.participant) === "student");

  return (
    <div className="flex h-full bg-gray-950 text-white">
      
      {/* --- CENTER STAGE (Teacher) --- */}
      <div className="flex-1 flex flex-col relative border-r border-gray-800">
        <div className="flex-1 relative bg-black flex items-center justify-center p-4">
          {teacherTrack ? (
            <VideoTrack 
              trackRef={teacherTrack} 
              className="max-h-full max-w-full rounded-lg shadow-lg border border-gray-700" 
            />
          ) : (
            <div className="text-gray-500 text-center">
              <span className="text-4xl block mb-2">👨‍🏫</span>
              Waiting for Teacher...
            </div>
          )}
        </div>
        
        {/* Controls at bottom of center stage */}
        <div className="p-4 bg-gray-900 border-t border-gray-800 flex justify-center">
           <ControlBar variation="minimal" />
        </div>
      </div>

      {/* --- RIGHT SIDEBAR (Classmates & Tutors) --- */}
      <div className="w-80 flex flex-col bg-gray-900 border-l border-gray-800">
        
        {/* Tutors Section (Fixed at top) */}
        {tutorTracks.length > 0 && (
          <div className="p-2 border-b border-gray-700 bg-gray-800/50">
            <h3 className="text-xs font-bold text-yellow-500 mb-2 uppercase tracking-wider">
              Live Tutors
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {tutorTracks.map((track) => (
                <div key={track.participant.identity} className="aspect-video bg-black rounded overflow-hidden relative">
                  <VideoTrack trackRef={track} className="w-full h-full object-cover" />
                  <div className="absolute bottom-1 left-1 text-[10px] bg-black/70 px-1 rounded">
                    {track.participant.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Classmates Grid (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-2">
          <h3 className="text-xs font-bold text-blue-400 mb-2 uppercase tracking-wider sticky top-0 bg-gray-900 z-10 py-1">
            Classmates ({studentTracks.length})
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {studentTracks.map((track) => (
              <div key={track.participant.identity} className="aspect-square bg-gray-800 rounded-lg overflow-hidden relative border border-gray-700">
                <VideoTrack trackRef={track} className="w-full h-full object-cover" />
                <div className="absolute bottom-1 left-1 text-[10px] bg-black/60 px-1.5 py-0.5 rounded text-white truncate max-w-[90%]">
                  {track.participant.identity}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}