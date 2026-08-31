import { useState } from "react";

import { formatCompactDisplayPath, formatDisplayPath } from "../lib/path-display";

export function PathDisplay({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const displayPath = formatDisplayPath(path);
  const compactPath = formatCompactDisplayPath(displayPath);

  async function copyPath() {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(displayPath);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <span className="path-display" title={displayPath}>
      <span className="path-display-value">{compactPath}</span>
      <button type="button" className="path-copy-button" onClick={() => void copyPath()} aria-label={`复制完整路径：${displayPath}`}>复制</button>
      {copied && <span className="path-copy-status" role="status">已复制</span>}
    </span>
  );
}
