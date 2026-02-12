"use client";

import Link from "next/link";
import { useState } from "react";

export default function EditorPage() {
  const [count, setCount] = useState(0);

  return (
    <main className="min-h-screen p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Editor</h1>
        <div className="mt-4 text-sm">
            <Link
                    href="/dashboard"
                    className="rounded-md border px-4 py-2 text-sm"
                >
                    Back to Dashboard
            </Link>
        </div>
      </header>
      <p className="mt-2 text-sm opacity-80">
            This page must be a client component (audio + UI interaction).
      </p>

      <button
        className="mt-6 rounded-md bg-black px-4 py-2 text-sm text-white"
        onClick={() => setCount((c) => c + 1)}
      >
        Click test: {count}
      </button>
    </main>
  );
}