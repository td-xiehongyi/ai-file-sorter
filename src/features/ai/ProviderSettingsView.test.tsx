import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { PublicAiProviderConfig, ProviderStatus } from "../../types/ai";
import { ProviderSettingsView } from "./ProviderSettingsView";

const localConfig: PublicAiProviderConfig = {
  config: {
    id: "ollama-default",
    kind: "ollama",
    display_name: "本地 Ollama",
    base_url: "http://127.0.0.1:11434",
    model: "qwen2.5:7b",
    enabled: true,
  },
  api_key_present: false,
};

const apiStatus: ProviderStatus = {
  available: true,
  provider: "open_ai_compatible",
  model: "gpt-test",
  message: "外部 API 模型已就绪",
};

it("tests and saves an API provider without retaining the API key in the form", async () => {
  const onTest = vi.fn().mockResolvedValue(apiStatus);
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<ProviderSettingsView config={localConfig} status={null} onTest={onTest} onSave={onSave} />);

  fireEvent.click(screen.getByRole("tab", { name: "API 模型" }));
  fireEvent.change(screen.getByLabelText("模型名称"), { target: { value: "gpt-test" } });
  fireEvent.change(screen.getByLabelText("API 地址"), { target: { value: "https://api.example.com/v1" } });
  fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "test-secret" } });
  fireEvent.click(screen.getByRole("button", { name: "测试连接" }));

  await waitFor(() => expect(onTest).toHaveBeenCalledWith(expect.objectContaining({
    config: expect.objectContaining({ kind: "open_ai_compatible", model: "gpt-test" }),
    api_key: "test-secret",
  })));
  expect(await screen.findByText("外部 API 模型已就绪")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "保存 API 配置" }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(screen.getByLabelText("API Key")).toHaveValue("");
});

it("shows the remote-content warning for an external provider", () => {
  render(<ProviderSettingsView config={localConfig} status={null} onTest={vi.fn()} onSave={vi.fn()} />);

  fireEvent.click(screen.getByRole("tab", { name: "API 模型" }));

  expect(screen.getByText(/所选文件正文会发送到配置的 API 地址/)).toBeInTheDocument();
});
