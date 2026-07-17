import { Navbar, NavbarSection, NavbarSpacer } from "@/components/ui/navbar";
import { NavbarItemSkeleton } from "./navbar-item-skeleton";

export function NavbarSkeleton() {
  return (
    <Navbar>
      <NavbarSpacer />
      <NavbarSection className="flex gap-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <NavbarItemSkeleton key={i} />
        ))}
      </NavbarSection>
    </Navbar>
  );
}
