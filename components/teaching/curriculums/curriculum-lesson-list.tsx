"use client"

import { useState, useEffect } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Edit, Plus, GripVertical, Loader2 } from "lucide-react"
import { LessonDialog } from "@/components/teaching/lessons/lesson-dialog"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

// DnD Kit Imports
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
// 1. Add this import
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

interface CurriculumLessonListProps {
  curriculumId: Id<"curriculums">
}

// Helper Component for Sortable Item
function SortableLessonItem({ lesson, curriculumId }: { lesson: any, curriculumId: Id<"curriculums"> }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: lesson._id });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.8 : 1,
        position: 'relative' as const,
    };

    return (
        <div 
            ref={setNodeRef} 
            style={style} 
            className={`group flex items-center gap-3 p-3 bg-card border rounded-lg transition-all shadow-sm mb-2 max-w-full ${
                isDragging ? 'border-primary shadow-lg' : 'hover:border-primary/50'
            }`}
        >
            <div 
                {...attributes} 
                {...listeners} 
                className="cursor-grab active:cursor-grabbing hover:text-primary touch-none py-1 px-1 shrink-0"
            >
                <GripVertical className="h-4 w-4 text-muted-foreground group-hover:text-muted-foreground" />
            </div>
            
            <div className="flex-1 w-0 text-left">
                <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium truncate">{lesson.title}</span>
                    {!lesson.isActive && (
                        <Badge variant="secondary" className="text-[10px] h-5 px-1 shrink-0">Draft</Badge>
                    )}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                    {lesson.description || "No description"}
                </div>
            </div>

            {/* Edit Button - Added shrink-0 to protect it */}
            <div onPointerDown={(e) => e.stopPropagation()} className="shrink-0">
                <LessonDialog 
                    lesson={lesson}
                    curriculumId={curriculumId}
                    trigger={
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" type="button">
                            <Edit className="h-4 w-4 text-muted-foreground" />
                        </Button>
                    }
                />
            </div>
        </div>
    )
}

export function CurriculumLessonList({ curriculumId }: CurriculumLessonListProps) {
  const t = useTranslations()
  const lessons = useQuery(api.lessons.listByCurriculum, { curriculumId })
  const reorderLessons = useMutation(api.lessons.reorder)

  const [items, setItems] = useState<typeof lessons>([])
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    if (lessons) {
        setItems(lessons)
    }
  }, [lessons])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        // 3. Lower distance for faster activation (was 8)
        distance: 4, 
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id && items) {
      const oldIndex = items.findIndex((item) => item._id === active.id);
      const newIndex = items.findIndex((item) => item._id === over.id);
      
      const newItems = arrayMove(items, oldIndex, newIndex);
      setItems(newItems);
      
      const updates = newItems.map((item, index) => ({
          id: item._id,
          order: index + 1
      }));

      try {
          setIsPending(true)
          await reorderLessons({ updates })
      } catch (error) {
          toast.error("Failed to reorder lessons")
          setItems(lessons) 
      } finally {
          setIsPending(false)
      }
    }
  };

  if (lessons === undefined) {
    return <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
    </div>
  }

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex justify-between items-center">
         <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{items?.length || 0} {items?.length === 1 ? 'lesson' : 'lessons'}</span>
            {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
         </div>
         <LessonDialog 
            curriculumId={curriculumId}
            trigger={
                <Button size="sm" className="gap-2" type="button">
                    <Plus className="h-4 w-4" />
                    {t('common.add')} Lesson
                </Button>
            }
         />
      </div>

      <ScrollArea className="h-[400px] pr-4 border rounded-md bg-muted/10 p-2">
        {!items || items.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
                <p>No lessons yet.</p>
                <p>Click &ldquo;Add Lesson&rdquo; to create the first one.</p>
             </div>
        ) : (
            <DndContext 
                sensors={sensors} 
                collisionDetection={closestCenter} 
                onDragEnd={handleDragEnd}
                // 4. Apply the vertical restriction here
                modifiers={[restrictToVerticalAxis]}
            >
                <SortableContext 
                    items={items.map(l => l._id)} 
                    strategy={verticalListSortingStrategy}
                >
                    <div className="space-y-2">
                        {items.map((lesson) => (
                            <SortableLessonItem 
                                key={lesson._id} 
                                lesson={lesson} 
                                curriculumId={curriculumId} 
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
        )}
      </ScrollArea>
    </div>
  )
}