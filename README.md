# AI File Sorter

一款以本地文件管理为基础、由 AI 辅助生成整理建议的桌面应用。支持目录扫描、文件搜索、移动与重命名，并通过 **预览 → 确认 → 执行 → 历史与撤销** 保留用户对文件操作的控制权。

[下载安装](#下载安装) · [快速上手](#快速上手) · [开发指南](#开发指南) · [项目文档](#项目文档) · [反馈问题](https://github.com/td-xiehongyi/ai-file-sorter/issues)

> 当前源码版本为 **0.1.2**，主要面向 **Windows x64**。项目仍处于开发与发布验收阶段；真实文档评测、完整桌面流程和干净系统安装验收仍有待完成。源码版本不代表已有同版本正式安装包，实际可下载版本以 Releases 为准。

## 主要功能

| 功能 | 说明 |
| --- | --- |
| 目录扫描与索引 | 扫描用户选择的目录，在本地 SQLite 中保存元数据索引，重启后可恢复最近索引 |
| 文件浏览与搜索 | 支持分页、排序，以及名称、路径、类型、大小和修改时间等条件的搜索与筛选 |
| 目录变化监听 | 同步授权目录内的新增、修改、重命名和删除事件，不自动整理文件 |
| 安全文件操作 | 普通文件移动、批量移动和单文件重命名均经过预检、路径预览、确认和执行前复核 |
| 历史与撤销 | 持久保存逐项执行结果，在当前文件状态允许时撤销操作 |
| AI 内容分析 | 根据所选文件生成摘要、关键词、重命名和分类建议，长文档支持分段处理 |
| 分类模板 | 支持全局分类模板与根目录分类配置；接受建议后进入文件操作预览 |
| 模型服务配置 | 支持本地 Ollama 和 OpenAI 兼容 API，提供设置与连接测试 |

基础文件管理功能不依赖 AI 服务。AI 仅生成建议，不能直接执行文件操作。

## 下载安装

1. 打开 [GitHub Releases](https://github.com/td-xiehongyi/ai-file-sorter/releases)，选择已公开发布的版本。
2. 如该版本提供 Windows x64 安装包，下载 `*-setup.exe` 并运行；受管理环境也可使用该版本提供的 MSI。
3. 安装后从开始菜单启动 **AI File Sorter**。

普通用户无需安装 Node.js、pnpm 或 Rust。如果系统缺少 WebView2，安装器会尝试联网安装运行时。未签名安装包可能显示“未知发布者”提示，请核对下载来源与发布说明。

如果 Releases 暂无可用安装包，可按照下方开发指南从源码运行。构建流程与发布前验收要求见 [Windows 分发与发布验收](./docs/DISTRIBUTION_WINDOWS.md)。

## 快速上手

1. **选择目录**：使用应用中的目录选择器授权扫描，等待索引建立。
2. **查找文件**：浏览、搜索或筛选需要整理的文件。
3. **手动整理**：选择移动或重命名，检查源路径与目标路径预览，确认后执行。
4. **使用 AI（可选）**：配置模型服务，配置并启用分类，选择支持的文件后发起分析。
5. **审查建议**：检查、编辑、接受或拒绝 AI 建议；接受后仍需确认操作预览。
6. **查看历史**：查看逐项结果，需要时对符合条件的操作执行撤销。

### AI 服务配置

| 方式 | 准备工作 | 正文处理位置 |
| --- | --- | --- |
| 本地 Ollama | 安装 Ollama、准备模型，并在应用设置中配置本地服务；默认模型为 `qwen2.5:7b` | 本地模型服务 |
| OpenAI 兼容 API | 填写 HTTPS 服务地址、模型名称和 API Key，并测试连接 | 用户确认后发送至所配置的服务 |

远程模式支持 OpenAI 兼容的 `/chat/completions` 协议，不保证所有服务商或专用协议均可使用。API Key 使用系统凭据存储，不写入 SQLite。模型部署与训练资料见 [本地模型训练指南](./docs/LOCAL_MODEL_TRAINING_GUIDE.md)；使用应用不要求自行训练模型。

### 支持的内容格式

- TXT、Markdown。
- 可提取文本的 PDF、DOCX。
- 常见编程语言与配置文本文件，仅按文本读取，不执行代码。

目前不支持旧版 `.doc`、XLSX、PPTX、扫描件 OCR 或多模态内容理解。损坏、加密、空文本或超出资源限制的文档会返回对应状态，不生成可执行建议。

## 安全与隐私

- **明确授权**：只扫描用户选择的目录；扫描和监听只建立元数据索引，不自动读取正文或调用 AI。
- **本地优先**：索引、AI 分析结果和操作历史保存在系统应用数据目录。提取的原始正文仅在分析任务内存中短暂存在，不写入数据库、历史或日志。
- **远程发送需确认**：使用远程 API 时，所选文件正文会在用户明确确认后发送至配置的服务。本地优先不代表远程模式下数据不会外发。
- **AI 与执行隔离**：模型只返回受校验的建议，不能直接操作文件系统。建议仍须经过 Rust 校验、预览、确认和执行前复核。
- **拒绝覆盖与越界**：不提供删除、覆盖、跨卷移动或任意目录操作。仅确认后的 AI 分类操作可以创建或复用授权根目录下、由配置派生的一层分类目录。
- **按实际状态撤销**：目标冲突或文件身份变化时拒绝操作；批量执行中途失败会停止后续项目，已完成项保留在历史中，不自动回滚。

详细规则以 [安全模型](./docs/SAFETY_MODEL.md) 为准。

## 开发指南

### 环境要求

- Node.js **24.x**。
- pnpm **11.21.0**，与 `package.json` 的 `packageManager` 一致。
- Rust stable，包含 `rustfmt` 和 `clippy`。
- Windows 桌面开发所需的 Microsoft C++ Build Tools 与 WebView2。

当前发布流程面向 Windows x64。其他平台的依赖可参考 [Tauri 系统依赖说明](https://v2.tauri.app/start/prerequisites/)，但本项目尚未完成 macOS / Linux 的完整兼容性与发布验收。

### 获取源码并启动

以下命令在 PowerShell 中运行：

```powershell
git clone https://github.com/td-xiehongyi/ai-file-sorter.git
cd ai-file-sorter
pnpm install --frozen-lockfile
pnpm tauri dev
```

只开发前端界面时，可运行：

```powershell
pnpm dev
```

浏览器开发地址为 `http://localhost:1500`。文件系统、SQLite 和模型调用依赖 Tauri 后端，完整功能请在桌面应用中验证。

### 常用命令

在仓库根目录运行：

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 启动前端开发服务器 |
| `pnpm tauri dev` | 启动桌面开发应用 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm test` | 运行前端测试 |
| `pnpm build` | 类型检查并构建前端产物 |
| `pnpm check` | 前端类型检查、测试与构建 |
| `pnpm check:rust` | Rust 格式检查、Clippy 与测试 |
| `pnpm check:all` | 前后端检查及 Git 差异空白检查 |
| `pnpm tauri build` | 构建桌面应用与安装包 |

自动化检查通过不等于完成真实模型、桌面流程或安装发布验收。仓库的 [Windows 发布工作流](./.github/workflows/release.yml) 会在版本标签推送或手动触发后执行检查与构建，并创建草稿 Release；公开发布前需完成维护者验收。

### 技术栈与目录

使用 **Tauri 2 + React 19 + TypeScript + Rust + SQLite + Tailwind CSS 4**，前端构建与测试分别使用 Vite 和 Vitest。

```text
ai-file-sorter/
├── src/                    # React 界面、功能模块与前端测试
├── src-tauri/
│   ├── src/                # Rust 命令、服务、AI 适配与存储
│   ├── tests/              # Rust 集成测试
│   └── tauri.conf.json     # 桌面应用与打包配置
├── docs/                   # 产品、架构、安全、设计与验收文档
├── scripts/                # AI 评测等辅助脚本
└── .github/workflows/      # Windows 发布工作流
```

前端通过窄化的 Tauri 命令调用后端，不直接访问文件系统、SQLite 或 Shell。模块职责和数据流见 [系统架构](./docs/ARCHITECTURE.md)。

## 项目文档

| 文档 | 内容 |
| --- | --- |
| [产品需求](./docs/PRD.md) | 产品目标、功能范围与验收标准 |
| [系统架构](./docs/ARCHITECTURE.md) | 模块职责、依赖方向与数据流 |
| [安全模型](./docs/SAFETY_MODEL.md) | 授权、文件操作、隐私与撤销规则 |
| [开发路线图](./docs/ROADMAP.md) | 阶段计划与待完成事项 |
| [文件操作开发指南](./docs/PHASE_04_OPERATIONS.md) | 预检、执行、历史与撤销 |
| [AI 开发指南](./docs/PHASE_05_AI.md) | 内容提取、模型服务、建议审查与评测 |
| [本地模型训练指南](./docs/LOCAL_MODEL_TRAINING_GUIDE.md) | 模型部署、训练、量化与评测流程 |
| [Windows 分发与发布验收](./docs/DISTRIBUTION_WINDOWS.md) | 安装包构建、分发与人工验收 |
| [界面设计规范](./docs/ui-design/UI_DESIGN_SPEC.md) | 界面布局与视觉设计 |
| [交互规范](./docs/ui-design/UI_INTERACTION_SPEC.md) | 页面交互与状态处理 |

## 问题反馈与贡献

欢迎通过 [GitHub Issues](https://github.com/td-xiehongyi/ai-file-sorter/issues) 提交问题或建议。问题报告请包含应用版本、操作系统、复现步骤、预期与实际结果，以及脱敏后的错误信息；不要附上 API Key 或敏感文件正文。

提交代码前请先阅读架构和安全模型，保持改动范围清晰，并运行 `pnpm check:all`。涉及文件操作或 AI 数据发送的变更，需要补充对应的验证依据。

## 许可证

当前仓库尚未提供 `LICENSE` 文件，未声明开源许可证。如需复制、修改或分发本项目，请先与维护者确认授权范围。
