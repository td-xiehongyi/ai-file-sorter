const principles = [
  {
    title: "Local First",
    description: "文件保留在本机，基础整理能力不依赖远程服务。",
  },
  {
    title: "先预览，再确认",
    description: "任何移动或重命名都必须先展示变化并由用户明确确认。",
  },
  {
    title: "建议与执行隔离",
    description: "AI 只提供建议，最终操作由用户确认。",
  },
] as const;

export function App() {
  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div aria-hidden="true" className="ambient ambient-left" />
      <div aria-hidden="true" className="ambient ambient-right" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10 sm:px-10 lg:px-14">
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl border border-emerald-300/30 bg-emerald-300/10 text-sm font-bold text-emerald-200">
              AF
            </span>
            <span className="text-sm font-medium tracking-wide text-slate-300">
              AI File Organizer
            </span>
          </div>
          <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-medium text-amber-100">
            阶段一已完成
          </span>
        </header>

        <div className="flex flex-1 flex-col justify-center py-16 lg:py-24">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.24em] text-emerald-300">
            Local First · User Controlled
          </p>
          <h1 className="max-w-4xl text-balance text-5xl font-semibold tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
            AI File Organizer
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-slate-300 sm:text-xl">
            一个谨慎、透明的桌面文件整理工具。先建立可靠的本地工程基础，再逐步加入扫描、索引与安全操作能力。
          </p>

          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {principles.map((principle, index) => (
              <article
                className="group rounded-2xl border border-white/10 bg-white/[0.045] p-6 backdrop-blur-sm transition-colors hover:border-emerald-300/25 hover:bg-white/[0.065]"
                key={principle.title}
              >
                <span className="text-xs font-semibold tabular-nums text-slate-500">
                  0{index + 1}
                </span>
                <h2 className="mt-6 text-lg font-semibold text-white">
                  {principle.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {principle.description}
                </p>
              </article>
            ))}
          </div>
        </div>

        <footer className="flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>v0.1.0 · Phase 1</span>
          <span>当前版本不会扫描或修改任何文件</span>
        </footer>
      </section>
    </main>
  );
}
