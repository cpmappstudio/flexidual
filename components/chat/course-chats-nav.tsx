"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useOrgBasePath } from "@/hooks/use-org-base-path";
import { useStaffAccess } from "@/hooks/use-staff-access";
import { api } from "@/convex/_generated/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import { CurriculumIcon } from "@/components/teaching/curriculums/curriculum-icon";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ArchiveRestore, LoaderCircle } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

export function CourseChatsNav() {
  const t = useTranslations("navigation");
  const pathname = usePathname();
  const basePath = useOrgBasePath();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { isAuthenticated } = useConvexAuth();
  const { access } = useStaffAccess();
  const setArchived = useMutation(api.courseChatMessages.setArchived);
  const [restoringId, setRestoringId] = useState<string>();
  const orgContext = useQuery(
    api.organizations.resolveSlug,
    isAuthenticated ? { slug: orgSlug } : "skip",
  );
  const chats = useQuery(
    api.classes.listChatOptions,
    !isAuthenticated || !orgContext
      ? "skip"
      : orgContext.type === "campus"
        ? { campusId: orgContext._id }
        : orgContext.type === "school"
          ? { schoolId: orgContext._id }
          : {},
  );
  const activeChats = chats?.filter((chat) => !chat.archived) ?? [];
  const archivedChats = chats?.filter((chat) => chat.archived) ?? [];
  const canRestoreChats = access?.canManageCampus ?? false;

  const restoreChat = async (
    classId: (typeof archivedChats)[number]["_id"],
  ) => {
    if (restoringId) return;
    setRestoringId(classId);
    try {
      await setArchived({ classId, archived: false });
      toast.success(t("chatRestored"));
    } catch {
      toast.error(t("restoreChatError"));
    } finally {
      setRestoringId(undefined);
    }
  };

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>{t("chats")}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {chats === undefined ? (
              Array.from({ length: 3 }, (_, index) => (
                <SidebarMenuSkeleton key={index} showIcon />
              ))
            ) : activeChats.length === 0 ? (
              <li className="px-2 py-3 text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
                {t("noChats")}
              </li>
            ) : (
              activeChats.map((course) => {
                const href = `${basePath}/chats/${course._id}`;
                return (
                  <SidebarMenuItem key={course._id}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === href}
                      tooltip={course.name}
                      aria-label={course.name}
                      className="h-11 gap-3 px-2 text-sm group-data-[collapsible=icon]:p-1!"
                    >
                      <Link href={href}>
                        <CurriculumIcon
                          iconKey={course.curriculumIconKey}
                          className="size-7"
                          size={28}
                        />
                        <span>{course.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {archivedChats.length > 0 ? (
        <SidebarGroup>
          <SidebarGroupLabel>{t("archivedChats")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {archivedChats.map((course) => (
                <SidebarMenuItem key={course._id}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton
                        tooltip={course.name}
                        aria-label={course.name}
                        className="h-11 gap-3 px-2 text-sm opacity-60 group-data-[collapsible=icon]:p-1!"
                      >
                        <CurriculumIcon
                          iconKey={course.curriculumIconKey}
                          className="size-7 grayscale"
                          size={28}
                        />
                        <span>{course.name}</span>
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start">
                      <DropdownMenuItem
                        disabled={!canRestoreChats || restoringId !== undefined}
                        onSelect={() => void restoreChat(course._id)}
                      >
                        {restoringId === course._id ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <ArchiveRestore />
                        )}
                        {t("unarchiveChat")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}
    </>
  );
}
