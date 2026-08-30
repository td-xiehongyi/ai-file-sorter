export function App() {
  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div aria-hidden="true" className="ambient ambient-left" />
      <div aria-hidden="true" className="ambient ambient-right" />

      <section className="relative mx-auto flex min-h-screen w-full flex-col py-10">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between border-b border-white/10 px-6 pb-6 sm:px-10 lg:px-14">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl border border-emerald-300/30 bg-emerald-300/10 text-sm font-bold text-emerald-200">
              AF
            </span>
            <span className="text-sm font-medium tracking-wide text-slate-300">
              AI File Organizer
            </span>
          </div>
          <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-medium text-amber-100">
            阶段五开发版
          </span>
        </header>

        <FilesFeature />

        <footer className="mx-auto flex w-full max-w-6xl flex-col gap-2 border-t border-white/10 px-6 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-10 lg:px-14">
          <span>v0.1.0 · Phase 5</span>
          <span>本地 AI 只提供建议；文件写入必须经过预览、确认与执行前复核</span>
        </footer>
      </section>
    </main>
  );
}
import { FilesFeature } from "../features/files/FilesFeature";
