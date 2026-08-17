# AI File Organizer 开发路线图

| 属性 | 值 |
| --- | --- |
| 状态 | 阶段一已完成；阶段二规划中 |
| 目标版本 | `v0.1.0` |
| 最后更新 | `2026-08-18` |

产品范围见[产品需求文档](./PRD.md)，安全相关阶段必须遵守[安全模型](./SAFETY_MODEL.md)，模块职责见[系统架构](./ARCHITECTURE.md)。

## 路线图原则

- 先完成不依赖 AI 也可用的基础文件管理器，再接入 AI。
- 文件优先保留在本地，提取出的原始正文只在分析任务内存中短暂存在；SQLite 保存索引、AI 分析结果、应用元数据和操作历史。
- AI 只生成建议，不直接执行移动、重命名或删除。
- 移动和重命名必须提供 From/To 预览；危险操作默认需要用户确认。
- 所有实际文件操作必须记录历史，并在状态允许时支持撤销。
- 第一版安全操作只实现移动与重命名，不提供删除功能。
- 删除必须在跨平台可恢复方案单独设计并获得确认后，才能加入后续路线图。
- 扫描和监听默认不跟随符号链接或 Windows Junction，只记录链接本身；链接目标必须由用户单独授权选择。
- SQLite 数据统一存放在系统应用数据目录，不在扫描目录中写入数据库或旁车文件。
- 文件索引允许重建，但索引重建必须保留操作历史。
- 阶段一列出的工程边界已创建；阶段二至六中标注“尚未创建”的路径仍为计划路径。
- 每个阶段开始前，需要进一步确认该阶段的接口、数据结构和验收细节。
- 单元测试和集成测试随阶段一至五的功能同步建设；阶段六不再承担为既有功能补齐基础测试的职责。
- “核心边界文件”是阶段必须建立的接口或持久化边界；“建议拆分文件”可在阶段设计时调整名称或合并，但不能改变阶段目标和安全规则。

## 阶段一：工程基础（已完成）

### 目标

建立可运行、可检查的最小桌面应用工程，为后续功能提供清晰的前后端边界。

### 已完成的功能

- 初始化 Tauri 2、React、TypeScript、Rust 和 Tailwind CSS。
- 设置应用名称、窗口和最小 Tauri 权限。
- 建立前端入口与 Rust 模块注册。
- 删除脚手架示例功能和不使用的依赖。
- 建立类型检查、Rust 格式检查、构建和测试命令。

### 涉及目录

- `src/app/`
- `src/test/`
- `src-tauri/src/commands/`
- `src-tauri/src/models/`
- `src-tauri/src/services/`
- `src-tauri/src/storage/`

### 已建立的核心边界文件

- `package.json`
- `vite.config.ts`
- `tsconfig.json`
- `src/main.tsx`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `src-tauri/src/main.rs`
- `src-tauri/src/lib.rs`
- `src/app/App.test.tsx`
- `src-tauri/tests/app_smoke.rs`

### 已建立的模块文件

- `src/app/App.tsx`
- `src/app/styles.css`
- `src-tauri/src/commands/mod.rs`
- `src-tauri/src/models/mod.rs`
- `src-tauri/src/services/mod.rs`
- `src-tauri/src/storage/mod.rs`

### 验收结果（2026-08-17）

- [x] 应用能以开发模式启动。
- [x] TypeScript 构建、Rust 格式检查、`cargo check` 和 `cargo test` 全部通过。
- [x] 最小前端渲染测试和 Rust 应用装配测试通过。
- [x] Windows x64 调试 MSI 可成功构建。
- [x] 首页仅说明 Local First 定位和当前建设状态。
- [x] 后端没有通用文件操作或 Shell 执行 Command。

## 阶段二：目录扫描与 SQLite 索引

### 目标

安全地扫描用户明确选择的目录，并将文件元数据保存为可更新的本地索引。

### 应完善的功能

- 由用户选择需要扫描的本地目录。
- 递归读取文件名、路径、扩展名、大小和修改时间等基础元数据。
- 支持忽略规则、无权限目录和扫描错误汇总。
- 识别符号链接和 Windows Junction，记录链接条目但默认不遍历其目标。
- 只有用户单独选择链接目标的真实目录后，才能将其作为新的扫描根目录。
- 使用事务批量写入 SQLite。
- 通过 Rust 后端解析系统应用数据目录，并在其中初始化 SQLite。
- 提供只重置索引数据的重建流程，不通过删除整个数据库清理索引。
- 支持首次全量扫描和后续增量更新。
- 扫描过程只读，不移动、重命名或删除文件。

