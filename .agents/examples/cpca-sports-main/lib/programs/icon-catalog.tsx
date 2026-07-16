import type { ComponentType } from "react";
import { Shapes } from "lucide-react";
import { CiBaseball, CiBasketball } from "react-icons/ci";
import { GiAmericanFootballHelmet, GiSoccerBall, GiTennisRacket } from "react-icons/gi";
import { IoGolfOutline } from "react-icons/io5";
import { MdDirectionsRun, MdPool } from "react-icons/md";
import { PiBaseball, PiVolleyball } from "react-icons/pi";
import {
  DEFAULT_PROGRAM_ICON_KEY,
  type ProgramIconKey,
} from "./icon-keys";

export interface ProgramIconOption {
  key: ProgramIconKey;
  labelKey: string;
  Icon: ComponentType<{ className?: string }>;
}

export const PROGRAM_ICON_OPTIONS: ProgramIconOption[] = [
  { key: "generic", labelKey: "generic", Icon: Shapes },
  { key: "baseball", labelKey: "baseball", Icon: CiBaseball },
  { key: "basketball", labelKey: "basketball", Icon: CiBasketball },
  { key: "soccer", labelKey: "soccer", Icon: GiSoccerBall },
  { key: "volleyball", labelKey: "volleyball", Icon: PiVolleyball },
  { key: "hr14_baseball", labelKey: "hr14Baseball", Icon: PiBaseball },
  { key: "golf", labelKey: "golf", Icon: IoGolfOutline },
  { key: "tennis", labelKey: "tennis", Icon: GiTennisRacket },
  { key: "softball", labelKey: "softball", Icon: CiBaseball },
  {
    key: "volleyball-club",
    labelKey: "volleyballClub",
    Icon: PiVolleyball,
  },
  { key: "pg-basketball", labelKey: "postgradBasketball", Icon: CiBasketball },
  { key: "football", labelKey: "football", Icon: GiAmericanFootballHelmet },
  { key: "swimming", labelKey: "swimming", Icon: MdPool },
  { key: "track", labelKey: "track", Icon: MdDirectionsRun },
];

export function getProgramIconOption(
  iconKey?: string | null,
): ProgramIconOption {
  return (
    PROGRAM_ICON_OPTIONS.find((option) => option.key === iconKey) ??
    PROGRAM_ICON_OPTIONS.find((option) => option.key === DEFAULT_PROGRAM_ICON_KEY)!
  );
}

export function getProgramIcon(iconKey?: string | null) {
  return getProgramIconOption(iconKey).Icon;
}
