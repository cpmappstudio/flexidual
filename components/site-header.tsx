"use client"

import { AccountMenu } from "@/components/account-menu"
import { FlexidualLogo } from "@/components/ui/flexidual-logo"
import { useSidebar } from "@/components/ui/sidebar"

export function SiteHeader() {
  const { isMobile, setOpenMobile } = useSidebar()

  return (
    <header className="sticky top-0 z-50 flex h-(--header-height) w-full shrink-0 items-center border-b border-primary bg-primary">
      <div className="flex w-full min-w-0 items-center px-3 sm:px-5">
        <button
          type="button"
          disabled={!isMobile}
          aria-label="Open navigation"
          onClick={() => setOpenMobile(true)}
          className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-left disabled:cursor-default"
        >
          <FlexidualLogo
            inverted
            priority
            className="h-10 shrink-0 sm:h-12"
          />
        </button>
        <div className="ml-auto flex size-10 shrink-0 items-center justify-center rounded-full bg-sidebar ring-1 ring-sidebar-border">
          <AccountMenu className="hover:bg-sidebar-accent" />
        </div>
      </div>
    </header>
  )
}
