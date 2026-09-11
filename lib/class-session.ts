export type ClassSessionType = "live" | "ignitia" | "abeka";

const EXTERNAL_CLASS_PLATFORMS = {
  ignitia: {
    name: "Ignitia",
    url: "https://centralpointefl.ignitiaschools.com/owsoo/login/auth",
  },
  abeka: {
    name: "Abeka",
    url: "https://login.abeka.com/abekab2c.onmicrosoft.com/b2c_1a_signin_legacy/oauth2/v2.0/authorize?client_id=39dfdf7d-fa0c-41dc-ae8f-a7f2ead1e645&response_type=id_token&scope=openid%20profile&state=OpenIdConnect.AuthenticationProperties%3DTmtO36sXdnSSdnF5m0ICSuO0TiIc6mkpqMBYNRvFoE8zqfGTp9mR1wLWNVXb-FznJRpV18nEgJh44lBGQ1L7HpfdPU57UCQ92L4AF9wxYSF52KxGZ9RFKs9tB5FETopSF_3i0I469pko6gDsKSSIGw&response_mode=form_post&nonce=639084289217533065.OTEyYzk1NjAtY2U1Mi00N2Y2LWE5OWItZWM3MTY2NDhhZmRmZDQ2NGI4ZTAtY2EzZC00NTMwLWI0ZjgtYmQyNGFhNTg5ZGE5&redirect_uri=https%3A%2F%2Fathome.abeka.com%2Flogin.aspx&x-client-SKU=ID_NET472&x-client-ver=6.29.0.0",
  },
} as const;

type ClassSessionState = {
  status?: "scheduled" | "active" | "completed" | "cancelled";
  isLive?: boolean;
  sessionType?: ClassSessionType;
};

export function isLiveClassSession(session: ClassSessionState) {
  return (
    !isExternalClassSession(session.sessionType) &&
    session.status === "active" &&
    session.isLive === true
  );
}

export function isUpcomingClassSession(
  session: ClassSessionState,
  end: number,
  now: number,
) {
  return (
    session.status !== "completed" &&
    session.status !== "cancelled" &&
    (end > now || isLiveClassSession(session))
  );
}

export function isExternalClassSession(
  sessionType: ClassSessionType | undefined,
) {
  return sessionType === "ignitia" || sessionType === "abeka";
}

export function getExternalClassPlatform(
  sessionType: ClassSessionType | undefined,
) {
  if (!sessionType || !isExternalClassSession(sessionType)) return null;

  return EXTERNAL_CLASS_PLATFORMS[sessionType];
}