### 涉及目录

- `src/features/files/`
- `src/types/`
- `src/lib/`
- `src-tauri/src/commands/`
- `src-tauri/src/models/`
- `src-tauri/src/services/`
- `src-tauri/src/storage/`

### 核心边界文件（尚未创建）

- `src/types/files.ts`
- `src/lib/files-api.ts`
- `src-tauri/src/commands/files.rs`
- `src-tauri/src/models/file_entry.rs`
- `src-tauri/src/models/scan.rs`
- `src-tauri/src/services/scanner.rs`
- `src-tauri/src/services/path_policy.rs`
- `src-tauri/src/storage/app_paths.rs`
- `src-tauri/src/storage/database.rs`
- `src-tauri/src/storage/file_repository.rs`
- `src-tauri/src/storage/migrations/001_initial.sql`
- `src-tauri/tests/scanner_integration.rs`
- `src-tauri/tests/path_safety_integration.rs`
- `src-tauri/tests/storage_integration.rs`

### 建议拆分文件（尚未创建，可调整）

- `src/features/files/DirectoryPicker.tsx`
- `src/features/files/ScanProgress.tsx`

### 完成标准

- 用户可以选择目录并看到明确的扫描进度和结果摘要。
- 同一目录重复扫描不会产生重复索引。
- 扫描目录中不会出现数据库、索引文件或应用旁车目录。
- 文件新增、修改和缺失能在增量扫描后正确反映。
- 无权限、损坏链接或单文件失败不会导致整个扫描崩溃。
- 扫描不会通过符号链接或 Junction 越出用户选择的根目录，也不会陷入循环链接。
- 单独授权链接目标后，可以将真实目标作为独立根目录扫描。
- 测试确认扫描过程不会修改被扫描目录。
- 索引测试使用临时目录和独立测试数据库，不接触用户真实数据。

## 阶段三：文件浏览、搜索与变化监听

### 目标

让用户能够基于本地索引浏览和查找文件，并及时看到磁盘状态变化。

### 应完善的功能

- 展示目录和文件列表。
- 支持按名称、路径、类型、大小和修改时间排序或筛选。
- 支持文件名和路径关键词搜索。
- 对大量结果使用分页或虚拟列表，避免一次渲染全部数据。
- 监听已索引目录的新增、修改和删除事件。
- 监听事件只更新索引，不自动整理文件。
- 文件监听器不得通过符号链接或 Junction 扩展监听到未授权目录。

### 涉及目录

- `src/features/files/`
- `src/types/`
- `src/lib/`
- `src-tauri/src/commands/`
- `src-tauri/src/models/`
- `src-tauri/src/services/`
- `src-tauri/src/storage/`

### 核心边界文件（尚未创建）

- `src/lib/search-api.ts`
- `src-tauri/src/commands/search.rs`
- `src-tauri/src/models/search.rs`
- `src-tauri/src/services/search.rs`
- `src-tauri/src/services/watcher.rs`
- `src/features/files/FileBrowser.test.tsx`
- `src-tauri/tests/search_integration.rs`
- `src-tauri/tests/watcher_integration.rs`

### 建议拆分文件（尚未创建，可调整）

- `src/features/files/FileBrowser.tsx`
- `src/features/files/FileList.tsx`
- `src/features/files/SearchBar.tsx`
- `src/features/files/FileFilters.tsx`
- `src/features/files/useFiles.ts`

### 完成标准

- 用户能浏览索引结果并组合使用搜索、排序和筛选。
- Windows 路径、Unicode 文件名和大小写差异被一致处理。
- 磁盘变化能在合理时间内同步到索引和界面。
- 大目录查询不会阻塞界面。
- 重启应用后仍可读取已有索引。
- 重建索引只重置可重建的文件索引数据，不改变其他持久化数据。
- 搜索、排序、筛选和监听行为均有本阶段自动化测试覆盖。

## 阶段四：安全文件操作、历史与撤销

