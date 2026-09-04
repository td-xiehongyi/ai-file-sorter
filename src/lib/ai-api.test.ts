import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import {
  getAiProviderConfig,
  renameAiCategoryTemplate,
  saveAiProviderConfig,
  setGlobalAiCategoryTemplate,
  startAnalysisBatch,
  testAiProviderConnection,
} from "./ai-api";
import type { AnalysisCategorySource } from "../types/ai";

describe("AI API template and analysis calls", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
  });

  it("renames a non-global template through the narrow command", async () => {
    await renameAiCategoryTemplate("work-template", "工作资料");

    expect(invoke).toHaveBeenCalledWith("rename_ai_category_template", {
      templateId: "work-template",
      name: "工作资料",
    });
  });

  it("sets the selected template as the global default", async () => {
    await setGlobalAiCategoryTemplate("work-template");

    expect(invoke).toHaveBeenCalledWith("set_global_ai_category_template", {
      templateId: "work-template",
    });
  });

  it("passes the selected category source and version with an analysis request", async () => {
    const categorySource: AnalysisCategorySource = {
      kind: "template",
      template_id: "work-template",
      expected_version: 3,
    };

    await startAnalysisBatch({
      root_path: "C:/Docs",
      file_paths: ["C:/Docs/notes.md"],
      model: "qwen2.5:7b",
      category_source: categorySource,
    });

    expect(invoke).toHaveBeenCalledWith("start_analysis_batch", {
      request: {
        root_path: "C:/Docs",
        file_paths: ["C:/Docs/notes.md"],
        model: "qwen2.5:7b",
        category_source: categorySource,
      },
    });
  });

  it("uses narrow provider commands and preserves the remote consent fields", async () => {
    const config = {
      id: "remote-api",
      kind: "open_ai_compatible" as const,
      display_name: "外部 API",
      base_url: "https://api.example.com/v1",
      model: "gpt-test",
      enabled: true,
    };

    await getAiProviderConfig();
    await testAiProviderConnection({ config, api_key: "secret-key" });
    await saveAiProviderConfig({ config, api_key: "secret-key" });
    await startAnalysisBatch({
      root_path: "C:/Docs",
      file_paths: ["C:/Docs/notes.md"],
      model: "gpt-test",
      provider_id: "remote-api",
      remote_content_consent: true,
    });

    expect(invoke).toHaveBeenNthCalledWith(1, "get_ai_provider_config");
    expect(invoke).toHaveBeenNthCalledWith(2, "test_ai_provider_connection", { request: { config, api_key: "secret-key" } });
    expect(invoke).toHaveBeenNthCalledWith(3, "save_ai_provider_config", { request: { config, api_key: "secret-key" } });
    expect(invoke).toHaveBeenNthCalledWith(4, "start_analysis_batch", {
      request: {
        root_path: "C:/Docs",
        file_paths: ["C:/Docs/notes.md"],
        model: "gpt-test",
        provider_id: "remote-api",
        remote_content_consent: true,
      },
    });
  });
});
