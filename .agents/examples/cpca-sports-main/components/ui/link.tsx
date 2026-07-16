/**
 * Catalyst-compatible Link component using next-intl for i18n routing.
 *
 * https://catalyst.tailwindui.com/docs#client-side-router-integration
 */

import * as Headless from "@headlessui/react";
import { Link as NextIntlLink } from "@/i18n/navigation";
import React, { forwardRef } from "react";
import type { ComponentProps } from "react";

export const Link = forwardRef(function Link(
  props: ComponentProps<typeof NextIntlLink>,
  ref: React.ForwardedRef<HTMLAnchorElement>,
) {
  return (
    <Headless.DataInteractive>
      <NextIntlLink {...props} ref={ref} />
    </Headless.DataInteractive>
  );
});
