import { redirect } from "next/navigation";

export default async function CurriculumsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; orgSlug: string }>;
  searchParams: Promise<{ curriculumId?: string }>;
}) {
  const [{ locale, orgSlug }, { curriculumId }] = await Promise.all([
    params,
    searchParams,
  ]);
  const query = curriculumId
    ? `?curriculumId=${encodeURIComponent(curriculumId)}`
    : "";
  redirect(`/${locale}/${orgSlug}/settings/curriculums${query}`);
}
