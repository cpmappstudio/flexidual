"use client";

import Image from "next/image";
import { Building2, MapPin } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAdminSchoolFilter } from "@/components/providers/admin-school-filter-provider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslations } from "next-intl";

interface FlexidualHeaderProps {
  title: string;
  subtitle: string;
  logoUrl?: string;
}

const FlexidualHeader = ({ title, subtitle, logoUrl }: FlexidualHeaderProps) => {
  const t = useTranslations("admin");
  const { selectedSchoolId, selectedCampusId, setSelectedCampusId, isAvailable } = useAdminSchoolFilter();

  const school = useQuery(
    api.schools.get,
    isAvailable && selectedSchoolId !== "all"
      ? { id: selectedSchoolId as Id<"schools"> }
      : "skip"
  );

  const campuses = useQuery(
    api.campuses.list,
    isAvailable && selectedSchoolId !== "all"
      ? { schoolId: selectedSchoolId as Id<"schools"> }
      : "skip"
  );

  const schoolSelected = isAvailable && selectedSchoolId !== "all";

  return (
    <header className="flex items-center justify-between gap-4 px-4 sm:px-6 md:border-b md:border-border pb-4">
      {/* Left: Logo + Title */}
      <div className="flex items-center gap-4">
        <div className="w-15 h-15 md:w-20 md:h-20 shrink-0 rounded-xl overflow-hidden relative mb-4">
          <Image
            src={logoUrl || "/flexidual-icon.png"}
            alt="Flexidual Logo"
            fill
            className="object-contain p-1.5"
          />
        </div>
        <div className="border-l border-border pl-6">
          <h1 className="font-bold text-2xl sm:text-3xl text-foreground">{title}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-2">{subtitle}</p>
          {isAvailable && (
            <div className="flex items-center gap-1.5 mt-2">
              <Badge variant="outline" className="text-xs font-normal gap-1.5 text-muted-foreground">
                <Building2 className="w-3 h-3" />
                {selectedSchoolId === "all" ? t("allSchools") : school?.name ?? "…"}
              </Badge>
            </div>
          )}
        </div>
      </div>

      {/* Right: Campus filter — only when a school is selected */}
      {schoolSelected && (
        <div className="shrink-0 mb-4">
          <Select
            value={selectedCampusId}
            onValueChange={setSelectedCampusId}
          >
            <SelectTrigger className="w-[200px]">
              <div className="flex items-center gap-2 truncate">
                <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="truncate">
                  <SelectValue placeholder={t("allCampuses")} />
                </span>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allCampuses")}</SelectItem>
              {campuses?.map((campus) => (
                <SelectItem key={campus._id} value={campus._id}>
                  {campus.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </header>
  );
};

export default FlexidualHeader;