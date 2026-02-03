import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const PAGE_BREAK = '\n<!-- GUIDENCO_PAGE_BREAK -->\n';

export function splitPages(html: string): string[] {
  if (!html) return [''];
  const parts = html.split(PAGE_BREAK);
  return parts.length > 0 ? parts : [''];
}
