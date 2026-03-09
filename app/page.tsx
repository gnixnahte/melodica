import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <h1 className="text-4xl font-bold">Melodica</h1>
        <p className="mt-4 text-lg opacity-80">
          Create your own melodies with the music editor in seconds.
        </p>
        <div className="mt-6">
          <Link href="/login" className="rounded-md bg-black px-4 py-2 text-sm text-white">
            Get Started
          </Link>
          <Link href="/dashboard" className="rounded-md bg-black px-4 py-2 text-sm text-white">
            Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
