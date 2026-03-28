"use client";

export interface EditorHeaderProps {
  onExport: () => void;
  onBackToDashboard: () => void | Promise<void>;
  saveStatus: "saving" | "saved" | "error";
  projectName: string;
  onProjectNameChange: (name: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function EditorHeader({
  onExport,
  onBackToDashboard,
  saveStatus,
  projectName,
  onProjectNameChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: EditorHeaderProps) {
  const statusLabel =
    saveStatus === "saving" ? "Saving..." : saveStatus === "error" ? "Save failed" : "Saved";
  const statusClassName =
    saveStatus === "saving"
      ? "text-amber-700 dark:text-amber-300"
      : saveStatus === "error"
        ? "text-rose-700 dark:text-rose-300"
        : "text-emerald-700 dark:text-emerald-300";

  return (
    <header className="sticky top-0 z-40 relative flex items-center justify-between gap-2 border-b border-white/60 bg-white/45 px-3 py-2.5 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/35">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <h1 className="shrink-0 text-xl font-bold">Editor</h1>
        <input
          type="text"
          value={projectName}
          onChange={(e) => onProjectNameChange(e.currentTarget.value)}
          style={{ width: `${Math.max(10, Math.min(26, projectName.length + 2))}ch` }}
          className="min-w-28 max-w-[26ch] rounded-lg border border-white/70 bg-white/70 px-2.5 py-1 text-sm text-slate-800 outline-none ring-0 transition-colors focus:border-slate-400 dark:border-white/15 dark:bg-zinc-800/60 dark:text-slate-100"
        />
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className={`h-7 w-7 rounded-md text-lg leading-none transition-all duration-200 ${
              canUndo
                ? "text-slate-700 hover:text-white hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.95)] hover:[text-shadow:0_0_10px_rgba(255,255,255,0.95),0_0_18px_rgba(255,255,255,0.75)] dark:text-slate-200"
                : "cursor-not-allowed text-slate-400 dark:text-zinc-500"
            }`}
            title="Undo (Cmd/Ctrl+Z)"
            aria-label="Undo"
          >
            ←
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className={`h-7 w-7 rounded-md text-lg leading-none transition-all duration-200 ${
              canRedo
                ? "text-slate-700 hover:text-white hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.95)] hover:[text-shadow:0_0_10px_rgba(255,255,255,0.95),0_0_18px_rgba(255,255,255,0.75)] dark:text-slate-200"
                : "cursor-not-allowed text-slate-400 dark:text-zinc-500"
            }`}
            title="Redo (Shift+Cmd/Ctrl+Z or Ctrl+Y)"
            aria-label="Redo"
          >
            →
          </button>
        </div>
      </div>
      <span
        aria-live="polite"
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 text-xs font-medium ${statusClassName}`}
      >
        {statusLabel}
      </span>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onExport}
          className="rounded-lg border border-white/70 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-800 transition-all duration-200 hover:bg-white hover:shadow-[0_0_18px_rgba(255,255,255,0.7)] dark:border-white/15 dark:bg-zinc-800/60 dark:text-slate-100 dark:hover:bg-zinc-700/70 dark:hover:shadow-[0_0_18px_rgba(255,255,255,0.35)] sm:text-sm"
        >
          Export
        </button>
        <button
          type="button"
          onClick={() => {
            void onBackToDashboard();
          }}
          className="rounded-lg border border-white/70 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-800 transition-all duration-200 hover:bg-white hover:shadow-[0_0_18px_rgba(255,255,255,0.7)] dark:border-white/15 dark:bg-zinc-800/60 dark:text-slate-100 dark:hover:bg-zinc-700/70 dark:hover:shadow-[0_0_18px_rgba(255,255,255,0.35)] sm:text-sm"
        >
          <span className="hidden sm:inline">Back to Dashboard</span>
          <span className="sm:hidden">Back</span>
        </button>
      </div>
    </header>
  );
}
