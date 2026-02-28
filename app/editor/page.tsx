"use client";

import Link from "next/link";
import * as Tone from "tone";
import { useEffect, useRef, useState } from "react";
import { createDefaultProject } from "@/lib/defaultProject";
import { getPitches } from "@/lib/pitches";
import type { Project, NoteEvent } from "@/types/project";

const GRID_BEATS = 160; // now "steps" (each step = 8th note)
const CELL_W = 25;
const CELL_H = 45;

// 8th-note grid: 2 steps per quarter note
const STEPS_PER_QUARTER = 2;

function stepSeconds(bpm: number) {
  return (60 / bpm) / STEPS_PER_QUARTER;
}

function noteOccupies(note: NoteEvent, pitch: string, beat: number): boolean {
  return (
    note.pitch === pitch &&
    note.startBeat <= beat &&
    beat < note.startBeat + note.durationBeats
  );
}

function getNoteAtStart(
  notes: NoteEvent[],
  pitch: string,
  beat: number
): NoteEvent | undefined {
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

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);

  const synthRef = useRef<Tone.PolySynth | null>(null);

  // Create synth once
  useEffect(() => {
    synthRef.current = new Tone.PolySynth(Tone.Synth).toDestination();
    return () => {
      synthRef.current?.dispose();
      synthRef.current = null;
    };
  }, []);

  // Simple scheduler (setInterval) using your grid steps
  useEffect(() => {
    if (!isPlaying) return;

    let beat = currentBeat;
    const intervalMs = stepSeconds(project.bpm) * 1000;

    const id = window.setInterval(() => {
      // play notes that start at this beat
      const notesToPlay = project.notes.filter((n) => n.startBeat === beat);

      for (const n of notesToPlay) {
        const durSec = n.durationBeats * stepSeconds(project.bpm);
        synthRef.current?.triggerAttackRelease(
          n.pitch,
          durSec,
          undefined,
          n.velocity
        );
      }

      beat = (beat + 1) % GRID_BEATS;
      setCurrentBeat(beat);
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [isPlaying, project.bpm, project.notes, currentBeat]);

  return (
    <main className="h-screen flex flex-col">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Editor</h1>
        <div className="mt-4 text-sm">
          <Link href="/dashboard" className="rounded-md border px-4 py-2 text-sm">
            Back to Dashboard
          </Link>
        </div>
      </header>

      <div className="flex flex-row justify-evenly mt-6 rounded-lg border p-4 text-sm">
        <div>
          <span className="font-md">Name:</span>
          <input
            style={{ textAlign: "left" }}
            type="text"
            value={project.name}
            onChange={(e) =>
              setProject((p) => ({ ...p, name: e.target.value, updatedAt: Date.now() }))
            }
            size={project.name.length}
          />
        </div>

        <div>
          <span className="font-medium">BPM:</span>
          <input
            className="w-fit"
            type="text"
            value={bpmText}
            onChange={(e) => setBpmText(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;

              const newVal = e.currentTarget.value.trim();
              const parsed = parseInt(newVal, 10);

              if (newVal === "" || Number.isNaN(parsed)) {
                setBpmText(String(project.bpm));
                return;
              }

              const clamped = Math.max(20, Math.min(400, parsed));

              setProject((p) => ({ ...p, bpm: clamped, updatedAt: Date.now() }));
              setBpmText(String(clamped));
              e.currentTarget.blur();
            }}
            size={Math.max(2, bpmText.length)}
          />
        </div>

        <div>
          <span className="font-medium">Scale:</span> {project.scale}
        </div>
        <div>
          <span className="font-medium">Octaves:</span> {project.octaves}
        </div>
        <div>
          <span className="font-medium">Master Volume:</span>{" "}
          {project.settings.masterVolume}
        </div>
        <div>
          <span className="font-medium">Reverb Wet:</span>{" "}
          {project.settings.reverbWet}
        </div>
        <div>
          <span className="font-medium">Reverb Decay:</span>{" "}
          {project.settings.reverbDecay}
        </div>
        <div>
          <span className="font-medium">Notes:</span> {project.notes.length}
        </div>
      </div>

      {/* Controls */}
      <div className="mt-3 flex gap-2">
        <button
          className="rounded-md bg-black px-4 py-2 text-sm text-white"
          onClick={async () => {
            await Tone.start(); // must be called from a user gesture
            setCurrentBeat(0);
            setIsPlaying(true);
          }}
        >
          Play
        </button>
        <button
          className="rounded-md border px-4 py-2 text-sm"
          onClick={() => setIsPlaying(false)}
        >
          Stop
        </button>
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
            className="grid rounded-sm bg-neutral-600"
            style={{
              gridTemplateColumns: `repeat(${GRID_BEATS}, ${CELL_W}px)`,
              gridTemplateRows: `repeat(${getPitches(project.scale, project.octaves).length}, ${CELL_H}px)`,
            }}
          >
            {getPitches(project.scale, project.octaves).map((pitch) =>
              Array.from({ length: GRID_BEATS }, (_, beat) => {
                const filled = hasNoteAt(project.notes, pitch, beat);
                const existing = getNoteAtStart(project.notes, pitch, beat);
                const isPlayhead = beat === currentBeat;

                return (
                  <button
                    key={`${pitch}-${beat}`}
                    type="button"
                    aria-label={`${pitch} beat ${beat} ${filled ? "on" : "off"}`}
                    className={`border-2 rounded-sm border-neutral-300 dark:border-neutral-600 p-0 cursor-pointer transition-colors ${
                      isPlayhead ? "ring-2 ring-yellow-400" : ""
                    } ${
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
                              durationBeats: 1, // 1 step = 1 eighth note
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

      {/* Your debug buttons (kept, but fixed duration to integer steps) */}
      <button
        className="mt-2 rounded-md bg-black px-4 py-2 text-sm text-white"
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
        className="mt-2 rounded-md bg-black px-4 py-2 text-sm text-white"
        onClick={() => {
          const newNote: NoteEvent = {
            id: crypto.randomUUID(),
            pitch: "C4",
            startBeat: 0,
            durationBeats: 1, // 1 step (8th note). Use 2 for a quarter note.
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