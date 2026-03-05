import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getFieldFromPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;

  // Convert [0] to .0
  const normalizedPath = path.replace(/\[(\d+)\]/g, ".$1");
  const keys = normalizedPath.split(".");

  let current = obj;
  for (const key of keys) {
    if (!key) continue; // Skip empty keys from leading dot e.g. .0
    if (current === undefined || current === null) return undefined;
    current = current[key];
  }
  return current;
}

export function evaluateTemplate(template: any, data: any): any {
  if (typeof template !== "string") return template;

  // Check if the entire string is just one template variable
  const singleVarMatch = template.match(/^{(.+?)}$/);
  if (singleVarMatch) {
    return getFieldFromPath(data, singleVarMatch[1].trim());
  }

  // Otherwise, do string replacement
  return template.replace(/{([^}]+)}/g, (match, path) => {
    const val = getFieldFromPath(data, path.trim());
    return val !== undefined && val !== null ? String(val) : match;
  });
}

/**
 * Detects if the application is currently running inside the Tauri window.
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;
}
