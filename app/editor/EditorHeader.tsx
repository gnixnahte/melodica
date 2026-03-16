"use client";

export interface EditorHeaderProps {
  onSave: () => void;
  onExport: () => void;
  onBackToDashboard: () => void;
  projectName: string;
  onProjectNameChange: (name: string) => void;
}

export function EditorHeader({
  onSave,
  onExport,
  onBackToDashboard,
  projectName,
  onProjectNameChange,
}: EditorHeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-white/60 bg-white/45 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/35">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Editor</h1>
        <input
          type="text"
          value={projectName}
          onChange={(e) => onProjectNameChange(e.currentTarget.value)}
          style={{ width: `${Math.max(14, Math.min(42, projectName.length + 2))}ch` }}
          className="min-w-48 rounded-lg border border-white/70 bg-white/70 px-3 py-1.5 text-sm text-slate-800 outline-none ring-0 transition-colors focus:border-slate-400 dark:border-white/15 dark:bg-slate-800/60 dark:text-slate-100"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          className="rounded-lg border border-white/70 bg-white/70 px-4 py-2 text-sm text-slate-800 transition-all duration-200 hover:bg-white hover:shadow-[0_0_18px_rgba(255,255,255,0.7)] dark:border-white/15 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/70 dark:hover:shadow-[0_0_18px_rgba(255,255,255,0.35)]"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onExport}
          className="rounded-lg border border-white/70 bg-white/70 px-4 py-2 text-sm text-slate-800 transition-all duration-200 hover:bg-white hover:shadow-[0_0_18px_rgba(255,255,255,0.7)] dark:border-white/15 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/70 dark:hover:shadow-[0_0_18px_rgba(255,255,255,0.35)]"
        >
          Export
        </button>
        <button
          type="button"
          onClick={onBackToDashboard}
          className="rounded-lg border border-white/70 bg-white/70 px-4 py-2 text-sm text-slate-800 transition-all duration-200 hover:bg-white hover:shadow-[0_0_18px_rgba(255,255,255,0.7)] dark:border-white/15 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/70 dark:hover:shadow-[0_0_18px_rgba(255,255,255,0.35)]"
        >
          Back to Dashboard
        </button>
      </div>
    </header>
  );
}
