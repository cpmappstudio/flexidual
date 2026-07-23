"use client";

import { Shield, UserRound } from "lucide-react";
import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { ProfileDetailsForm } from "@/components/profile/profile-details-form";
import { ProfileSecuritySection } from "@/components/profile/profile-security-section";
import type {
  ProfileCurrentUser,
  ProfileSession,
} from "@/components/profile/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ProfileSettingsSection = "profile" | "security";

function ProfileSettingsLoadingState() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Skeleton className="size-16 rounded-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
      <div className="grid gap-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

function ProfileSettingsErrorState() {
  const t = useTranslations("ProfileSettings");

  return (
    <Alert variant="destructive">
      <AlertDescription>{t("genericError")}</AlertDescription>
    </Alert>
  );
}

function ProfileSettingsSectionContent({
  activeSection,
  currentUser,
  formId,
  onFormStateChange,
  onSignOutCurrentSession,
  sessions,
  tenantSlug,
}: {
  activeSection: ProfileSettingsSection;
  currentUser: ProfileCurrentUser | null | undefined;
  formId: string;
  onFormStateChange: (state: {
    hasChanges: boolean;
    isSaving: boolean;
  }) => void;
  onSignOutCurrentSession: () => Promise<void>;
  sessions: ProfileSession[] | undefined;
  tenantSlug?: string;
}) {
  if (currentUser === null) {
    return <ProfileSettingsErrorState />;
  }

  if (activeSection === "profile") {
    if (currentUser === undefined) {
      return <ProfileSettingsLoadingState />;
    }

    return (
      <ProfileDetailsForm
        key={currentUser._id}
        currentUser={currentUser}
        formId={formId}
        onStateChange={onFormStateChange}
      />
    );
  }

  return (
    <ProfileSecuritySection
      sessions={sessions}
      tenantSlug={tenantSlug}
      onSignOutCurrentSession={onSignOutCurrentSession}
    />
  );
}

export function ProfileSettingsDialog({
  open,
  onOpenChange,
  currentUser,
  onSignOutCurrentSession,
  tenantSlug,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUser: ProfileCurrentUser | null | undefined;
  onSignOutCurrentSession: () => Promise<void>;
  tenantSlug?: string;
}) {
  const t = useTranslations("ProfileSettings");
  const [activeSection, setActiveSection] =
    useState<ProfileSettingsSection>("profile");
  const sessions = useQuery(
    api.users.listMySessions,
    open && activeSection === "security" ? {} : "skip",
  );
  const profileFormId = "profile-settings-form";
  const [profileFormState, setProfileFormState] = useState({
    hasChanges: false,
    isSaving: false,
  });

  const sections: Array<{
    key: ProfileSettingsSection;
    label: string;
    icon: typeof UserRound;
  }> = [
    { key: "profile", label: t("profileTab"), icon: UserRound },
    { key: "security", label: t("securityTab"), icon: Shield },
  ];

  const activeSectionLabel =
    sections.find((section) => section.key === activeSection)?.label ??
    t("profileTab");

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setActiveSection("profile");
      setProfileFormState({
        hasChanges: false,
        isSaving: false,
      });
    }

    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="h-[min(640px,calc(100vh-1rem))] max-h-[calc(100vh-1rem)] max-w-[calc(100%-1rem)] gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-4xl lg:max-w-[980px]">
        <DialogTitle className="sr-only">{t("title")}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("description")}
        </DialogDescription>
        <SidebarProvider className="h-full min-h-0 w-full items-stretch overflow-hidden">
          <Sidebar collapsible="none" className="hidden h-full border-r md:flex">
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {sections.map((section) => (
                      <SidebarMenuItem key={section.key}>
                        <SidebarMenuButton
                          type="button"
                          isActive={section.key === activeSection}
                          onClick={() => setActiveSection(section.key)}
                        >
                          <section.icon />
                          <span>{section.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>

          <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <header className="flex h-16 shrink-0 items-center gap-2 border-b">
              <div className="flex min-w-0 flex-1 items-center justify-start gap-3 px-4 md:justify-between">
                <Breadcrumb className="hidden md:block">
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink>{t("title")}</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{activeSectionLabel}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>

                <div className="md:hidden">
                  <Select
                    value={activeSection}
                    onValueChange={(value) =>
                      setActiveSection(value as ProfileSettingsSection)
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder={activeSectionLabel} />
                    </SelectTrigger>
                    <SelectContent>
                      {sections.map((section) => (
                        <SelectItem key={section.key} value={section.key}>
                          {section.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
              <ProfileSettingsSectionContent
                activeSection={activeSection}
                currentUser={currentUser}
                formId={profileFormId}
                onFormStateChange={setProfileFormState}
                onSignOutCurrentSession={onSignOutCurrentSession}
                sessions={sessions}
                tenantSlug={tenantSlug}
              />
            </div>

            {activeSection === "profile" && currentUser ? (
              <DialogFooter className="shrink-0 px-4 pb-4 pt-2 md:px-6 md:pb-6 md:pt-4">
                <Button
                  type="submit"
                  form={profileFormId}
                  disabled={
                    profileFormState.isSaving || !profileFormState.hasChanges
                  }
                >
                  {t("saveProfile")}
                </Button>
              </DialogFooter>
            ) : null}
          </main>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  );
}
