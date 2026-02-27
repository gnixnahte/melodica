"use client";

import Link from "next/link";
import { useState } from "react";
import { createDefaultProject } from "@/lib/defaultProject";
import { getPitches } from "@/lib/pitches";
import type { Project, NoteEvent } from "@/types/project";

const GRID_BEATS = 40;
const CELL_W = 55;
const CELL_H = 45;

function noteOccupies(note: NoteEvent, pitch: string, beat: number): boolean {
  return (
    note.pitch === pitch &&
    note.startBeat <= beat &&
    beat < note.startBeat + note.durationBeats
  );
}

function getNoteAtStart(notes: NoteEvent[], pitch: string, beat: number): NoteEvent | undefined {
  return notes.find((n) => n.pitch === pitch && n.startBeat === beat);
}

function hasNoteAt(notes: NoteEvent[], pitch: string, beat: number): boolean {
  return notes.some((n) => noteOccupies(n, pitch, beat));
}

export default function EditorPage() {
  const [project, setProject] = useState<Project>(() =>
    createDefaultProject("Melodica Project")
  );

  const [bpmText, setBpmText] = useState(String(project.bpm));


  return (
    <main className="h-screen flex flex-col">
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
      <div className="flex-1 overflow-auto border mt-2 mb-2 rounded-lg">
  <div className="flex flex-row pt-2 pb-2 pl-1 text-sm">
          <ul className="flex flex-col mr-2 py-0 px-1 rounded-md text-lg list-none shrink-0">
            {getPitches(project.scale, project.octaves).map((pitch) => (
              <li
                key={pitch}
                className="flex items-center shrink-0 pr-2 pl-2 rounded-md border"
                style={{ height: CELL_H, minHeight: CELL_H }}
              >
                {pitch}
              </li>
            ))}
          </ul>
            <div
              className="grid rounded-sm bg-neutral-600 "
              style={{
                gridTemplateColumns: `repeat(${GRID_BEATS}, ${CELL_W}px)`,
                gridTemplateRows: `repeat(${getPitches(project.scale, project.octaves).length}, ${CELL_H}px)`,
              }}
            >
              {getPitches(project.scale, project.octaves).map((pitch) =>
                Array.from({ length: GRID_BEATS }, (_, beat) => {
                  const filled = hasNoteAt(project.notes, pitch, beat);
                  const existing = getNoteAtStart(project.notes, pitch, beat);
                  return (
                    <button
                      key={`${pitch}-${beat}`}
                      type="button"
                      aria-label={`${pitch} beat ${beat} ${filled ? "on" : "off"}`}
                      className={`w-[${CELL_W}px] h-[${CELL_H}px] border-2 rounded-sm border-neutral-300 dark:border-neutral-600 p-0 cursor-pointer transition-colors ${
                        filled
                          ? "bg-emerald-500 hover:bg-emerald-600"
                          : "bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                      }`}
                      style={{ width: CELL_W, height: CELL_H }}
                      onClick={() => {
                        if (existing) {
                          setProject((p) => ({
                            ...p,
                            notes: p.notes.filter((n) => n.id !== existing.id),
                            updatedAt: Date.now(),
                          }));
                        } else {
                          setProject((p) => ({
                            ...p,
                            notes: [
                              ...p.notes,
                              {
                                id: crypto.randomUUID(),
                                pitch,
                                startBeat: beat,
                                durationBeats: 1,
                                velocity: 0.8,
                              },
                            ],
                            updatedAt: Date.now(),
                          }));
                        }
                      }}
                    />
                  );
                })
              )}
            </div>
        </div>
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