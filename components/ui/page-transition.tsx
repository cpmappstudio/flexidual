"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

export function PageTransition({
  children,
  className = "",
}: PageTransitionProps) {
  const pathname = usePathname();
  const [visiblePath, setVisiblePath] = useState<string | null>(null);
  const [previousPath, setPreviousPath] = useState(pathname);
  if (previousPath !== pathname) {
    setPreviousPath(pathname);
    setVisiblePath(null);
  }
  const isVisible = visiblePath === pathname;

  useEffect(() => {
    // Small delay to create smooth transition effect
    const timer = setTimeout(() => {
      setVisiblePath(pathname);
    }, 50);

    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <div
      className={`transition-all duration-300 ease-out ${
        isVisible ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}
