# Windows 分发与发布验收

本文面向项目维护者和测试人员。普通用户只需要从 GitHub Releases 下载 Windows 安装包，不需要安装 Node.js、pnpm、Rust 或源代码。

## 普通用户安装

1. 打开项目 GitHub 仓库的 **Releases** 页面。
2. 下载名称包含 `x64-setup.exe` 的文件。
3. 双击安装包完成安装，然后从开始菜单启动 **AI File Organizer**。
4. 首次使用时选择要扫描的目录。应用只会处理用户明确授权的目录。

Windows 10/11 通常已经包含 WebView2。如果系统缺少 WebView2，Tauri 安装器会尝试下载并安装它，因此第一次安装可能需要联网。离线安装包不是当前首版目标；如果未来需要在隔离网络部署，再切换到 Tauri 的 `offlineInstaller` 配置。

如果 Windows 显示“未知发布者”或 SmartScreen 提示，这是未配置代码签名证书的结果，不代表安装包一定损坏。面向公众发布前应完成 Windows 代码签名，并在发布页面提供校验信息。

## AI 功能依赖

文件扫描、浏览、搜索、手动移动、重命名和撤销不依赖 AI 服务。

要使用内容分析和分类建议，用户需要在应用设置中配置以下任一种 Provider：

- 本地 Ollama：另行安装 Ollama，并下载应用设置中指定的模型。
- OpenAI 兼容 API：填写 HTTPS 地址、模型名称和 API Key。

API Key 由应用保存到 Windows 系统凭据存储，不应写入截图、日志或 GitHub Issue。启用远程 Provider 前，用户必须确认所选文件正文会发送到该服务。

## 维护者发布流程

1. 更新根目录 `package.json`、`src-tauri/tauri.conf.json` 中的版本号，并保持两者一致。
2. 在本地完成：

   ```powershell
   pnpm install --frozen-lockfile
   pnpm check
   pnpm check:rust
   pnpm tauri build
   ```

3. 确认本地生成了：

   ```text
   src-tauri\target\release\bundle\nsis\*-setup.exe
   src-tauri\target\release\bundle\msi\*.msi
   ```

4. 创建并推送版本标签，例如：

   ```powershell
   git tag v0.1.0
   git push origin v0.1.0
   ```

5. GitHub Actions 会在 Windows runner 上重新安装依赖、运行检查、执行 `pnpm tauri build`，并创建一个 Draft Release。维护者完成验收后，再手动点击 **Publish release**。

## 发布前人工验收

- 在没有 Node.js、pnpm、Rust 的干净 Windows 10/11 x64 电脑上安装和启动。
- 选择中文路径，完成扫描、浏览、搜索和筛选。
- 完成一次普通文件移动和重命名，确认预览、执行和撤销都符合预期。
- 重启应用，确认最近使用的索引仍可恢复。
- 测试长路径、目标冲突、无权限目录和磁盘变化提示。
- 卸载应用，确认卸载流程正常；升级安装后确认应用数据没有被清空。
- 不配置 AI 时确认基础文件管理仍可使用；配置 Ollama 或远程 Provider 后再测试 AI 建议、确认和执行边界。
- 检查日志、截图和网络记录，确认没有泄露文件正文或 API Key。

自动化检查通过不等于完成了上述桌面人工验收，也不等于已经获得代码签名或公开发布资格。
