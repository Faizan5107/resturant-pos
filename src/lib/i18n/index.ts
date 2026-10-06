import { en } from "./en";

/**
 * Basic translation helper for I18n strings.
 * Defaults to English dictionary.
 */
export function t(path: string): string {
  const keys = path.split(".");
  let current: any = en;

  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = current[key];
    } else {
      return path; // Fallback to key path if missing
    }
  }

  return typeof current === "string" ? current : path;
}

export { en };
