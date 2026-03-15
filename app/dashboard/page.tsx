"use client";
import Link from "next/link";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const [songs, setSongs] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    async function loadSongs() {
      const { data, error } = await supabase
        .from("songs")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Error loading songs:", error);
        return;
      }

      setSongs(data || []);
    }

    loadSongs();
  }, []);
  
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
            Log Out
          </Link>
        </div>
      </header>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Projects</h2>

        <div className="mt-3 space-y-3">
          {songs.length === 0 ? (
            <div className="rounded-lg border p-4 text-sm opacity-80">
              No projects yet. Click <span className="font-medium">New Project</span> to start.
            </div>
          ) : (
            songs.map((song) => (
              <div
                key={song.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div>
                  <p className="font-medium">{song.title}</p>
                  <p className="text-xs opacity-70">BPM: {song.bpm}</p>
                </div>

                <button
                  onClick={() => router.push(`/editor?id=${song.id}`)}
                  className="rounded-md border px-3 py-1 text-sm"
                >
                  Open
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}