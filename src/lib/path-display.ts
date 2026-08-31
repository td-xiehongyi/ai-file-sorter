const EXTENDED_UNC_PREFIX = "\\\\?\\UNC\\";
const EXTENDED_PATH_PREFIX = "\\\\?\\";

/** Formats a canonical Windows path for user-facing text without changing the raw path. */
export function formatDisplayPath(path: string): string {
  if (path.length === 0) return path;
  if (path.slice(0, EXTENDED_UNC_PREFIX.length).toUpperCase() === EXTENDED_UNC_PREFIX) {
    return `\\\\${path.slice(EXTENDED_UNC_PREFIX.length)}`;
  }
  if (path.slice(0, EXTENDED_PATH_PREFIX.length) === EXTENDED_PATH_PREFIX) {
    return path.slice(EXTENDED_PATH_PREFIX.length);
  }
  return path;
}
