// ################################################################################
// # File: lib\mocks\data.ts                                                      #
// # Check: 11/11/2025                                                            #
// ################################################################################

import type { League, Match, PinnedLeague } from "./types";

export const matches: Match[] = [
  {
    id: 1,

    status: "FT",

    league: "world-cup-u17",

    competition: "FIFA Under-17 World Cup",

    kickoff: "2024-06-10T18:00:00.000Z",

    team1: "South Korea U17",

    team1Flag: "🇰🇷",

    team1Record: "(2-1-0)",

    team2: "Ivory Coast U17",

    team2Flag: "🇨🇮",

    team2Record: "(0-0-3)",

    score1: 3,

    score2: 1,

    venue: "Aspire Zone Pitch 8",

    city: "Ar-Rayyan",

    country: "Qatar",

    events1: [
      { type: "goal", name: "J Kim", minute: "26'" },

      { type: "goal", name: "H Jeong", minute: "48'" },

      { type: "goal", name: "Y Yi", minute: "87' Pen" },
    ],

    events2: [{ type: "goal", name: "A Toure", minute: "35'" }],
  },

  {
    id: 2,
    status: "FT",

    league: "world-cup-u17",

    competition: "FIFA Under-17 World Cup",

    kickoff: "2024-06-10T20:00:00.000Z",

    team1: "Switzerland U17",

    team1Flag: "🇨🇭",

    team1Record: "(2-1-0)",

    team2: "Mexico U17",

    team2Flag: "🇲🇽",

    team2Record: "(1-0-2)",

    score1: 3,

    score2: 1,

    venue: "Aspire Zone Pitch 3",

    city: "Ar-Rayyan",

    country: "Qatar",

    events1: [
      { type: "goal", name: "M Mijailovic", minute: "17'" },

      { type: "goal", name: "F Contreras", minute: "20' OG" },

      { type: "goal", name: "S. Iglesias", minute: "43'" },
    ],

    events2: [{ type: "goal", name: "A De Nigris", minute: "57'" }],
  },

  {
    id: 3,
    status: "Live",

    league: "world-cup-u17",

    competition: "FIFA Under-17 World Cup",

    kickoff: "2024-06-11T14:00:00.000Z",

    team1: "Colombia U17",

    team1Flag: "🇨🇴",

    team1Record: "(1-2-0)",

    team2: "North Korea U17",

    team2Flag: "🇰🇵",

    team2Record: "(1-1-1)",

    score1: 2,

    score2: 0,

    venue: "Aspire Complex",

    city: "Ar-Rayyan",

    country: "Qatar",

    events1: [
      { type: "goal", name: "M Solarte", minute: "25'" },

      { type: "goal", name: "S Londoño", minute: "33' Pen" },
    ],

    events2: [],
  },
  {
    id: 4,
    status: "FT",
    league: "la-liga",
    competition: "La Liga",
    kickoff: "2024-05-02T19:30:00.000Z",
    team1: "Celta Vigo",
    team1Flag: "🇪🇸",
    team2: "Barcelona",
    team2Flag: "🇪🇸",
    score1: 2,
    score2: 5,
    venue: "Balaídos",
    city: "Vigo",
    country: "Spain",
    events: [
      {
        type: "goal",
        team: "team2",
        minute: "10'",
        playerName: "R. Lewandowski",
        detail: "Pen",
      },
      {
        type: "goal",
        team: "team1",
        minute: "11'",
        playerName: "S. Carreira",
      },
      {
        type: "goal",
        team: "team2",
        minute: "37'",
        playerName: "R. Lewandowski",
      },
      { type: "goal", team: "team1", minute: "43'", playerName: "B. Iglesias" },
      {
        type: "goal",
        team: "team2",
        minute: "45+4'",
        playerName: "L. Yamal",
      },
      {
        type: "substitution",
        team: "team1",
        minute: "60'",
        playerIn: { id: 101, name: "C. Pérez", number: 7 },
        playerOut: { id: 102, name: "S. Carreira", number: 17 },
      },
      {
        type: "goal",
        team: "team2",
        minute: "73'",
        playerName: "R. Lewandowski",
      },
      {
        type: "yellow_card",
        team: "team2",
        minute: "85'",
        playerName: "F. de Jong",
      },
      {
        type: "red_card",
        team: "team2",
        minute: "90+4'",
        playerName: "F. de Jong",
      },
    ],
    lineups: {
      team1: {
        teamName: "Celta Vigo",
        formation: "4-4-2",
        starters: [
          // GK
          { id: 100, name: "V. Guaita", number: 1, position: "GK" },
          // DEF
          { id: 102, name: "S. Carreira", number: 17, position: "DF" },
          { id: 103, name: "C. Starfelt", number: 2, position: "DF" },
          { id: 104, name: "U. Núñez", number: 4, position: "DF" },
          { id: 105, name: "M. Ristić", number: 21, position: "DF" },
          // MID
          { id: 106, name: "F. Beltrán", number: 8, position: "MF" },
          { id: 107, name: "H. Sotelo", number: 30, position: "MF" },
          { id: 108, name: "J. Bamba", number: 14, position: "MF" },
          { id: 109, name: "L. de la Torre", number: 23, position: "MF" },
          // FWD
          { id: 110, name: "I. Aspas", number: 10, position: "FW" },
          { id: 111, name: "J. Strand Larsen", number: 18, position: "FW" },
        ],
        substitutes: [
          { id: 101, name: "C. Pérez", number: 7, position: "MF" },
          // ... more
        ],
      },
      team2: {
        teamName: "Barcelona",
        formation: "4-3-3",
        starters: [
          // GK
          { id: 200, name: "M. ter Stegen", number: 1, position: "GK" },
          // DEF
          { id: 201, name: "J. Koundé", number: 23, position: "DF" },
          { id: 202, name: "R. Araújo", number: 4, position: "DF" },
          { id: 203, name: "P. Cubarsí", number: 33, position: "DF" },
          { id: 204, name: "J. Cancelo", number: 2, position: "DF" },
          // MID
          { id: 205, name: "İ. Gündoğan", number: 22, position: "MF" },
          { id: 206, name: "A. Christensen", number: 15, position: "MF" },
          { id: 207, name: "F. de Jong", number: 21, position: "MF" },
          // FWD
          { id: 208, name: "L. Yamal", number: 27, position: "FW" },
          { id: 209, name: "R. Lewandowski", number: 9, position: "FW" },
          { id: 210, name: "Raphinha", number: 11, position: "FW" },
        ],
        substitutes: [
          // ... more
        ],
      },
    },
  },
];

