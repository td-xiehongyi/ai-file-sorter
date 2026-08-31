import { expect, it } from "vitest";

import { formatCompactDisplayPath, formatDisplayPath } from "./path-display";

it("removes the Windows extended prefix from drive paths for display", () => {
  expect(formatDisplayPath(String.raw`\\?\C:\Users\xie\Documents\Vault`)).toBe("C:\\Users\\xie\\Documents\\Vault");
});

it("converts extended UNC paths without changing ordinary paths", () => {
  expect(formatDisplayPath(String.raw`\\?\UNC\server\share\folder`)).toBe("\\\\server\\share\\folder");
  expect(formatDisplayPath("D:/Documents/Vault")).toBe("D:/Documents/Vault");
});

it("keeps the filename visible when compacting a long path", () => {
  const path = String.raw`C:\Users\xie\Documents\Obsidian Vault\Coding\Java\抽象类.md`;
  const compact = formatCompactDisplayPath(path, 32);

  expect(compact).toContain("抽象类.md");
  expect(compact).toContain("…");
  expect(compact.length).toBeLessThanOrEqual(32);
});

it("does not compact paths that fit the display budget", () => {
  expect(formatCompactDisplayPath("C:/Docs/notes.md", 32)).toBe("C:/Docs/notes.md");
});
