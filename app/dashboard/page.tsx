import Link from "next/link";

export default function DashboardPage() {
  return (
    <main className="min-h-screen p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="mt-1 text-sm opacity-80">
            Your projects will show up here.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/editor"
            className="rounded-md bg-black px-4 py-2 text-sm text-white"
          >
            New Project
          </Link>
          <Link
            href="/"
            className="rounded-md border px-4 py-2 text-sm"
          >
            Landing
          </Link>
          <Link
            href="/login"
            className="rounded-md border px-4 py-2 text-sm"
          >
            Log Out
          </Link>
        </div>
      </header>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Projects</h2>

        <div className="mt-3 rounded-lg border p-4 text-sm opacity-80">
          No projects yet. Click <span className="font-medium">New Project</span>{" "}
          to start.
        </div>
      </section>
    </main>
  );
}