export const leagues: League[] = [
  {
    id: 1,

    value: "premier-league",

    label: "Premier League",

    country: "England",
  },

  {
    id: 2,

    value: "la-liga",

    label: "La Liga",

    country: "Spain",
  },

  {
    id: 3,

    value: "bundesliga",

    label: "Bundesliga",

    country: "Germany",
  },

  {
    id: 4,

    value: "serie-a",

    label: "Serie A",

    country: "Italy",
  },

  {
    id: 5,

    value: "ligue-1",

    label: "Ligue 1",

    country: "France",
  },

  {
    id: 6,
    value: "world-cup-u17",
    label: "World Cup U17",
    country: "International",
  },
];

export const pinnedLeagues: PinnedLeague[] = [
  {
    id: 1,
    name: "Premier League",
    flag: "🏴󐁧󐁢󐁥󐁮󐁧󐁿",
  },
  {
    id: 2,
    name: "Ligue 1",
    flag: "🇫🇷",
  },
  {
    id: 3,
    name: "Bundesliga",
    flag: "🇩🇪",
  },
  {
    id: 4,
    name: "Serie A",
    flag: "🇮🇹",
  },
  {
    id: 5,
    name: "Eredivisie",
    flag: "🇳🇱",
  },
  {
    id: 6,
    name: "LaLiga",
    flag: "🇪🇸",
  },
  {
    id: 7,
    name: "Euro",
    flag: "🇪🇺",
  },
  {
    id: 8,
    name: "Champions League",
    flag: "🇪🇺",
  },
  {
    id: 9,
    name: "Europa League",
    flag: "🇪🇺",
  },
  {
    id: 10,
    name: "Conference League",
    flag: "🇪🇺",
  },
  {
    id: 11,
    name: "UEFA Nations Lea...",
    flag: "🇪🇺",
  },
  {
    id: 12,
    name: "Copa Libertadores",
    flag: "🇧🇷",
  },
  {
    id: 13,
    name: "World Cup",
    flag: "🌍",
  },
  {
    id: 14,
    name: "World Cup U17",
    flag: "🌍",
  },
];
