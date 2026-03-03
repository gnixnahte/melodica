"use client";

import Link from "next/link";
import * as Tone from "tone";
import { useEffect, useRef, useState } from "react";
import { createDefaultProject } from "@/lib/defaultProject";
import { getPitches, ALL_MAJOR_KEYS, ALL_MINOR_KEYS } from "@/lib/pitches";
import type { KeyRoot, ScaleFamily } from "@/lib/pitches";
import type { Project, NoteEvent, DrumTrack } from "@/types/project";

const GRID_BEATS = 160; // each column = 1 eighth note
const CELL_W = 25;
const CELL_H = 45;
const DRUM_STEPS_PER_QUARTER = 4; // 16th notes
const DRUM_GRID_BEATS = GRID_BEATS * 2; 
const DRUM_STEPS_PER_BAR = 16;    // 16ths per bar in 4/4

const NOTE_STEPS_PER_QUARTER = 2; // 8th-note grid
const STEPS_PER_BAR = 8; // 4/4 bar = 8 eighth notes

function clockStepSeconds(bpm: number) {
  return (60 / bpm) / DRUM_STEPS_PER_QUARTER; // ✅ 16th-note clock
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
  const [currentStep16, setCurrentStep16] = useState(0);
  const [currentBeat, setCurrentBeat] = useState(0);
  const playheadStep16Ref = useRef(0);

  //synth and keys setup
  const keys = project.scaleFamily === "MAJOR" ? ALL_MAJOR_KEYS : ALL_MINOR_KEYS;
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const kickRef = useRef<Tone.MembraneSynth[]>([]);
  const snareRef = useRef<Tone.NoiseSynth[]>([]);
  const hatRef = useRef<Tone.MetalSynth[]>([]);
  const tomRef = useRef<Tone.MembraneSynth[]>([]);

  // Playhead state that works with dragging + setInterval
  const playheadRef = useRef(0);
  const isScrubbingRef = useRef(false);
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const pitches = getPitches(project.keyRoot, project.scaleFamily, project.lowOctave, project.highOctave);
  const pitchSet = new Set(pitches);

  const noteScrollRef = useRef<HTMLDivElement | null>(null);
  const drumScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingScrollRef = useRef<"notes" | "drums" | null>(null);

  const DRUM_CELL_W = CELL_W / 2; // 16th cell width

  const [scrollLeft, setScrollLeft] = useState(0);

  const playheadPxNotes = currentBeat * CELL_W;
  const playheadPxDrums = currentBeat * CELL_W/2 * 2; // because drums have 2x columns

  const syncScroll = (from: "notes" | "drums") => {
    if (!noteScrollRef.current || !drumScrollRef.current) return;
    if (syncingScrollRef.current && syncingScrollRef.current !== from) return;
  
    syncingScrollRef.current = from;
  
    const newLeft =
      from === "notes"
        ? noteScrollRef.current.scrollLeft
        : drumScrollRef.current.scrollLeft;
  
    setScrollLeft(newLeft);
  
    if (from === "notes") {
      drumScrollRef.current.scrollLeft = newLeft;
    } else {
      noteScrollRef.current.scrollLeft = newLeft;
    }
  
    requestAnimationFrame(() => {
      syncingScrollRef.current = null;
    });
  };

  // Convert "C#" + 4 => "C#4"
  const keyToMidi = (key: KeyRoot, octave = 4) =>
    Tone.Frequency(`${key}${octave}`).toMidi();

  const transposeNotes = (notes: NoteEvent[], semitones: number) =>
    notes.map((n) => {
      const midi = Tone.Frequency(n.pitch).toMidi();
      const newMidi = midi + semitones;
      const newPitch = Tone.Frequency(newMidi, "midi").toNote(); // Tone-safe name like "C#4"
      return { ...n, pitch: newPitch };
    });

  const handleKeyChange = (newKey: KeyRoot) => {
    setProject((p) => {
      const semitones = keyToMidi(newKey) - keyToMidi(p.keyRoot);

      return {
        ...p,
        keyRoot: newKey,
        notes: transposeNotes(p.notes, semitones),
        updatedAt: Date.now(),
      };
    });
  };

  const setPlayhead = (beat8: number) => {
    const clamped8 = Math.max(0, Math.min(GRID_BEATS - 1, beat8));
    const step16 = clamped8 * 2;
    playheadStep16Ref.current = step16;
    setCurrentStep16(step16);
  };

  const beatFromClientX = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.floor(x / CELL_W);
  };

  // Create synth once
  useEffect(() => {
    // ===== MELODY SYNTH (poly) =====
    synthRef.current = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.01, decay: 0.15, sustain: 0.4, release: 0.25 },
    }).toDestination();
  
    // ===== DRUMS: 3 variants each =====
  
    // KICKS (tight / boomy / clicky)
    kickRef.current = [
      new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 7,
        envelope: { attack: 0.001, decay: 0.16, sustain: 0 },
      }).toDestination(),
  
      new Tone.MembraneSynth({
        pitchDecay: 0.06,
        octaves: 10,
        envelope: { attack: 0.001, decay: 0.30, sustain: 0 },
      }).toDestination(),
  
      new Tone.MembraneSynth({
        pitchDecay: 0.03,
        octaves: 6,
        envelope: { attack: 0.001, decay: 0.12, sustain: 0 },
      }).toDestination(),
    ];
  
    // SNARES (crisp / thicker / tight)
    snareRef.current = [
      new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.12, sustain: 0 },
      }).toDestination(),
  
      new Tone.NoiseSynth({
        noise: { type: "pink" },
        envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
      }).toDestination(),
  
      new Tone.NoiseSynth({
        noise: { type: "brown" },
        envelope: { attack: 0.001, decay: 0.08, sustain: 0 },
      }).toDestination(),
    ];
  
    // HATS (short / open-ish / bright)
    hatRef.current = [
      (() => {
        const h = new Tone.MetalSynth({
          envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
          harmonicity: 5.1,
          modulationIndex: 28,
          resonance: 2500,
          octaves: 1.2,
        }).toDestination();
        h.frequency.value = 250;
        return h;
      })(),
    
      (() => {
        const h = new Tone.MetalSynth({
          envelope: { attack: 0.001, decay: 0.11, release: 0.02 },
          harmonicity: 5.1,
          modulationIndex: 32,
          resonance: 3500,
          octaves: 1.6,
        }).toDestination();
        h.frequency.value = 300;
        return h;
      })(),
    
      (() => {
        const h = new Tone.MetalSynth({
          envelope: { attack: 0.001, decay: 0.07, release: 0.01 },
          harmonicity: 5.1,
          modulationIndex: 40,
          resonance: 5200,
          octaves: 1.4,
        }).toDestination();
        h.frequency.value = 220;
        return h;
      })(),
    ];
  
    // TOMS (low / mid / high)
    tomRef.current = [
      new Tone.MembraneSynth({
        pitchDecay: 0.03,
        octaves: 4,
        envelope: { attack: 0.001, decay: 0.22, sustain: 0 },
      }).toDestination(),
  
      new Tone.MembraneSynth({
        pitchDecay: 0.025,
        octaves: 3,
        envelope: { attack: 0.001, decay: 0.20, sustain: 0 },
      }).toDestination(),
  
      new Tone.MembraneSynth({
        pitchDecay: 0.02,
        octaves: 2,
        envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
      }).toDestination(),
    ];
  
    // ===== CLEANUP =====
    return () => {
      synthRef.current?.dispose();
      synthRef.current = null;
  
      [...kickRef.current, ...snareRef.current, ...hatRef.current, ...tomRef.current].forEach(
        (inst) => inst.dispose()
      );
  
      kickRef.current = [];
      snareRef.current = [];
      hatRef.current = [];
      tomRef.current = [];
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
  
    let step16 = playheadStep16Ref.current; // ✅ 16th start
    const intervalMs = clockStepSeconds(project.bpm) * 1000;
  
    const id = window.setInterval(() => {
      // ===== DRUMS (16th grid) =====
      const drumHitsNow = project.drumTracks
        .flatMap((t) => t.hits)
        .filter((h) => h.step === step16);
  
      for (const h of drumHitsNow) {
        const v = h.velocity ?? 0.9;
        const i = h.variant ?? 0;
  
        if (h.drum === "kick") kickRef.current[i]?.triggerAttackRelease("C1", "16n", undefined, v);
        if (h.drum === "snare") snareRef.current[i]?.triggerAttackRelease("16n", undefined, v);
        if (h.drum === "hat") hatRef.current[i]?.triggerAttackRelease("16n", v);
        if (h.drum === "tom") tomRef.current[i]?.triggerAttackRelease("G2", "16n", undefined, v);
      }
  
      // ===== MELODIC NOTES (8th grid) =====
      // Only trigger melodic checks on EVEN 16th steps (0,2,4...) -> aligns with 8ths
      if (step16 % 2 === 0) {
        const beat8 = step16 / 2;
  
        const notesToPlay = project.notes.filter((n) => n.startBeat === beat8);
        for (const n of notesToPlay) {
          const durSec = n.durationBeats * (60 / project.bpm) / NOTE_STEPS_PER_QUARTER;
          synthRef.current?.triggerAttackRelease(n.pitch, durSec, undefined, n.velocity);
        }
      }
  
      // ===== ADVANCE PLAYHEAD =====
      step16 = (step16 + 1) % DRUM_GRID_BEATS;
      playheadStep16Ref.current = step16;
      setCurrentStep16(step16);
    }, intervalMs);
  
    return () => window.clearInterval(id);
  }, [isPlaying, project.bpm, project.notes, project.drumTracks]);

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
        <div className="flex items-center gap-2">
          <span className="font-medium">Scale:</span>
          <select
            className="w-fit rounded-md border px-2 py-0.5 text-sm bg-white dark:bg-neutral-900"
            value={project.scaleFamily}
            onChange={(e) =>
              setProject((p) => ({
                ...p,
                scaleFamily: e.target.value as ScaleFamily,
                updatedAt: Date.now(),
              }))
            }
          >
            <option value="MAJOR">Major</option>
            <option value="MINOR">Minor</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium">Key:</span>
          <select
            value={project.keyRoot}
            onChange={(e) => handleKeyChange(e.target.value as KeyRoot)}
          >
            {keys.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium">Low:</span>
          <input
            type="number"
            className="w-14 rounded-md border px-2 py-0.5 text-sm"
            value={project.lowOctave}
            onChange={(e) =>
              setProject((p) => ({
                ...p,
                lowOctave: Number(e.target.value),
                updatedAt: Date.now(),
              }))
            }
          />

          <span className="font-medium">High:</span>
          <input
            type="number"
            className="w-14 rounded-md border px-2 py-0.5 text-sm"
            value={project.highOctave}
            onChange={(e) =>
              setProject((p) => ({
                ...p,
                highOctave: Number(e.target.value),
                updatedAt: Date.now(),
              }))
            }
          />
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
          {/* labels column stays fixed */}
          <div className="flex flex-col mr-2 shrink-0">
            <div className="h-8 mb-1" />
            <ul className="flex flex-col py-0 px-1 rounded-md text-lg list-none">
              {pitches.map((pitch) => (
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

          {/* ✅ THIS is the horizontally-scrollable right side */}
          <div
            ref={noteScrollRef}
            onScroll={() => syncScroll("notes")}
            className="relative overflow-x-auto"
            style={{ width: "100%" }}
          >
            {/* playhead line (notes) */}
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-yellow-400 pointer-events-none z-20"
              style={{ left: (currentStep16 / 2) * CELL_W }}            />

            {/* ruler */}
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
              {/* draggable tab */}
              <div
                className="absolute top-0 h-8 w-4 -translate-x-1/2 cursor-grab active:cursor-grabbing z-30"
                style={{ left: currentBeat * CELL_W }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  isScrubbingRef.current = true;
                }}
              >
                <div className="mx-auto mt-1 h-6 w-3 rounded-sm bg-yellow-400 shadow" />
              </div>
            </div>

            {/* grid */}
            <div
              className="grid rounded-sm bg-neutral-600"
              style={{
                gridTemplateColumns: `repeat(${GRID_BEATS}, ${CELL_W}px)`,
                gridTemplateRows: `repeat(${getPitches(project.keyRoot, project.scaleFamily, project.lowOctave, project.highOctave).length}, ${CELL_H}px)`,
              }}
            >
              {getPitches(project.keyRoot, project.scaleFamily, project.lowOctave, project.highOctave).map((pitch) =>
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

      {/* ===== DRUM SEQUENCER (always visible) ===== */}
      <div className="shrink-0 border-t bg-neutral-50 dark:bg-neutral-950 p-2">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium">Drums</div>

          <button
            className="rounded-md border px-3 py-1 text-sm"
            onClick={() =>
              setProject((p) => ({
                ...p,
                drumTracks: [
                  ...p.drumTracks,
                  { id: crypto.randomUUID(), drum: "kick", variant: 0, hits: [] },
                ],
                updatedAt: Date.now(),
              }))
            }
          >
            + Add lane
          </button>
        </div>

        <div className="flex gap-2">
          {/* LEFT FIXED CONTROLS (not scrollable) */}
          <div className="w-14 shrink-0 space-y-2">
            {project.drumTracks.map((track) => (
              <button
                key={track.id}
                className="w-full h-6 rounded-md border text-xs"
                type="button"
              >
                {track.drum}
              </button>
            ))}
          </div>

          {/* RIGHT SCROLL AREA (only grid) */}
          <div
            ref={drumScrollRef}
            onScroll={() => syncScroll("drums")}
            className="relative overflow-x-auto"
            style={{ width: "100%" }}
          >
            {/* playhead line (drums) */}
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-yellow-400 pointer-events-none z-20"
              style={{ left: currentStep16 * (CELL_W / 2) }}
            />

            <div className="space-y-2" style={{ width: GRID_BEATS * CELL_W }}>
              {project.drumTracks.map((track) => (
                <div key={track.id} className="grid" style={{ gridTemplateColumns: `repeat(${DRUM_GRID_BEATS}, ${CELL_W / 2}px)` }}>
                  {Array.from({ length: DRUM_GRID_BEATS }, (_, step) => {
                    const hit = track.hits.find((h) => h.step === step);
                    const isAltBar = step % 2 === 1;

                    return (
                      <button
                        key={`${track.id}-${step}`}
                        className={`h-6 border border-neutral-300 dark:border-neutral-700 transition-colors
                          ${
                            hit
                              ? "bg-emerald-500 hover:bg-emerald-600"
                              : isAltBar
                                ? "bg-neutral-200 dark:bg-neutral-900 hover:bg-neutral-300 dark:hover:bg-neutral-800"
                                : "bg-white dark:bg-neutral-950 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                          }`}
                        style={{ width: CELL_W / 2 }}
                        onClick={() => {
                          setProject((p) => ({
                            ...p,
                            drumTracks: p.drumTracks.map((t) => {
                              if (t.id !== track.id) return t;

                              const existing = t.hits.find((h) => h.step === step);
                              if (existing) {
                                return { ...t, hits: t.hits.filter((h) => h.id !== existing.id) };
                              }

                              return {
                                ...t,
                                hits: [
                                  ...t.hits,
                                  {
                                    id: crypto.randomUUID(),
                                    drum: t.drum,
                                    step,
                                    velocity: 0.9,
                                    variant: t.variant,
                                  },
                                ],
                              };
                            }),
                            updatedAt: Date.now(),
                          }));
                        }}
                      />
                    );
                  })}
                </div>
              ))}
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