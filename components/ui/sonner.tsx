"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const [fullscreenContainer, setFullscreenContainer] =
    useState<Element | null>(null);

  useEffect(() => {
    const updateContainer = () => {
      setFullscreenContainer(document.fullscreenElement);
    };

    updateContainer();
    document.addEventListener("fullscreenchange", updateContainer);
    return () => {
      document.removeEventListener("fullscreenchange", updateContainer);
    };
  }, []);

  const toaster = (
    <Sonner
      theme="light"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          description: "!text-foreground/80",
        },
      }}
      {...props}
    />
  );

  return fullscreenContainer
    ? createPortal(toaster, fullscreenContainer)
    : toaster;
};

export { Toaster };
