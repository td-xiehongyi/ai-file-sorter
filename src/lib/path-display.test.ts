import { expect, it } from "vitest";

import { formatDisplayPath } from "./path-display";

it("removes the Windows extended prefix from drive paths for display", () => {
  expect(formatDisplayPath(String.raw`\\?\C:\Users\xie\Documents\Vault`)).toBe("C:\\Users\\xie\\Documents\\Vault");
});

it("converts extended UNC paths without changing ordinary paths", () => {
  expect(formatDisplayPath(String.raw`\\?\UNC\server\share\folder`)).toBe("\\\\server\\share\\folder");
  expect(formatDisplayPath("D:/Documents/Vault")).toBe("D:/Documents/Vault");
});
