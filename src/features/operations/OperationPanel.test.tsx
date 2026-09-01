import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { OperationPanel } from "./OperationPanel";
import type { SearchEntry } from "../../types/search";

const entries: SearchEntry[] = [
  { id: 1, normalized_path: "C:/Docs/one.txt", name: "one.txt", extension: "txt", kind: "file", size: 1, modified_ms: 1 },
  { id: 2, normalized_path: "C:/Docs/two.txt", name: "two.txt", extension: "txt", kind: "file", size: 1, modified_ms: 1 },
];

it("builds a batch move draft from selected files", () => {
  const onPreview = vi.fn();
  render(<OperationPanel rootPath="C:/Docs" selectedEntries={entries} onPreview={onPreview} busy={false} />);

  fireEvent.change(screen.getByLabelText("移动到目录"), { target: { value: "C:/Docs/archive" } });
  fireEvent.click(screen.getByRole("button", { name: "生成预览" }));

  expect(onPreview).toHaveBeenCalledWith({
    root_path: "C:/Docs",
    items: [
      { operation: "move", source_path: "C:/Docs/one.txt", destination_directory: "C:/Docs/archive" },
      { operation: "move", source_path: "C:/Docs/two.txt", destination_directory: "C:/Docs/archive" },
    ],
  });
});

it("builds individual rename items for multiple files while preserving extensions", () => {
  const onPreview = vi.fn();
  render(<OperationPanel rootPath="C:/Docs" selectedEntries={entries} onPreview={onPreview} busy={false} />);

  fireEvent.click(screen.getByRole("button", { name: "批量重命名" }));
  fireEvent.change(screen.getByLabelText("新文件名 one.txt"), { target: { value: "项目报告" } });
  fireEvent.change(screen.getByLabelText("新文件名 two.txt"), { target: { value: "会议记录" } });
  fireEvent.click(screen.getByRole("button", { name: "生成预览" }));

  expect(onPreview).toHaveBeenCalledWith({
    root_path: "C:/Docs",
    items: [
      { operation: "rename", source_path: "C:/Docs/one.txt", new_name: "项目报告.txt" },
      { operation: "rename", source_path: "C:/Docs/two.txt", new_name: "会议记录.txt" },
    ],
  });
});

it("skips files whose locked-extension names remain unchanged", () => {
  const onPreview = vi.fn();
  render(<OperationPanel rootPath="C:/Docs" selectedEntries={entries} onPreview={onPreview} busy={false} />);

  fireEvent.click(screen.getByRole("button", { name: "批量重命名" }));
  fireEvent.change(screen.getByLabelText("新文件名 one.txt"), { target: { value: "renamed" } });
  fireEvent.click(screen.getByRole("button", { name: "生成预览" }));

  expect(onPreview).toHaveBeenCalledWith({
    root_path: "C:/Docs",
    items: [{ operation: "rename", source_path: "C:/Docs/one.txt", new_name: "renamed.txt" }],
  });
});
