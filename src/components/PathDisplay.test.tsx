import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { PathDisplay } from "./PathDisplay";

it("keeps a long path readable and exposes the complete path to assistive users", () => {
  const path = String.raw`C:\Users\xie\Documents\Obsidian Vault\Coding\Java\非常长的示例目录\抽象类.md`;
  render(<PathDisplay path={path} />);

  expect(screen.getByText(/抽象类\.md/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: `复制完整路径：${path}` })).toBeInTheDocument();
  expect(screen.getByTitle(path)).toBeInTheDocument();
});
