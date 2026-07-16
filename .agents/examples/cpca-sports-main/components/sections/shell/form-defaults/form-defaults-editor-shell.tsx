"use client";

import type { ReactNode } from "react";
import { File, CreditCard } from "lucide-react";
import { UserIcon } from "@heroicons/react/20/solid";
import CpcaHeader from "@/components/common/cpca-header";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type FormDefaultsEditorTab = "application" | "documents" | "payments";

interface FormDefaultsEditorShellProps {
  media?: ReactNode;
  logoUrl?: string;
  title: ReactNode;
  subtitle: ReactNode;
  action?: ReactNode;
  activeTab: FormDefaultsEditorTab;
  tabLabels: {
    application: string;
    documents: string;
    payments: string;
  };
  onTabChange: (tab: FormDefaultsEditorTab) => void;
  applicationContent: ReactNode;
  documentsContent: ReactNode;
  paymentsContent: ReactNode;
}

export function FormDefaultsEditorShell({
  media,
  logoUrl,
  title,
  subtitle,
  action,
  activeTab,
  tabLabels,
  onTabChange,
  applicationContent,
  documentsContent,
  paymentsContent,
}: FormDefaultsEditorShellProps) {
  return (
    <>
      <CpcaHeader
        media={media}
        logoUrl={logoUrl}
        title={title}
        subtitle={subtitle}
        action={action}
      />

      <Tabs
        value={activeTab}
        onValueChange={(value) => onTabChange(value as FormDefaultsEditorTab)}
        className="w-full gap-0"
      >
        <ScrollArea className="w-full whitespace-nowrap">
          <TabsList>
            <TabsTrigger
              value="application"
              className="gap-1 px-2 text-xs md:px-3 md:text-sm"
            >
              <UserIcon className="hidden h-4 w-4 md:block" />
              <span>{tabLabels.application}</span>
            </TabsTrigger>
            <TabsTrigger
              value="documents"
              className="gap-1 px-2 text-xs md:px-3 md:text-sm"
            >
              <File className="hidden h-4 w-4 md:block" />
              <span>{tabLabels.documents}</span>
            </TabsTrigger>
            <TabsTrigger
              value="payments"
              className="gap-1 px-2 text-xs md:px-3 md:text-sm"
            >
              <CreditCard className="hidden h-4 w-4 md:block" />
              <span>{tabLabels.payments}</span>
            </TabsTrigger>
          </TabsList>
        </ScrollArea>

        <TabsContent value="application" className="relative z-0 mt-0">
          <Card className="relative z-0">
            <CardContent className="space-y-6 px-0 pt-0 sm:px-6">
              {applicationContent}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="relative z-0 mt-0">
          <Card className="relative z-0">
            <CardContent className="pt-0">{documentsContent}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="relative z-0 mt-0">
          <Card className="relative z-0">
            <CardContent className="pt-0">{paymentsContent}</CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
