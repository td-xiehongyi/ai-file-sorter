# AI File Organizer

AI File Organizer 是一款规划中的 Local First 桌面文件整理应用。它帮助用户扫描、浏览和搜索本地文件，并通过可替换的 AI Provider 生成分类、移动或重命名建议，同时将最终控制权保留给用户。

## 当前状态

| 属性 | 值 |
| --- | --- |
| 状态 | 阶段一已完成；阶段二尚未开始 |
| 目标版本 | `v0.1.0` |
| 最后更新 | `2026-08-17` |

仓库已经建立 Tauri 2、React、TypeScript、Rust 和 Tailwind CSS 工程基础。当前首页只展示产品定位与建设状态；目录扫描、SQLite 索引、文件操作和 AI 建议尚未实现。

## 开发环境

### 前置条件

- Node.js 24
- pnpm 11
- Rust stable 工具链及 `rustfmt`
- 当前平台所需的 [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)

Windows 桌面构建需要 Microsoft C++ Build Tools 和 WebView2。macOS 与 Linux 需要安装 Tauri 文档列出的对应原生依赖。

### 安装

```powershell
pnpm install --frozen-lockfile
```

pnpm 只获准运行 esbuild 必需的安装脚本；该白名单记录在 `pnpm-workspace.yaml`。

### 开发与检查

```powershell
# 浏览器开发服务器
pnpm dev

# Tauri 桌面开发应用
pnpm tauri dev

# 前端类型检查、测试和生产构建
pnpm check

# 分项前端检查
pnpm typecheck
pnpm test
pnpm build

# Rust 检查
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml

# 调试安装包
pnpm tauri build --debug
```

阶段一没有注册自定义 Tauri Command，也没有文件系统、Shell、SQL、HTTP 或 Dialog 插件权限。启动应用不会扫描或修改用户文件。

## 核心原则

- **Local First**：文件保留在本地，SQLite 只保存可重建索引、应用元数据和操作历史。
- **AI 只提供建议**：AI 不能直接移动、重命名、删除或撤销文件操作。
- **先预览再确认**：移动和重命名必须经过 Rust 校验，并向用户展示 From/To 预览。
- **不静默覆盖**：目标路径存在任何文件或目录时拒绝执行。
- **操作可追踪**：实际操作写入持久历史，并在当前磁盘状态允许时支持撤销。
- **最小权限**：前端不直接访问文件系统、SQLite 或 Shell，后端不暴露通用文件操作入口。

## v0.1.0 计划能力

- 扫描用户明确选择的本地目录，并建立 SQLite 文件元数据索引。
- 浏览、搜索、排序和筛选索引中的文件。
- 监听授权目录变化，仅更新索引，不自动整理文件。
- 安全地预览、确认和执行普通文件的同卷移动与重命名。
- 保存操作历史，并根据当前磁盘状态判断是否可以撤销。
- 根据用户选择的文件元数据生成 AI 整理建议，再进入与手动操作相同的安全流程。

第一版不支持删除、覆盖、目录操作或跨卷移动。

## 计划技术栈

- Tauri 2
- React
- TypeScript
- Rust
- SQLite
- Tailwind CSS

## 文档导航

- [产品需求](./docs/PRD.md)：说明产品为谁解决什么问题，以及 v0.1.0 的范围和验收标准。
- [系统架构](./docs/ARCHITECTURE.md)：说明模块职责、依赖方向、数据流和持久化边界。
- [安全模型](./docs/SAFETY_MODEL.md)：定义扫描、文件操作、历史和撤销必须遵守的规范性规则。
- [开发路线图](./docs/ROADMAP.md)：说明六个阶段的实施顺序和完成标准。

涉及安全边界的内容如有冲突，以[安全模型](./docs/SAFETY_MODEL.md)为准。
