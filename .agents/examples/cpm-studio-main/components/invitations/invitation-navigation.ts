"use client";

export function navigateToInvitationSuccess(
  router: { replace: (href: string) => void },
  href: string,
) {
  if (href.startsWith("http://") || href.startsWith("https://")) {
    window.location.assign(href);
    return;
  }

  router.replace(href);
}
