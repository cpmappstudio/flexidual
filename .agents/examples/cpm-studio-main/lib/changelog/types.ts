export type ChangelogStatus = "roadmap" | "shipped";

export type ChangelogGroupType = "new" | "updates" | "fixes";

export type ChangelogItem = {
  title: string;
};

export type ChangelogGroup = {
  type: ChangelogGroupType;
  title: string;
  items: ChangelogItem[];
};

export type ChangelogVersion = {
  version: string;
  title: string;
  description: string | null;
  status: ChangelogStatus;
  date: string | null;
  groups: ChangelogGroup[];
};
