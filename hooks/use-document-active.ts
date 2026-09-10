"use client";

import { useEffect, useState } from "react";

export function useDocumentActive() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const update = () =>
      setActive(document.visibilityState === "visible" && document.hasFocus());
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
    };
  }, []);
  return active;
}
