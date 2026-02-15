"use client";

import Link from "next/link";
import { useState , useEffect} from "react";
import { createDefaultProject } from "@/lib/defaultProject";
import type { Project } from "@/types/project";

export default function EditorPage() {
  const [project, setProject] = useState<Project>(() =>
    createDefaultProject("Melodica Project")
  );

  const [bpmText, setBpmText] = useState(String(project.bpm));


  return (
    <main className="min-h-screen pt-6 p-4 ">
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

      <div className="flex flex-row justify-evenly mt-6 rounded-lg border p-4 text-sm">
        <div><span className="font-md">Name:</span>
          <input style = {{textAlign: "left"}} type="text" value={project.name} onChange={(e) => setProject((p) => ({ ...p, name: e.target.value}))} size = {project.name.length}/>
        </div>
        <div><span className="font-medium">BPM:</span>
          <input
            className="w-fit"
            type="text"
            value={bpmText}
            onChange={(e) => {
              setBpmText(e.currentTarget.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const newVal = e.currentTarget.value.trim();
                const parsed = parseInt(newVal, 10);

                if (newVal === "" || Number.isNaN(parsed)) {
                  setBpmText(String(project.bpm));
                  return;
                }

                if (parsed < 20){
                  setBpmText("20");
                  return;
                }
                
                else if (parsed > 400) {
                  setBpmText("400");
                  return;
                }

                setProject((p) => {
                  return {
                    ...p,
                    bpm: parsed,
                    updatedAt: Date.now()
                  };
                });

                setBpmText(String(parsed));
                e.currentTarget.blur();
              }
            }}
            size={Math.max(2, bpmText.length)}
          />
        </div>
        <div><span className="font-medium">Scale:</span> {project.scale}</div>
        <div><span className="font-medium">Octaves:</span> {project.octaves}</div>
        <div><span className="font-medium">Master Volume:</span> {project.settings.masterVolume}</div>
        <div><span className="font-medium">Reverb Wet:</span> {project.settings.reverbWet}</div>
        <div><span className="font-medium">Reverb Decay:</span> {project.settings.reverbDecay}</div>
        <div><span className="font-medium">Notes:</span> {project.notes.length}</div>
        <div><span className="font-medium">Reverb:</span> {project.settings.reverbWet}</div>
      </div>
      <div className="max-h-100 overflow-auto flex flex-row mt-2 rounded-lg border pt-4 pl-1 text-sm">
        <div className = "flex flex-col mr-2 p-1 rounded-md border text-lg overflow-auto">
          <div className = "pt-1 pb-1">A</div>
          <div className = "pt-1 pb-1">B</div>
          <div className = "pt-1 pb-1">C</div>
          <div className = "pt-1 pb-1">D</div>
          <div className = "pt-1 pb-1">E</div>
          <div className = "pt-1 pb-1">F</div>
          <div className = "pt-1 pb-1">G</div>
          <div className = "pt-1 pb-1">A</div>
          <div className = "pt-1 pb-1">B</div>
          <div className = "pt-1 pb-1">C</div>
          <div className = "pt-1 pb-1">D</div>
          <div className = "pt-1 pb-1">E</div>
          <div className = "pt-1 pb-1">F</div>
          <div className = "pt-1 pb-1">G</div>
        </div>
        <div className = "ml-2 p-4 rounded-md border text-sm">small</div>
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
      <button
        className="mt-6 rounded-md bg-black px-4 py-2 text-sm text-white"
        onClick={() => {
          const newNote = {
            id: crypto.randomUUID(),
            pitch: "C4",
            startBeat: 0,
            durationBeats: 0.5,
            velocity: 0.5,
          };
          setProject((p) => ({
            ...p,
            notes: [...p.notes, newNote],
            updatedAt: Date.now(),
          }));
        }}
      >
        Add Note
      </button>
    </main>
  );
}