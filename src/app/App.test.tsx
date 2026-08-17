import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("presents the product and its current engineering status", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { level: 1, name: "AI File Organizer" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Local First")).toBeInTheDocument();
    expect(screen.getByText("阶段一已完成")).toBeInTheDocument();
  });

  it("states that AI suggestions cannot bypass user confirmation", () => {
    render(<App />);

    expect(
      screen.getByText("AI 只提供建议，最终操作由用户确认。"),
    ).toBeInTheDocument();
  });

  it("does not expose unavailable file operation actions", () => {
    render(<App />);

    for (const action of ["扫描", "移动", "重命名", "删除", "AI 执行"]) {
      expect(screen.queryByRole("button", { name: action })).not.toBeInTheDocument();
    }
  });
});
