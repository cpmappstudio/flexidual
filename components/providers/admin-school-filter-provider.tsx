"use client";

import * as React from "react";

const SCHOOL_KEY = "admin-selected-school";
const CAMPUS_KEY = "admin-selected-campus";

interface AdminSchoolFilterContextType {
  selectedSchoolId: string;
  setSelectedSchoolId: (id: string) => void;
  selectedCampusId: string;
  setSelectedCampusId: (id: string) => void;
}

const AdminSchoolFilterContext = React.createContext<AdminSchoolFilterContextType | null>(null);

export function AdminSchoolFilterProvider({ children }: { children: React.ReactNode }) {
  const [selectedSchoolId, setSelectedSchoolIdState] = React.useState<string>("all");
  const [selectedCampusId, setSelectedCampusIdState] = React.useState<string>("all");

  React.useEffect(() => {
    const school = localStorage.getItem(SCHOOL_KEY);
    const campus = localStorage.getItem(CAMPUS_KEY);
    if (school) setSelectedSchoolIdState(school);
    if (campus) setSelectedCampusIdState(campus);
  }, []);

  const setSelectedSchoolId = React.useCallback((id: string) => {
    setSelectedSchoolIdState(id);
    localStorage.setItem(SCHOOL_KEY, id);
    // Reset campus whenever school changes
    setSelectedCampusIdState("all");
    localStorage.setItem(CAMPUS_KEY, "all");
  }, []);

  const setSelectedCampusId = React.useCallback((id: string) => {
    setSelectedCampusIdState(id);
    localStorage.setItem(CAMPUS_KEY, id);
  }, []);

  return (
    <AdminSchoolFilterContext.Provider value={{ selectedSchoolId, setSelectedSchoolId, selectedCampusId, setSelectedCampusId }}>
      {children}
    </AdminSchoolFilterContext.Provider>
  );
}

export function useAdminSchoolFilter() {
  const ctx = React.useContext(AdminSchoolFilterContext);
  if (!ctx) return {
    selectedSchoolId: "all", setSelectedSchoolId: () => {},
    selectedCampusId: "all", setSelectedCampusId: () => {},
    isAvailable: false,
  };
  return { ...ctx, isAvailable: true };
}