### 目标

建立统一、安全、可预览且可追踪的文件操作管线，借鉴 ai-file-sorter 的 Review、Dry Run 和持久撤销思想。

本阶段第一版范围仅包含普通文件、已存在目标目录、同卷移动与重命名。详细规则以 [安全模型](./SAFETY_MODEL.md) 为准。

### 应完善的功能

- 用户操作和未来 AI 建议统一转换为结构化操作草案。
- 拒绝目录对象、缺失目标目录、目标已存在和跨卷移动。
- 校验源路径、目标路径、权限、名称合法性、文件身份和磁盘当前状态。
- 移动和重命名必须展示 From/To 预览。
- 移动和重命名默认要求用户明确确认。
- Rust 为成功校验生成一次性 `planId`；计划仅在内存保存 10 分钟。
- 前端只能确认 `planId`，不能在执行请求中重新提交或替换路径。
- 执行前复核文件类型、大小、修改时间及平台可用的文件身份；手动普通操作第一版不计算内容哈希，阶段五的 AI 派生计划额外携带并复核内容指纹。
- 支持预览模式，预览时不修改任何文件。
- 记录每次实际操作的请求、结果和可撤销信息。
- 操作历史保存在系统应用数据目录中的 SQLite 持久化层，不依附于被整理目录。
- 撤销前重新校验路径和冲突；无法安全撤销时拒绝执行并说明原因。
- 批量操作在确认前必须全量校验；任一无效项都会阻止整批进入确认和执行。
- 用户确认后按计划逐项执行；运行时首个失败会停止所有尚未开始的后续项目。
- 不自动回滚已成功项目，而是保留逐项真实结果，并允许用户通过正常撤销流程恢复成功项。
- 操作历史默认长期保留；历史记录与当前撤销资格分开表达。
- 不实现删除 Command、删除执行器或删除界面。
- 不实现目录创建、目录移动、目录重命名、覆盖或跨卷移动。
- 跨平台可恢复删除作为独立后续设计，不在本阶段预留未经确认的执行入口。

### 涉及目录

- `src/features/operations/`
- `src/types/`
- `src/lib/`
- `src-tauri/src/commands/`
- `src-tauri/src/models/`
- `src-tauri/src/services/`
- `src-tauri/src/storage/`

### 核心边界文件（尚未创建）

- `src/types/operations.ts`
- `src/lib/operations-api.ts`
- `src-tauri/src/commands/operations.rs`
- `src-tauri/src/models/operation.rs`
- `src-tauri/src/storage/operation_repository.rs`
- `src-tauri/src/storage/migrations/002_operation_history.sql`
- `src/features/operations/OperationPreview.test.tsx`
- `src-tauri/tests/operation_safety.rs`
- `src-tauri/tests/batch_failure_integration.rs`
- `src-tauri/tests/undo_integration.rs`
- `src-tauri/tests/index_reset_preserves_history.rs`

### 建议拆分文件（尚未创建，可调整）

- `src/features/operations/OperationPreview.tsx`
- `src/features/operations/ConfirmOperationDialog.tsx`
- `src/features/operations/OperationHistory.tsx`
- `src/features/operations/UndoAction.tsx`
- `src-tauri/src/services/operation_validator.rs`
- `src-tauri/src/services/operation_executor.rs`
- `src-tauri/src/services/plan_store.rs`
- `src-tauri/src/services/file_identity.rs`
- `src-tauri/src/services/volume_policy.rs`
- `src-tauri/src/services/undo_service.rs`

### 完成标准

- 未校验草案无法传入执行器。
- 移动和重命名没有预览与确认时无法执行。
- 前端和 Tauri Command 均不存在删除、目录操作、覆盖或跨卷移动入口。
- 目录对象、缺失目标目录、已存在目标和跨卷目标在预览阶段被拒绝。
- `planId` 在 10 分钟后、取消后、消费后或应用退出后不可执行；同一计划不能执行两次。
- 前端无法通过执行请求改变已预览计划中的源路径、目标路径或操作类型。
- 预览后源文件身份或元数据变化时，执行前复核会拒绝操作。
- 预览模式不会产生磁盘变化或成功执行记录。
- 所有真实操作均有逐项历史和明确结果。
- 批量预检发现无效项时不会执行任何项目。
- 运行时失败后，已成功、失败和未执行项目均有准确状态，且后续项目没有被执行。
- 系统不会声称批量文件操作具有原子性，也不会自动回滚已成功项目。
- 重建文件索引后，既有操作历史与可用的撤销记录仍然保留。
- 操作历史不会自动过期；界面能区分历史存在与当前可撤销。
- 撤销成功时恢复原路径；发生冲突时不会覆盖现有文件。
- 自动化测试验证磁盘真实状态，而不只验证界面状态。
- 操作测试只使用隔离临时目录，并覆盖预览无副作用、目标冲突、目录对象、跨卷拒绝、计划生命周期、源文件变化、批量失败、长期历史和撤销恢复。

