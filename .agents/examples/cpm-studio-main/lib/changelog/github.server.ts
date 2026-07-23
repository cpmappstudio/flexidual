import "server-only";

import type {
  ChangelogGroup,
  ChangelogGroupType,
  ChangelogItem,
  ChangelogStatus,
  ChangelogVersion,
} from "@/lib/changelog/types";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const DEFAULT_REPOSITORY = "cpmappstudio/cpm-studio";
const GITHUB_REQUEST_REVALIDATE_SECONDS = 60 * 60;

const CHANGELOG_GROUPS = [
  {
    type: "new",
    title: "New",
    issueType: "feature",
  },
  {
    type: "updates",
    title: "Updates",
    issueType: "task",
  },
  {
    type: "fixes",
    title: "Bug Fixes",
    issueType: "bug",
  },
] as const satisfies Array<{
  type: ChangelogGroupType;
  title: string;
  issueType: string;
}>;

type GitHubMilestone = {
  number: number;
  title: string;
  description: string | null;
  state: "open" | "closed";
  due_on: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

type GitHubIssueType =
  | string
  | {
      name?: string | null;
    }
  | undefined
  | null;

type GitHubIssue = {
  title: string;
  pull_request?: unknown;
  type?: GitHubIssueType;
};

type GitHubErrorResponse = {
  message?: string;
};

type GitHubRepository = {
  owner: string;
  repo: string;
};

function getRepository() {
  const repository =
    process.env.GITHUB_CHANGELOG_REPOSITORY?.trim() || DEFAULT_REPOSITORY;
  const parts = repository.split("/");

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      "GITHUB_CHANGELOG_REPOSITORY must use the owner/repo format.",
    );
  }

  return { owner: parts[0], repo: parts[1] } satisfies GitHubRepository;
}

function getGitHubHeaders() {
  const token =
    process.env.GITHUB_CHANGELOG_TOKEN || process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "cpm-studio-changelog",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function createGitHubUrl(path: string, params?: Record<string, string>) {
  const url = new URL(path, GITHUB_API_BASE_URL);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  return url;
}

function getNextPageUrl(linkHeader: string | null) {
  if (!linkHeader) {
    return null;
  }

  for (const link of linkHeader.split(",")) {
    const match = link.match(/<([^>]+)>;\s*rel="next"/);
    if (match?.[1]) {
      return new URL(match[1]);
    }
  }

  return null;
}

async function githubRequest<T>(
  pathOrUrl: string | URL,
  params?: Record<string, string>,
): Promise<{ data: T; nextUrl: URL | null }> {
  const url =
    typeof pathOrUrl === "string" && pathOrUrl.startsWith("/")
      ? createGitHubUrl(pathOrUrl, params)
      : new URL(pathOrUrl);
  const response = await fetch(url, {
    headers: getGitHubHeaders(),
    next: { revalidate: GITHUB_REQUEST_REVALIDATE_SECONDS },
  });

  if (!response.ok) {
    let message = `GitHub REST API request failed with ${response.status}.`;

    try {
      const body = (await response.json()) as GitHubErrorResponse;
      if (body.message) {
        message = body.message;
      }
    } catch {
      // The status code is enough when GitHub does not return JSON.
    }

    throw new Error(message);
  }

  return {
    data: (await response.json()) as T,
    nextUrl: getNextPageUrl(response.headers.get("link")),
  };
}

async function githubPaginatedRequest<T>(
  path: string,
  params: Record<string, string>,
) {
  const items: T[] = [];
  let nextUrl: URL | null = createGitHubUrl(path, params);

  while (nextUrl) {
    const response: { data: T[]; nextUrl: URL | null } =
      await githubRequest<T[]>(nextUrl);

    items.push(...response.data);
    nextUrl = response.nextUrl;
  }

  return items;
}

function parseMilestoneTitle(title: string) {
  const [version, ...titleParts] = title.split(" - ");
  const releaseTitle = titleParts.join(" - ").trim();

  return {
    version: version.trim(),
    title: releaseTitle || title.trim(),
  };
}

function normalizeIssueType(type: GitHubIssueType) {
  if (!type) {
    return null;
  }

  return (typeof type === "string" ? type : type.name)?.trim().toLowerCase();
}

function createEmptyGroups(): ChangelogGroup[] {
  return CHANGELOG_GROUPS.map(({ type, title }) => ({
    type,
    title,
    items: [],
  }));
}

function groupIssues(issues: GitHubIssue[]) {
  const groups = createEmptyGroups();
  const issueTypeToGroup = new Map<string, ChangelogGroupType>(
    CHANGELOG_GROUPS.map((group) => [group.issueType, group.type]),
  );
  const groupByType = new Map(groups.map((group) => [group.type, group]));

  for (const issue of issues) {
    if (issue.pull_request) {
      continue;
    }

    const issueType = normalizeIssueType(issue.type);
    if (!issueType) {
      continue;
    }

    const groupType = issueTypeToGroup.get(issueType);
    if (!groupType) {
      continue;
    }

    const group = groupByType.get(groupType);
    const item: ChangelogItem = {
      title: issue.title,
    };

    group?.items.push(item);
  }

  return groups;
}

function getMilestoneStatus(state: GitHubMilestone["state"]): ChangelogStatus {
  return state === "open" ? "roadmap" : "shipped";
}

function getMilestoneDate(milestone: GitHubMilestone) {
  return milestone.due_on || milestone.closed_at;
}

function getMilestoneSortValue(milestone: GitHubMilestone) {
  return Date.parse(
    getMilestoneDate(milestone) ||
      milestone.due_on ||
      milestone.updated_at ||
      milestone.created_at,
  );
}

async function getMilestoneIssues(
  repository: GitHubRepository,
  milestoneNumber: number,
) {
  return githubPaginatedRequest<GitHubIssue>(
    `/repos/${repository.owner}/${repository.repo}/issues`,
    {
      state: "all",
      milestone: String(milestoneNumber),
      per_page: "100",
    },
  );
}

export async function getGitHubChangelogVersions(): Promise<
  ChangelogVersion[]
> {
  try {
    const repository = getRepository();
    const milestones = await githubPaginatedRequest<GitHubMilestone>(
      `/repos/${repository.owner}/${repository.repo}/milestones`,
      {
        state: "all",
        sort: "due_on",
        direction: "desc",
        per_page: "100",
      },
    );

    const sortedMilestones = milestones.toSorted(
      (first, second) =>
        getMilestoneSortValue(second) - getMilestoneSortValue(first),
    );
    const versions: ChangelogVersion[] = [];

    for (const milestone of sortedMilestones) {
      const issues = await getMilestoneIssues(repository, milestone.number);
      const title = parseMilestoneTitle(milestone.title);

      versions.push({
        ...title,
        description: milestone.description?.trim() || null,
        status: getMilestoneStatus(milestone.state),
        date: getMilestoneDate(milestone),
        groups: groupIssues(issues),
      });
    }

    return versions;
  } catch (error) {
    console.error("Failed to load GitHub changelog milestones.", error);
    return [];
  }
}
