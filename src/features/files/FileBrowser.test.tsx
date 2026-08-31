import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FileBrowser } from "./FileBrowser";

function state(overrides: Record<string, unknown> = {}) {
  return {
    queryText: "",
    setQueryText: vi.fn(),
    filters: { extension: "", minSize: "", maxSize: "", modifiedAfter: "", modifiedBefore: "" },
    updateFilters: vi.fn(),
    sortBy: "modified" as const,
    sortDirection: "desc" as const,
    updateSort: vi.fn(),
    page: 1,
    setPage: vi.fn(),
    result: { entries: [{ id: 1, normalized_path: "C:/Docs/报告.pdf", name: "报告.pdf", extension: "pdf", kind: "file", size: 2048, modified_ms: 1_700_000_000_000 }], total: 1, page: 1, page_size: 50, total_pages: 1 },
    loading: false,
    error: null,
    reload: vi.fn(),
    ...overrides,
  };
}

describe("FileBrowser", () => {
  it("renders indexed files and search controls", () => {
    render(<FileBrowser state={state()} changeNotice={false} watcherError={null} />);
    expect(screen.getByRole("heading", { name: "索引文件" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveClass("file-table");
    expect(screen.getByText("报告.pdf")).toBeInTheDocument();
    expect(screen.getByLabelText("搜索名称或路径")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "选择 报告.pdf" })).toBeInTheDocument();
    expect(screen.getByTitle("C:/Docs/报告.pdf")).toBeInTheDocument();
  });

  it("shows a readable path when Rust returns an extended Windows path", () => {
    render(<FileBrowser state={state({ result: { entries: [{ id: 1, normalized_path: String.raw`\\?\C:\Docs\报告.pdf`, name: "报告.pdf", extension: "pdf", kind: "file", size: 2048, modified_ms: 1_700_000_000_000 }], total: 1, page: 1, page_size: 50, total_pages: 1 } })} changeNotice={false} watcherError={null} />);
    expect(screen.getByTitle("C:\\Docs\\报告.pdf")).toBeInTheDocument();
    expect(screen.queryByText(String.raw`\\?\C:\Docs\报告.pdf`)).not.toBeInTheDocument();
  });

  it("notifies the user when index events refreshed the results", () => {
    render(<FileBrowser state={state()} changeNotice={true} watcherError={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("磁盘变化已同步");
  });

  it("marks selected rows without changing the browser controls", () => {
    render(<FileBrowser state={state()} changeNotice={false} watcherError={null} selectedPaths={new Set(["C:/Docs/报告.pdf"])} />);
    expect(screen.getByRole("row", { name: /报告\.pdf/ })).toHaveClass("is-selected");
    expect(screen.getByRole("checkbox", { name: "选择 报告.pdf" })).toBeChecked();
  });

  it("shows empty results and keeps later operation actions absent", async () => {
    render(<FileBrowser state={state({ result: { entries: [], total: 0, page: 1, page_size: 50, total_pages: 0 } })} changeNotice={false} watcherError={null} />);
    await waitFor(() => expect(screen.getByText("没有匹配的文件")).toBeInTheDocument());
    for (const action of ["移动", "重命名", "删除", "撤销", "AI 执行"]) {
      expect(screen.queryByRole("button", { name: action })).not.toBeInTheDocument();
    }
    fireEvent.change(screen.getByLabelText("搜索名称或路径"), { target: { value: "报告" } });
  });
});
