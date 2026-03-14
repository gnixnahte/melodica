import Link from "next/link";

export function EditorHeader() {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-b border-neutral-200/60 dark:border-neutral-700/60">
      <h1 className="text-2xl font-bold">Editor</h1>
      <Link
        href="/dashboard"
        className="rounded-lg border border-neutral-200 dark:border-neutral-600 px-4 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
      >
        Back to Dashboard
      </Link>
    </header>
  );
}
