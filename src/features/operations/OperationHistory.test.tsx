import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { OperationHistory } from "./OperationHistory";
import type { OperationHistoryItem } from "../../types/operations";

const item: OperationHistoryItem = {
  id: 1,
  batchId: "batch-1",
  action: "execute",
  operation: "move",
  sourcePath: "C:/Docs/source.txt",
  targetPath: "C:/Docs/archive/source.txt",
  status: "succeeded",
  reason: null,
  createdAt: "100",
  undoStatus: "available",
  undoReason: null,
  isDeleted: false,
};

it("uses one fixed more-actions trigger and exposes state-specific actions in its menu", () => {
  const onUndo = vi.fn();
  const onDelete = vi.fn();
  render(<OperationHistory items={[item]} onUndo={onUndo} onDelete={onDelete} onRestore={vi.fn()} onPurge={vi.fn()} includeDeleted={false} onToggleDeleted={vi.fn()} busy={false} />);

  expect(screen.getByRole("region", { name: "操作历史" })).toHaveClass("operation-history-view");
  expect(screen.getByText(/C:\/Docs\/archive\/source\.txt/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "撤销" }));
  expect(onUndo).toHaveBeenCalledWith(1);
  fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "删除记录" }));
  expect(onDelete).toHaveBeenCalledWith(1);
});

it("offers restore and permanent delete for archived records", () => {
  const archived = { ...item, isDeleted: true, undoStatus: "undone" as const };
  const onRestore = vi.fn();
  const onPurge = vi.fn();
  render(<OperationHistory items={[archived]} onUndo={vi.fn()} onDelete={vi.fn()} onRestore={onRestore} onPurge={onPurge} includeDeleted={true} onToggleDeleted={vi.fn()} busy={false} />);

  fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "恢复记录" }));
  fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "永久删除" }));
  expect(onRestore).toHaveBeenCalledWith(1);
  expect(onPurge).toHaveBeenCalledWith(1);
});

it("keeps one fixed action trigger aligned across different history states", () => {
  const undone = { ...item, id: 2, undoStatus: "undone" as const };
  const { container } = render(<OperationHistory items={[item, undone]} onUndo={vi.fn()} onDelete={vi.fn()} onRestore={vi.fn()} onPurge={vi.fn()} includeDeleted={false} onToggleDeleted={vi.fn()} busy={false} />);

  expect(container.querySelectorAll(".operation-history-menu")).toHaveLength(2);
  expect(screen.getAllByRole("button", { name: "更多操作" })).toHaveLength(2);
});

it("uses a two-column history layout with a dedicated right action area", () => {
  const { container } = render(<OperationHistory items={[item]} onUndo={vi.fn()} onDelete={vi.fn()} onRestore={vi.fn()} onPurge={vi.fn()} includeDeleted={false} onToggleDeleted={vi.fn()} busy={false} />);
  const row = container.querySelector(".operation-history-row");

  expect(row?.querySelector(".operation-history-summary")).toBeInTheDocument();
  expect(row?.querySelector(".operation-history-actions")).toHaveClass("operation-history-actions");
  expect(row?.querySelector(".operation-history-paths")?.parentElement).toBe(row);
});
