"use client";

import Link from "next/link";
import * as Tone from "tone";
import { useEffect, useRef, useState } from "react";
import { createDefaultProject } from "@/lib/defaultProject";
import { getPitches } from "@/lib/pitches";
import type { Project, NoteEvent } from "@/types/project";

const GRID_BEATS = 160; // each column = 1 eighth note
const CELL_W = 25;
const CELL_H = 45;

const STEPS_PER_QUARTER = 2; // 8th-note grid
const STEPS_PER_BAR = 8; // 4/4 bar = 8 eighth notes

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

  // Playhead state that works with dragging + setInterval
  const playheadRef = useRef(0);
  const isScrubbingRef = useRef(false);
  const rulerRef = useRef<HTMLDivElement | null>(null);

  const setPlayhead = (beat: number) => {
    const clamped = Math.max(0, Math.min(GRID_BEATS - 1, beat));
    playheadRef.current = clamped;
    setCurrentBeat(clamped);
  };

  const beatFromClientX = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.floor(x / CELL_W);
  };

  // Create synth once
  useEffect(() => {
    synthRef.current = new Tone.PolySynth(Tone.Synth).toDestination();
    return () => {
      synthRef.current?.dispose();
      synthRef.current = null;
    };
  }, []);

  // Mouse up anywhere ends scrubbing
  useEffect(() => {
    const onUp = () => (isScrubbingRef.current = false);
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  // Playback loop starts from playheadRef (NOT from 0)
  useEffect(() => {
    if (!isPlaying) return;

    let beat = playheadRef.current; // ✅ start from current playhead position
    const intervalMs = stepSeconds(project.bpm) * 1000;

    const id = window.setInterval(() => {
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
      playheadRef.current = beat; // keep ref in sync
      setCurrentBeat(beat);       // update UI
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [isPlaying, project.bpm, project.notes]);

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
              setProject((p) => ({
                ...p,
                name: e.target.value,
                updatedAt: Date.now(),
              }))
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

      <div className="mt-3 flex gap-2">
        <button
          className="rounded-md bg-black px-4 py-2 text-sm text-white"
          onClick={async () => {
            await Tone.start();
            // ✅ do NOT reset to 0; start from wherever the playhead currently is
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
          {/* Left labels column */}
          <div className="flex flex-col mr-2 shrink-0">
            {/* Spacer to match ruler height */}
            <div className="h-8 mb-1" />

            <ul className="flex flex-col py-0 px-1 rounded-md text-lg list-none">
              {getPitches(project.scale, project.octaves).map((pitch) => (
                <li
                  key={pitch}
                  className="flex items-center pr-2 pl-2 rounded-md border"
                  style={{ height: CELL_H, minHeight: CELL_H }}
                >
                  {pitch}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col">
            {/* Ruler / playhead tab row */}
            <div
              ref={rulerRef}
              className="relative h-8 mb-1 rounded-sm bg-neutral-700 select-none"
              style={{ width: GRID_BEATS * CELL_W }}
              onMouseDown={(e) => {
                if (!rulerRef.current) return;
                const b = beatFromClientX(e.clientX, rulerRef.current);
                setPlayhead(b);
                isScrubbingRef.current = true;
              }}
              onMouseMove={(e) => {
                if (!isScrubbingRef.current) return;
                if (!rulerRef.current) return;
                const b = beatFromClientX(e.clientX, rulerRef.current);
                setPlayhead(b);
              }}
            >
              {/* Vertical playhead line */}
              <div
                className="absolute top-0 bottom-[-650] w-[2px] bg-yellow-400"
                style={{ left: currentBeat * CELL_W }}
              />

              {/* Draggable tab */}
              <div
                className="absolute top-0 h-8 w-4 -translate-x-1/2 cursor-grab active:cursor-grabbing"
                style={{ left: currentBeat * CELL_W }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  isScrubbingRef.current = true;
                }}
              >
                <div className="mx-auto mt-1 h-6 w-3 rounded-sm bg-yellow-400 shadow" />
              </div>
            </div>

            {/* Grid */}
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

                  const barIndex = Math.floor(beat / STEPS_PER_BAR);
                  const isAltBar = barIndex % 2 === 1;

                  return (
                    <button
                      key={`${pitch}-${beat}`}
                      type="button"
                      aria-label={`${pitch} beat ${beat} ${filled ? "on" : "off"}`}
                      className={`rounded-sm p-0 cursor-pointer transition-colors
                        border border-neutral-400 dark:border-neutral-600
                        ${
                          filled
                            ? "bg-emerald-500 hover:bg-emerald-600"
                            : isAltBar
                              ? "bg-neutral-300 dark:bg-neutral-800 hover:bg-neutral-400 dark:hover:bg-neutral-700"
                              : "bg-neutral-200 dark:bg-neutral-900 hover:bg-neutral-300 dark:hover:bg-neutral-800"
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
      </div>

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
            durationBeats: 1,
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