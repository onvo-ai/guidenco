import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const PAGE_BREAK = '\n<!-- PAGE_BREAK -->\n';

// Legacy separators from previous product names — still present in older stored HTML
const PAGE_BREAK_LEGACY_GUIDENCO = '\n<!-- GUIDENCO_PAGE_BREAK -->\n';
const PAGE_BREAK_LEGACY_ARTISTE = '\n<!-- ARTISTE_PAGE_BREAK -->\n';

export function splitPages(html: string): string[] {
  if (!html) return [''];
  // Normalise legacy separators so old documents both split correctly
  const normalised = html
    .split(PAGE_BREAK_LEGACY_GUIDENCO).join(PAGE_BREAK)
    .split(PAGE_BREAK_LEGACY_ARTISTE).join(PAGE_BREAK);
  const parts = normalised.split(PAGE_BREAK);
  return parts.length > 0 ? parts : [''];
}
