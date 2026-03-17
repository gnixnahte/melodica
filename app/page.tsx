import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#ffffff_0%,#e9eef4_55%,#dde4ec_100%)] px-4 dark:bg-[radial-gradient(circle_at_top,#353844_0%,#2c2f38_55%,#23262e_100%)]">
      <main className="flex min-h-[80vh] w-full max-w-3xl flex-col items-center justify-between rounded-3xl border border-white/60 bg-white/50 px-10 py-20 shadow-2xl shadow-slate-400/20 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/35 dark:shadow-black/20 sm:items-start">
        <h1 className="text-4xl font-bold">Melodica</h1>
        <p className="mt-4 text-lg opacity-80">
          Create your own melodies with the music editor in seconds.
        </p>
        <div className="mt-6 flex gap-3">
          <Link href="/login" className="rounded-md border border-white/70 bg-white/70 px-4 py-2 text-sm text-slate-800 shadow-sm backdrop-blur hover:bg-white dark:border-white/15 dark:bg-zinc-800/60 dark:text-slate-100 dark:hover:bg-zinc-700/70">
            Get Started
          </Link>
          <Link href="/dashboard" className="rounded-md border border-slate-300/80 bg-slate-800 px-4 py-2 text-sm text-white shadow-sm hover:bg-slate-700 dark:border-slate-500/50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white">
            Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
