"use client";

import Link from "next/link";
import { useState } from "react";
import { createDefaultProject } from "@/lib/defaultProject";
import type { Project } from "@/types/project";

export default function EditorPage() {
  const [project, setProject] = useState<Project>(() =>
    createDefaultProject("Melodica Project")
  );

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

      <div className="mt-6 rounded-lg border p-4 text-sm">
        <div><span className="font-medium">Name:</span><input style = {{textAlign: "right"}} type="text" value={project.name} onChange={(e) => setProject((p) => ({ ...p, name: e.target.value}))} /></div>
        <div><span className="font-medium">BPM:</span><input type="number" value={project.bpm} onChange={(e) => setProject((p) => ({ ...p, bpm: parseInt(e.target.value) }))} /></div>
        <div><span className="font-medium">Scale:</span> {project.scale}</div>
        <div><span className="font-medium">Octaves:</span> {project.octaves}</div>
        <div><span className="font-medium">Master Volume:</span> {project.settings.masterVolume}</div>
        <div><span className="font-medium">Reverb Wet:</span> {project.settings.reverbWet}</div>
        <div><span className="font-medium">Reverb Decay:</span> {project.settings.reverbDecay}</div>
        <div><span className="font-medium">Notes:</span> {project.notes.length}</div>
        <div><span className="font-medium">Reverb:</span> {project.settings.reverbWet}</div>
      </div>

      <button
        className="mt-6 rounded-md bg-black px-4 py-2 text-sm text-white"
        onClick={() =>
          setProject((p) => ({
            ...p,
            bpm: p.bpm + 1,
            updatedAt: Date.now(),
          }))
        }
      >
        BPM +1
      </button>
    </main>
  );
}