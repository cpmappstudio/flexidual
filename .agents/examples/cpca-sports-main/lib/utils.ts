import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind class names, resolving any conflicts.
 *
 * @param inputs - An array of class names to merge.
 * @returns A string of merged and optimized class names.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Darkens a hex color by a given amount.
 *
 * @param hex - The hex color string (e.g., "#1E3A8A" or "1E3A8A").
 * @param amount - A value between 0 and 1 representing how much to darken (0.3 = 30% darker).
 * @returns The darkened hex color string.
 */
export function darkenHex(hex: string, amount: number): string {
  hex = hex.replace(/^#/, "");

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  const darkenedR = Math.max(0, Math.round(r * (1 - amount)));
  const darkenedG = Math.max(0, Math.round(g * (1 - amount)));
  const darkenedB = Math.max(0, Math.round(b * (1 - amount)));

  const toHex = (n: number) => n.toString(16).padStart(2, "0");

  return `#${toHex(darkenedR)}${toHex(darkenedG)}${toHex(darkenedB)}`;
}
