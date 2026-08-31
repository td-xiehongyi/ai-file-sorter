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

/** Keeps the path root and filename visible while compacting long display text. */
export function formatCompactDisplayPath(path: string, maxLength = 72): string {
  const displayPath = formatDisplayPath(path);
  if (displayPath.length <= maxLength) return displayPath;

  const separator = displayPath.includes("\\") ? "\\" : "/";
  const segments = displayPath.split(/[\\/]+/).filter(Boolean);
  if (segments.length === 0) return displayPath.slice(0, maxLength);

  let root = "";
  if (/^[A-Za-z]:$/.test(segments[0])) {
    root = `${segments.shift()}${separator}`;
  } else if (displayPath.startsWith("\\\\")) {
    root = `${separator}${separator}${segments.shift() ?? ""}${separator}${segments.shift() ?? ""}${separator}`;
  } else if (displayPath.startsWith(separator)) {
    root = separator;
    segments.shift();
  }

  const filename = segments.at(-1) ?? displayPath;
  const tail = segments.slice(-2).join(separator);
  const compact = `${root}…${separator}${tail}`;
  if (compact.length <= maxLength) return compact;

  const filenameOnly = `${root}…${separator}${filename}`;
  if (filenameOnly.length <= maxLength) return filenameOnly;

  const suffixLength = Math.max(1, maxLength - root.length - 2);
  return `${root}…${separator}${filename.slice(-suffixLength)}`.slice(0, maxLength);
}
