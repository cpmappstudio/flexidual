"use client";

import { startTransition, useEffect, useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
  DEFAULT_FLEXIDUAL_COURSE_DETAIL_TAB,
  type FlexidualCourseDetailTab,
} from "@/modules/liveClasses/lib/flexidual-course-types";

type CourseDetailTabDefinition = {
  value: FlexidualCourseDetailTab;
  label: string;
  content: ReactNode;
};

type FlexidualCourseDetailTabsProps = {
  defaultTab: FlexidualCourseDetailTab;
  tabs: readonly CourseDetailTabDefinition[];
};

export function FlexidualCourseDetailTabs({
  defaultTab,
  tabs,
}: FlexidualCourseDetailTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  function handleValueChange(value: string) {
    const nextTab = tabs.find((tab) => tab.value === value)?.value;

    if (!nextTab) {
      return;
    }

    setActiveTab(nextTab);

    const searchParams = new URLSearchParams(window.location.search);

    if (nextTab === DEFAULT_FLEXIDUAL_COURSE_DETAIL_TAB) {
      searchParams.delete("tab");
    } else {
      searchParams.set("tab", nextTab);
    }

    const nextHref =
      searchParams.size > 0
        ? `${pathname}?${searchParams.toString()}`
        : pathname;

    startTransition(() => {
      router.replace(nextHref, { scroll: false });
    });
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={handleValueChange}
      className="gap-6 lg:gap-8"
    >
      <div className="mt-6 sm:px-6">
        <TabsList
          variant="line"
          className="min-w-max w-full justify-start gap-4"
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="min-w-fit px-1.5 sm:px-4"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-0 min-w-0">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