## 阶段五：AI 整理建议

### 目标

在基础文件管理稳定后，引入可替换、内容感知的 AI 建议能力，同时保持原始正文的临时生命周期以及 AI 与文件执行层的隔离。

### 应完善的功能

- 目录扫描和监听不读取正文；只对用户主动选择的文件发起内容分析。
- 第一版支持文本型 PDF、TXT、MD 和 DOCX，在本地识别真实格式并提取正文。
- 短文档直接分析；超过单次模型输入预算的长文档分段摘要后再汇总。
- 默认优先本地模型或用户主动配置的 Provider。
- 本地与远程模型共用 Provider 抽象，不在核心流程中写死服务商或模型。
- 每批远程请求前展示确切文件及版本、Provider/模型、拟发送字段、预计字符或 token 数、分段与调用次数、最大重试预算和费用范围；无法估算费用时明确提示。确认后生成一次性批次同意凭据，任一绑定项变化或凭据失效时重新确认。
- 将模型输出解析为封闭的严格结构：非空摘要、非空关键词数组、不含路径且扩展名不变的合法建议文件名、已有分类 ID 或 `null`、`[0, 1]` 置信度和非空理由；缺少字段、额外字段、类型错误或越界值整项拒绝。
- 用户预先配置分类 ID 到已存在目标目录的映射；AI 不返回绝对路径、不创建目录，无法匹配时只建议重命名。
- 原始正文仅在当前任务内存中存在；SQLite 只保存摘要、关键词、建议、置信度、理由、Provider/模型标识、分析时间、文件身份、内容指纹和采用状态。
- 内容提取读取字节时同步计算仅用于 AI 结果的内容指纹；分析期间复核文件状态，持久结果在重启后加载或转换为草案前复核指纹。AI 派生的草案和计划携带指纹并在执行前再次复核；手动普通文件操作仍不强制计算内容哈希。
- 非法、越界或无法解析的输出直接拒绝。
- 扫描 PDF、加密或损坏文档、空文本、格式伪装、解码失败和资源超限返回明确状态，不生成可执行建议。
- AI 建议只能进入阶段四的草案、校验、预览和确认流程。
- AI 无权直接调用文件执行、删除或撤销服务。
- 第一版 AI 不生成删除建议。

### 未来新增目录

- `src/features/ai/`（未来规划，尚未创建）
- `src-tauri/src/ai/`（未来规划，尚未创建）

### 核心边界文件（尚未创建）

- `src/types/suggestions.ts`
- `src/lib/suggestions-api.ts`
- `src-tauri/src/commands/suggestions.rs`
- `src-tauri/src/models/suggestion.rs`
- `src-tauri/src/models/analysis.rs`
- `src-tauri/src/models/consent.rs`
- `src-tauri/src/ai/mod.rs`
- `src-tauri/src/ai/provider.rs`
- `src-tauri/src/services/content_extractor.rs`
- `src-tauri/src/services/content_analysis_service.rs`
- `src-tauri/src/services/suggestion_service.rs`
- `src-tauri/src/storage/analysis_repository.rs`
- `src-tauri/src/storage/migrations/003_ai_analysis.sql`
- `src-tauri/tests/content_extraction.rs`
- `src-tauri/tests/suggestion_safety.rs`

### 建议拆分文件（尚未创建，可调整）

- `src/features/ai/SuggestionPanel.tsx`
- `src/features/ai/SuggestionReview.tsx`
- `src/features/ai/SuggestionReview.test.tsx`
- `src/features/ai/RemoteConsentDialog.tsx`
- `src-tauri/src/services/content_chunker.rs`

