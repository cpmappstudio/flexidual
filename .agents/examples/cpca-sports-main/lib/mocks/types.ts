// ################################################################################
// # File: lib\mocks\types.ts                                                     #
// # Check: 11/12/2025                                                            #
// ################################################################################

export type EventType = "goal" | "yellow_card" | "red_card" | "substitution";

export interface Player {
  id: number;
  name: string;
  number: number;
  position?: string; // e.g., 'GK', 'DF', 'MF', 'FW'
}

export interface Lineup {
  teamName: string;
  formation: string; // e.g., "4-3-3"
  starters: Player[];
  substitutes: Player[];
}

export interface MatchEvent {
  type: EventType;
  team: "team1" | "team2"; // Which team did the event
  minute: string;
  playerIn?: Player; // For substitutions
  playerOut?: Player; // For substitutions
  playerName?: string; // For goals, cards
  detail?: string;
}

export interface League {
  id: number;
  value: string;
  label: string;
  country: string;
  logoUrl?: string;
}

export interface PinnedLeague {
  id: number;
  name: string;
  flag: string;
}

export type MatchStatus = "Scheduled" | "Live" | "Postponed" | "FT" | string;

export interface Match {
  id: number;
  status: MatchStatus;
  league: League["value"];
  competition: string;
  kickoff: string;
  team1: string;
  team1Flag: string;
  team1Record?: string;
  team2: string;
  team2Flag: string;
  team2Record?: string;
  score1: number;
  score2: number;
  venue?: string;
  city?: string;
  country?: string;
  events?: MatchEvent[];
  lineups?: {
    team1: Lineup;
    team2: Lineup;
  };
  events1?: unknown; // Marked as unknown to catch errors
  events2?: unknown; // Marked as unknown to catch errors
}
