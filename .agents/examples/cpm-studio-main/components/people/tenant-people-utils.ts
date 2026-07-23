export const PEOPLE_PAGE_SIZE = 25;

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getSearchTerms(searchQuery: string) {
  return normalizeSearchText(searchQuery).trim().split(/\s+/).filter(Boolean);
}

function matchesSearchTerms(
  fields: Array<string | null | undefined>,
  terms: string[],
) {
  if (terms.length === 0) {
    return true;
  }

  const searchableText = normalizeSearchText(fields.filter(Boolean).join(" "));

  return terms.every((term) => searchableText.includes(term));
}

export function filterOrganizationPeopleBySearchQuery<
  TPerson extends {
    person: {
      firstName?: string;
      lastName?: string;
      displayName?: string;
      name: string;
    };
    account?:
      | {
          kind: "self";
          email?: string | null;
        }
      | {
          kind: "guardian";
          email?: string | null;
          guardianName?: string;
        }
      | {
          kind: "none";
        };
    primaryCampus?: {
      name: string;
      slug?: string;
    } | null;
  },
>(people: TPerson[], searchQuery: string) {
  const searchTerms = getSearchTerms(searchQuery);

  if (searchTerms.length === 0) {
    return people;
  }

  return people.filter((person) => {
    const accountEmail =
      person.account && person.account.kind !== "none"
        ? person.account.email
        : undefined;
    const guardianName =
      person.account?.kind === "guardian"
        ? person.account.guardianName
        : undefined;
    return matchesSearchTerms(
      [
        person.person.name,
        person.person.displayName,
        person.person.firstName,
        person.person.lastName,
        accountEmail,
        guardianName,
        person.primaryCampus?.name,
        person.primaryCampus?.slug,
      ],
      searchTerms,
    );
  });
}

export function filterCampusAssignmentsBySearchQuery<
  TAssignment extends {
    campus: {
      name: string;
      slug?: string;
    };
    student?: {
      displayName?: string;
      firstName?: string;
      lastName?: string;
      name: string;
    };
  },
>(assignments: TAssignment[], searchQuery: string) {
  const searchTerms = getSearchTerms(searchQuery);

  if (searchTerms.length === 0) {
    return assignments;
  }

  return assignments.filter(({ campus, student }) => {
    return matchesSearchTerms(
      [
        campus.name,
        campus.slug,
        student?.name,
        student?.displayName,
        student?.firstName,
        student?.lastName,
      ],
      searchTerms,
    );
  });
}

export function getLoadedCountLabel(count: number, status: string) {
  if (status === "LoadingFirstPage") {
    return "…";
  }

  if (count === 0 || status === "Exhausted") {
    return `${count}`;
  }

  return `${count}+`;
}
