// ################################################################################
// # Check: 12/14/2025                                                            #
// ################################################################################

import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
