"use client";

import { useTranslations } from "next-intl";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { Application } from "@/lib/applications/types";
import { ApplicationOverviewCard } from "./pre-admission/application-overview-card";
import { ApplicationAddressCard } from "./pre-admission/application-address-card";
import { ApplicationSchoolCard } from "./pre-admission/application-school-card";
import { ApplicationParentsCard } from "./pre-admission/application-parents-card";
import { ApplicationGeneralCard } from "./pre-admission/application-general-card";

interface ApplicationLegacyFormProps {
  application: Application;
  isEditing: boolean;
  onSectionDataChange: (
    sectionKey: string,
    sectionData: Record<string, string | number | boolean | null>,
  ) => void;
  onSectionValidityChange: (sectionKey: string, isValid: boolean) => void;
}

export function ApplicationLegacyForm({
  application,
  isEditing,
  onSectionDataChange,
  onSectionValidityChange,
}: ApplicationLegacyFormProps) {
  const t = useTranslations("Applications");

  return (
    <Accordion
      type="multiple"
      value={
        isEditing ? ["athlete", "address", "school", "parents", "general"] : undefined
      }
      className="w-full"
    >
      <AccordionItem value="athlete">
        <AccordionTrigger>{t("sections.athlete")}</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4 text-balance">
          <ApplicationOverviewCard
            application={application}
            isEditing={isEditing}
            onDataChange={(data) => onSectionDataChange("athlete", data)}
            onValidationChange={(isValid) =>
              onSectionValidityChange("athlete", isValid)
            }
          />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="address">
        <AccordionTrigger>{t("sections.address")}</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4 text-balance">
          <ApplicationAddressCard
            application={application}
            isEditing={isEditing}
            onDataChange={(data) => onSectionDataChange("address", data)}
            onValidationChange={(isValid) =>
              onSectionValidityChange("address", isValid)
            }
          />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="school">
        <AccordionTrigger>{t("sections.school")}</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4 text-balance">
          <ApplicationSchoolCard
            application={application}
            isEditing={isEditing}
            onDataChange={(data) => onSectionDataChange("school", data)}
            onValidationChange={(isValid) =>
              onSectionValidityChange("school", isValid)
            }
          />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="parents">
        <AccordionTrigger>{t("sections.parents")}</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4 text-balance">
          <ApplicationParentsCard
            application={application}
            isEditing={isEditing}
            onDataChange={(data) => onSectionDataChange("parents", data)}
            onValidationChange={(isValid) =>
              onSectionValidityChange("parents", isValid)
            }
          />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="general">
        <AccordionTrigger>{t("sections.general")}</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4 text-balance">
          <ApplicationGeneralCard
            application={application}
            isEditing={isEditing}
            onDataChange={(data) => onSectionDataChange("general", data)}
            onValidationChange={(isValid) =>
              onSectionValidityChange("general", isValid)
            }
          />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