### 完成标准

- AI 不可直接触发任何文件系统写操作。
- 文本型 PDF、TXT、MD 和 DOCX 可以生成摘要、关键词和智能重命名建议；长文档完成分段摘要与最终汇总。
- 有效分类 ID 能映射到现存目录，用户接受后完整经过草案、校验、From/To 预览、确认和执行链。
- 旧版 `.doc`、XLSX、PPTX、扫描版或图片型 PDF 的 OCR，以及图表、公式和页面图像的多模态理解明确留给后续版本。
- 模型输出失败或 Provider 不可用时，基础文件管理功能仍正常工作。
- 用户能逐项接受、修改或拒绝建议。
- 被接受的建议仍必须通过程序校验、预览和确认。
- 未经本批用户同意，不向远程服务发送正文或其他已展示的数据；原始正文不进入 SQLite、操作历史或日志。
- 缺少字段、额外字段、类型错误、空必填值、非法文件名、越界置信度、未知分类 ID、绝对路径与目录创建输出被拒绝；无法匹配分类时只生成重命名建议。
- 扫描 PDF、加密或损坏文档、空文本、格式伪装、不支持格式、解码失败和资源超限只产生明确失败状态，不调用 Provider 或生成可执行建议。
- 同大小或相同修改时间的内容替换、分析期间变化、应用重启后加载持久结果，以及 AI 草案生成后至执行前的变化，都会被内容指纹复核发现并使既有结果或计划失效。
- 测试使用非敏感样本文档与模拟 Provider，验证提取、分段汇总、批次同意、结果留存和 AI 输出均无法绕过安全边界。

## 阶段六：稳定性、安全审计与发布

### 目标

在前五阶段已有单元测试和集成测试的基础上，完成跨平台、端到端、故障恢复、性能和可重复发布验证，使应用达到可分发状态。

### 应完善的功能

- 覆盖 Windows、macOS 和 Linux 的路径及文件操作差异。
- 测试权限失败、目标冲突、文件变化、应用中断和数据库恢复。
- 跨平台验证普通文件范围、目标不覆盖、跨卷拒绝、`planId` 生命周期和撤销资格行为一致。
- 对大目录扫描、搜索和批量预览进行性能测试。
- 审计 Tauri 权限、Command 暴露面、日志隐私和依赖许可证。
- 验证安装、升级和卸载不会删除用户文件或索引目录外的数据。
- 建立 CI 检查和多平台安装包流程。

### 未来新增目录

- `tests/e2e/`（未来规划，尚未创建）
- `.github/workflows/`（未来规划，尚未创建）

### 核心边界文件（尚未创建）

- `tests/e2e/file-management.spec.ts`
- `tests/e2e/operation-preview.spec.ts`
- `tests/e2e/recovery.spec.ts`
- `tests/e2e/platform-paths.spec.ts`
- `tests/e2e/link-boundaries.spec.ts`
- `tests/e2e/operation-boundaries.spec.ts`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`

### 完成标准

- 类型检查、前端测试、Rust 格式检查、Clippy、Rust 测试和桌面构建全部通过。
- 三个平台完成核心扫描、搜索、预览、执行和撤销场景验证。
- 在各平台验证符号链接或等价重解析点不会突破用户授权的扫描边界。
- 在各平台验证目录对象、已存在目标和跨卷移动被拒绝，计划不能重复或超时执行。
- 中断或部分失败后，历史记录与磁盘真实状态可核对。
- Tauri 权限保持最小化，不存在通用 Shell 或任意文件操作入口。
- 发布产物可重复构建，并附带已知限制和数据安全说明。
- 阶段一至五的既有测试全部纳入 CI，阶段六不以端到端测试替代底层单元和集成测试。

## 阶段执行约定

- 一次只实施一个已确认阶段，不因后续规划提前加入依赖。
- 每个阶段开始前先检查现有结构和上一阶段结果。
- 每项文件操作功能都先定义失败行为和恢复方式，再实现成功路径。
- 每个阶段同步编写与该阶段风险相匹配的单元测试和集成测试，并在阶段结束时运行类型检查、构建和全部既有测试。
- 路线图中的文件名可以在阶段设计时调整，但必须同步更新本文档并说明原因。
