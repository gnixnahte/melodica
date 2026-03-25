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
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-white/60 bg-white/45 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/35 relative">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Editor</h1>
        <input
          type="text"
          value={projectName}
          onChange={(e) => onProjectNameChange(e.currentTarget.value)}
          style={{ width: `${Math.max(14, Math.min(42, projectName.length + 2))}ch` }}
          className="min-w-48 rounded-lg border border-white/70 bg-white/70 px-3 py-1.5 text-sm text-slate-800 outline-none ring-0 transition-colors focus:border-slate-400 dark:border-white/15 dark:bg-zinc-800/60 dark:text-slate-100"
        />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className={`h-8 w-8 rounded-md text-xl leading-none transition-all duration-200 ${
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
            className={`h-8 w-8 rounded-md text-xl leading-none transition-all duration-200 ${
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
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onExport}
          className="rounded-lg border border-white/70 bg-white/70 px-4 py-2 text-sm text-slate-800 transition-all duration-200 hover:bg-white hover:shadow-[0_0_18px_rgba(255,255,255,0.7)] dark:border-white/15 dark:bg-zinc-800/60 dark:text-slate-100 dark:hover:bg-zinc-700/70 dark:hover:shadow-[0_0_18px_rgba(255,255,255,0.35)]"
        >
          Export
        </button>
        <button
          type="button"
          onClick={() => {
            void onBackToDashboard();
          }}
          className="rounded-lg border border-white/70 bg-white/70 px-4 py-2 text-sm text-slate-800 transition-all duration-200 hover:bg-white hover:shadow-[0_0_18px_rgba(255,255,255,0.7)] dark:border-white/15 dark:bg-zinc-800/60 dark:text-slate-100 dark:hover:bg-zinc-700/70 dark:hover:shadow-[0_0_18px_rgba(255,255,255,0.35)]"
        >
          Back to Dashboard
        </button>
      </div>
    </header>
  );
}
