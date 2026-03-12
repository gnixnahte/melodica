"use client";

import Link from "next/link";
import * as Tone from "tone";
import { useEffect, useMemo, useRef, useState } from "react";
import { createDefaultProject } from "@/lib/defaultProject";
import { getPitches, ALL_MAJOR_KEYS, ALL_MINOR_KEYS } from "@/lib/pitches";
import type { KeyRoot, ScaleFamily } from "@/lib/pitches";
import type { Project, NoteEvent, DrumTrack, MelodyInstrument } from "@/types/project";


const NOTE_STEPS_PER_BAR = 8;
const DRUM_STEPS_PER_BAR = 16;    // 16ths per bar in 4/4
const NOTE_RENDER_BUFFER_COLS = 32;
const DRUM_RENDER_BUFFER_STEPS = 64;


const CELL_W = 25;
const CELL_H = 45;
const DRUM_STEPS_PER_QUARTER = 4; // 16th notes
const DRUM_STEPS_PER_BEAT = 4; // 4 sixteenths = 1 quarter note

const NOTE_STEPS_PER_QUARTER = 2; // 8th-note grid
const STEPS_PER_BAR = 8; // 4/4 bar = 8 eighth notes
const NOTE_RESIZE_HANDLE_PX = 6;
const MELODY_INSTRUMENTS = ["Triangle", "Saw", "Square", "FM Bell", "AM Pad", "Duo Lead"] as const;
const NOTE_INSTRUMENT_COLORS: Record<MelodyInstrument, string> = {
  Triangle: "bg-emerald-500 hover:bg-emerald-600",
  Saw: "bg-cyan-500 hover:bg-cyan-600",
  Square: "bg-sky-500 hover:bg-sky-600",
  "FM Bell": "bg-amber-500 hover:bg-amber-600",
  "AM Pad": "bg-fuchsia-500 hover:bg-fuchsia-600",
  "Duo Lead": "bg-rose-500 hover:bg-rose-600",
};

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

function hasNoteAt(notes: NoteEvent[], pitch: string, beat: number): boolean {
  return notes.some((n) => noteOccupies(n, pitch, beat));
}

function getNoteOccupying(
  notes: NoteEvent[],
  pitch: string,
  beat: number
): NoteEvent | undefined {
  return notes.find((n) => noteOccupies(n, pitch, beat));
}

function normalizeInstrument(instrument?: MelodyInstrument): MelodyInstrument {
  if (!instrument) return "Triangle";
  return MELODY_INSTRUMENTS.includes(instrument) ? instrument : "Triangle";
}

function createMelodySynthPreset(instrument: MelodyInstrument) {
  // Short release so notes stop when the playhead passes the end of the note (no reverb tail).
  const shortRelease = 0.04;
  switch (instrument) {
    case "Saw":
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.01, decay: 0.08, sustain: 0.45, release: shortRelease },
      }).toDestination();
    case "Square":
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "square" },
        envelope: { attack: 0.005, decay: 0.05, sustain: 0.35, release: shortRelease },
      }).toDestination();
    case "FM Bell":
      return new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3,
        modulationIndex: 8,
        envelope: { attack: 0.005, decay: 0.25, sustain: 0.1, release: shortRelease },
      }).toDestination();
    case "AM Pad":
      return new Tone.PolySynth(Tone.AMSynth, {
        harmonicity: 1.5,
        envelope: { attack: 0.08, decay: 0.2, sustain: 0.55, release: shortRelease },
      }).toDestination();
    case "Duo Lead":
      return new Tone.PolySynth(Tone.DuoSynth, {
        vibratoAmount: 0.3,
        vibratoRate: 5,
        harmonicity: 1.5,
      }).toDestination();
    case "Triangle":
    default:
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.01, decay: 0.01, sustain: 0.4, release: shortRelease },
      }).toDestination();
  }
}
type MelodyPolySynth = ReturnType<typeof createMelodySynthPreset>;

export default function EditorPage() {
  type NoteMenuState = {
    noteId: string;
    x: number;
    y: number;
  };
  
  const [project, setProject] = useState<Project>(() =>
    createDefaultProject("Melodica Project")
  );
  const [bpmText, setBpmText] = useState(String(project.bpm));
  const [barsText, setBarsText] = useState(String(project.bars));
  const [lowOctaveText, setLowOctaveText] = useState(String(project.lowOctave));
  const [highOctaveText, setHighOctaveText] = useState(String(project.highOctave));
  
  useEffect(() => {
    setLowOctaveText(String(project.lowOctave));
  }, [project.lowOctave]);
  
  useEffect(() => {
    setHighOctaveText(String(project.highOctave));
  }, [project.highOctave]);

  useEffect(() => {
    setBarsText(String(project.bars));
  }, [project.bars]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep16, setCurrentStep16] = useState(0);
  const [metronomeOn, setMetronomeOn] = useState(true);
  const [defaultInstrument, setDefaultInstrument] = useState<MelodyInstrument>("Triangle");
  const [noteMenu, setNoteMenu] = useState<NoteMenuState | null>(null);

  //synth and keys setup
  const keys = project.scaleFamily === "MAJOR" ? ALL_MAJOR_KEYS : ALL_MINOR_KEYS;
  const synthBankRef = useRef<Map<MelodyInstrument, MelodyPolySynth>>(new Map());
  const kickRef = useRef<Tone.MembraneSynth[]>([]);
  const snareRef = useRef<Tone.NoiseSynth[]>([]);
  const hatRef = useRef<Tone.MetalSynth[]>([]);
  const tomRef = useRef<Tone.MembraneSynth[]>([]);
  const metroRef = useRef<Tone.MembraneSynth | null>(null);
  const metroEventRef = useRef<number | null>(null);
  const lastPreviewTimeRef = useRef<Record<string, number>>({});
  const noteDeleteTimeoutRef = useRef<number | null>(null);
  const noteMenuRef = useRef<HTMLDivElement | null>(null);
  const noteResizeRef = useRef<{ noteId: string; pitch: string; startBeat: number } | null>(null);
  const suppressDeleteClickRef = useRef(false);
  const justSpawnedNoteIdRef = useRef<string | null>(null);

  const isScrubbingRef = useRef(false);
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const pitches = getPitches(project.keyRoot, project.scaleFamily, project.lowOctave, project.highOctave);
  const pitchSet = new Set(pitches);

  const noteScrollRef = useRef<HTMLDivElement | null>(null);
  const drumScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingScrollRef = useRef<"notes" | "drums" | null>(null);

  const DRUM_CELL_W = CELL_W / 2; // 16th cell width

  const GRID_BEATS = project.bars * NOTE_STEPS_PER_BAR; // each column = 1 eighth note
  const DRUM_GRID_BEATS = project.bars * DRUM_STEPS_PER_BAR;

  const [scrollLeft, setScrollLeft] = useState(0);
  const [noteViewportWidth, setNoteViewportWidth] = useState(0);
  const [drumViewportWidth, setDrumViewportWidth] = useState(0);
  const playheadStep16Ref = useRef(0);

  const notePlayheadPx = (currentStep16 / 2) * CELL_W;
  const playheadLeftOfView = notePlayheadPx < scrollLeft;
  const playheadRightOfView = notePlayheadPx > scrollLeft + noteViewportWidth;
  const playheadBar = Math.floor((currentStep16 / 2) / NOTE_STEPS_PER_BAR) + 1;
  const BAR_WIDTH_PX = NOTE_STEPS_PER_BAR * CELL_W;
  const indicatorPadding = 44;
  const playheadInViewPx = notePlayheadPx - scrollLeft;
  const indicatorMaxX = Math.max(indicatorPadding, noteViewportWidth - indicatorPadding);
  const playheadIndicatorX = Math.max(
    indicatorPadding,
    Math.min(indicatorMaxX, playheadInViewPx)
  );
  const playheadIndicatorLabel = playheadLeftOfView
    ? `\u25C0 Bar ${playheadBar}`
    : playheadRightOfView
      ? `Bar ${playheadBar} \u25B6`
      : `Bar ${playheadBar}`;

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

  useEffect(() => {
    const noteEl = noteScrollRef.current;
    const drumEl = drumScrollRef.current;
    if (!noteEl || !drumEl) return;

    const updateWidths = () => {
      setNoteViewportWidth(noteEl.clientWidth);
      setDrumViewportWidth(drumEl.clientWidth);
    };

    updateWidths();

    const observer = new ResizeObserver(updateWidths);
    observer.observe(noteEl);
    observer.observe(drumEl);

    return () => observer.disconnect();
  }, []);

  const noteWindow = useMemo(() => {
    const viewportCols = Math.ceil(noteViewportWidth / CELL_W);
    const start = Math.max(0, Math.floor(scrollLeft / CELL_W) - NOTE_RENDER_BUFFER_COLS);
    const end = Math.min(
      GRID_BEATS,
      Math.ceil((scrollLeft + noteViewportWidth) / CELL_W) + NOTE_RENDER_BUFFER_COLS
    );
    const safeEnd = Math.max(end, start + Math.max(1, viewportCols));

    return {
      start,
      end: Math.min(GRID_BEATS, safeEnd),
    };
  }, [GRID_BEATS, noteViewportWidth, scrollLeft]);

  const drumWindow = useMemo(() => {
    const viewportSteps = Math.ceil(drumViewportWidth / DRUM_CELL_W);
    const start = Math.max(0, Math.floor(scrollLeft / DRUM_CELL_W) - DRUM_RENDER_BUFFER_STEPS);
    const end = Math.min(
      DRUM_GRID_BEATS,
      Math.ceil((scrollLeft + drumViewportWidth) / DRUM_CELL_W) + DRUM_RENDER_BUFFER_STEPS
    );
    const safeEnd = Math.max(end, start + Math.max(1, viewportSteps));

    return {
      start,
      end: Math.min(DRUM_GRID_BEATS, safeEnd),
    };
  }, [DRUM_CELL_W, DRUM_GRID_BEATS, drumViewportWidth, scrollLeft]);

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

  const setPlayheadStep16 = (step16: number) => {
    const clamped = Math.max(0, Math.min(DRUM_GRID_BEATS - 1, step16));
    playheadStep16Ref.current = clamped;
    setCurrentStep16(clamped);
  };

  const getMelodySynth = (instrument: MelodyInstrument) => {
    const normalized = normalizeInstrument(instrument);
    const existing = synthBankRef.current.get(normalized);
    if (existing) return existing;

    const created = createMelodySynthPreset(normalized);
    synthBankRef.current.set(normalized, created);
    return created;
  };

  const clearPendingNoteDelete = () => {
    if (noteDeleteTimeoutRef.current === null) return;
    window.clearTimeout(noteDeleteTimeoutRef.current);
    noteDeleteTimeoutRef.current = null;
  };

  const stopNoteResize = () => {
    noteResizeRef.current = null;
  };

  const updateNoteById = (noteId: string, patch: Partial<NoteEvent>) => {
    setProject((p) => ({
      ...p,
      notes: p.notes.map((n) => (n.id === noteId ? { ...n, ...patch } : n)),
      updatedAt: Date.now(),
    }));
  };

  const updateDraggedNoteDuration = (hoverBeat: number, pointerOffsetX: number) => {
    const resize = noteResizeRef.current;
    if (!resize) return;

    // Half-cell threshold: resize only after crossing halfway into the hovered cell.
    const endExclusive = Math.max(
      resize.startBeat + 1,
      hoverBeat + (pointerOffsetX >= CELL_W / 2 ? 1 : 0)
    );
    const nextDuration = endExclusive - resize.startBeat;
    updateNoteById(resize.noteId, { durationBeats: nextDuration });
  };

  const previewNote = async (
    pitch: string,
    velocity = 0.8,
    instrument: MelodyInstrument = defaultInstrument
  ) => {
    await Tone.start(); // unlock audio if needed
    const dur = 0.12;   // seconds (short “tap”)
    getMelodySynth(instrument).triggerAttackRelease(pitch, dur, undefined, velocity);
  };

  const previewDrum = async (
    drum: "kick" | "snare" | "hat" | "tom",
    variant = 0,
    velocity = 0.9
  ) => {
    const key = `${drum}:${variant}`;
    const now = Tone.now();

    const last = lastPreviewTimeRef.current[key] ?? 0;
    const t = Math.max(now + 0.01, last + 0.001); // ✅ strictly increasing

    lastPreviewTimeRef.current[key] = t;

    if (drum === "kick")
      kickRef.current[variant]?.triggerAttackRelease("C1", "16n", undefined, velocity);
  
    if (drum === "snare")
      snareRef.current[variant]?.triggerAttackRelease("16n", undefined, velocity);
  
    if (drum === "hat")
      hatRef.current[variant]?.triggerAttackRelease("16n", velocity);
  
    if (drum === "tom")
      tomRef.current[variant]?.triggerAttackRelease("G2", "16n", undefined, velocity);
  };


  function step16FromClientX(clientX: number, el: HTMLElement, scrollOffsetPx = 0) {
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + scrollOffsetPx;
    // 16th notes = half the width of an 8th-note cell
    return Math.floor(x / (CELL_W / 2));
  }

  useEffect(() => {
    const synthBank = synthBankRef.current;
    return () => {
      synthBank.forEach((synth) => synth.dispose());
      synthBank.clear();
    };
  }, []);

  // Create drums + metronome once
  useEffect(() => {
    // create METRONOME //
    metroRef.current = new Tone.MembraneSynth({
      pitchDecay: 0.008,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.01 },
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
      metroRef.current?.dispose();
      metroRef.current = null;
  
      [...kickRef.current, ...snareRef.current, ...hatRef.current, ...tomRef.current].forEach(
        (inst) => inst.dispose()
      );
  
      kickRef.current = [];
      snareRef.current = [];
      hatRef.current = [];
      tomRef.current = [];
    };
  }, []);

  // Mouse up anywhere ends scrubbing; global mousemove for smooth note resize drag
  useEffect(() => {
    const onUp = () => {
      isScrubbingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      stopNoteResize();
    };

    const onMouseMove = (e: MouseEvent) => {
      const resize = noteResizeRef.current;
      if (!resize) return;
      const el = noteScrollRef.current;
      if (!el) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const scrollLeft = el.scrollLeft;
      const xInGrid = e.clientX - rect.left + scrollLeft;
      let beat = Math.floor(xInGrid / CELL_W);
      let offsetX = xInGrid - beat * CELL_W;
      if (beat < 0) {
        beat = 0;
        offsetX = 0;
      } else if (beat >= GRID_BEATS) {
        beat = GRID_BEATS - 1;
        offsetX = CELL_W - 0.01;
      }
      updateDraggedNoteDuration(beat, offsetX);
    };

    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMouseMove, { passive: false });
    return () => {
      clearPendingNoteDelete();
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, [GRID_BEATS]);

  useEffect(() => {
    if (!noteMenu) return;

    const onMouseDown = (event: MouseEvent) => {
      if (!noteMenuRef.current) return;
      if (noteMenuRef.current.contains(event.target as Node)) return;
      setNoteMenu(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNoteMenu(null);
    };

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [noteMenu]);

  const selectedNote = noteMenu
    ? project.notes.find((n) => n.id === noteMenu.noteId) ?? null
    : null;

	  // Playback loop starts from current playhead position (NOT from 0)
  useEffect(() => {
    if (!isPlaying) return;
  
    Tone.Transport.bpm.value = project.bpm;
  
    let step16 = playheadStep16Ref.current;

    const id = Tone.Transport.scheduleRepeat((time) => {
      // play melodic notes only on EVEN 16ths (i.e. every 8th)
      if (step16 % 2 === 0) {
        const beat8 = step16 / 2;
        const notesToPlay = project.notes.filter(n => n.startBeat === beat8);

        for (const n of notesToPlay) {
          const instrument = normalizeInstrument(n.instrument);
          const dur = (n.durationBeats / 2) + "n"; // quick hack; better: compute seconds
          getMelodySynth(instrument).triggerAttackRelease(n.pitch, dur, time, n.velocity);
        }
      }
  
      // drums on every 16th
      const drumHitsNow = project.drumTracks
        .flatMap(t => t.hits)
        .filter(h => h.step === step16);
  
      for (const h of drumHitsNow) {
        const v = h.velocity ?? 0.9;
        const i = h.variant ?? 0;
  
        if (h.drum === "kick") kickRef.current[i]?.triggerAttackRelease("C1", "16n", time, v);
        if (h.drum === "snare") snareRef.current[i]?.triggerAttackRelease("16n", time, v);
        if (h.drum === "hat") hatRef.current[i]?.triggerAttackRelease("16n", time, v);
        if (h.drum === "tom") tomRef.current[i]?.triggerAttackRelease("G2", "16n", time, v);
      }
  
      // UI update (do NOT do this directly in audio callback)
      Tone.Draw.schedule(() => {
        playheadStep16Ref.current = step16;
        setCurrentStep16(step16);
      }, time);
  
      step16 = (step16 + 1) % (GRID_BEATS * 2);
    }, "16n");
      // make sure Transport BPM follows project BPM

    if (metronomeOn){
      let beatCount = 0;

      metroEventRef.current = Tone.Transport.scheduleRepeat((time) => {
        const isDownbeat = beatCount % 4 === 0; // 4 beats per bar
        
        metroRef.current?.triggerAttackRelease(
          isDownbeat ? "C6" : "A5",
          "32n",
          time,
          0.9
        );
        
        beatCount++;
      }, "4n");
    }

    Tone.Transport.start();
  
    return () => {
      Tone.Transport.clear(id);
      
      if (metroEventRef.current !== null) {
        Tone.Transport.clear(metroEventRef.current);
        metroEventRef.current = null;
      }

      Tone.Transport.stop();
    };
  }, [isPlaying, metronomeOn, project.bpm, project.notes, project.drumTracks]);

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
          <span className="font-medium">Bars:</span>
          <input
            className="w-fit"
            type="text"
            value={barsText}
            onChange={(e) => setBarsText(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;

              const newVal = e.currentTarget.value.trim();
              const parsed = parseInt(newVal, 10);

              if (newVal === "" || Number.isNaN(parsed)) {
                setBarsText(String(project.bars));
                return;
              }

              // allow between 1 and 256 bars
              const clamped = Math.max(1, Math.min(256, parsed));
              const maxBeat8 = clamped * NOTE_STEPS_PER_BAR;
              const maxStep16 = clamped * DRUM_STEPS_PER_BAR;

              if (clamped < project.bars) {
                const notesToDelete = project.notes.filter((n) => n.startBeat >= maxBeat8).length;
                const hitsToDelete = project.drumTracks
                  .flatMap((t) => t.hits)
                  .filter((h) => h.step >= maxStep16).length;

                const totalToDelete = notesToDelete + hitsToDelete;
                if (totalToDelete > 0) {
                  const confirmed = window.confirm(
                    `Shrink project to ${clamped} bars?\n\n` +
                      `This will delete ${notesToDelete} note(s) and ${hitsToDelete} drum hit(s) beyond bar ${clamped}.`
                  );

                  if (!confirmed) {
                    setBarsText(String(project.bars));
                    return;
                  }
                }
              }

              setProject((p) => {
                // if we're shrinking, drop notes/hits that fall off the end
                const maxBeat8 = clamped * NOTE_STEPS_PER_BAR; // eighth-note beats
                const maxStep16 = clamped * DRUM_STEPS_PER_BAR;

                const trimmedNotes = p.notes.filter(n => n.startBeat < maxBeat8);
                const trimmedTracks = p.drumTracks.map(t => ({
                  ...t,
                  hits: t.hits.filter(h => h.step < maxStep16),
                }));

                return {
                  ...p,
                  bars: clamped,
                  notes: trimmedNotes,
                  drumTracks: trimmedTracks,
                  updatedAt: Date.now(),
                };
              });
              setBarsText(String(clamped));
              e.currentTarget.blur();
            }}
            onBlur={() => setBarsText(String(project.bars))}
            size={Math.max(1, barsText.length)}
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
          <span className="font-medium">Default Instrument:</span>
          <select
            value={defaultInstrument}
            onChange={(e) => setDefaultInstrument(e.target.value as MelodyInstrument)}
          >
            {MELODY_INSTRUMENTS.map((instrument) => (
              <option key={instrument} value={instrument}>
                {instrument}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium">Low:</span>
          <input
            type="text"
            className="w-14 rounded-md border px-2 py-0.5 text-sm"
            value={lowOctaveText}
            onChange={(e) => setLowOctaveText(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;

              const val = parseInt(e.currentTarget.value.trim(), 10);
              if (Number.isNaN(val)) {
                setLowOctaveText(String(project.lowOctave));
                return;
              }

              const clamped = Math.max(0, Math.min(8, val));
              const nextLow = clamped;
              const nextHigh = Math.max(project.highOctave, clamped);
              const allowedPitches = new Set(
                getPitches(project.keyRoot, project.scaleFamily, nextLow, nextHigh)
              );
              const notesToDelete = project.notes.filter((n) => !allowedPitches.has(n.pitch)).length;

              if (notesToDelete > 0) {
                const confirmed = window.confirm(
                  `Change octave range to ${nextLow}-${nextHigh}?\n\n` +
                    `This will delete ${notesToDelete} note(s) outside the new range.`
                );

                if (!confirmed) {
                  setLowOctaveText(String(project.lowOctave));
                  return;
                }
              }

              setProject((p) => ({
                ...p,
                lowOctave: nextLow,
                highOctave: nextHigh, // keep range valid
                notes: p.notes.filter((n) => allowedPitches.has(n.pitch)),
                updatedAt: Date.now(),
              }));

              setLowOctaveText(String(clamped));
              e.currentTarget.blur();
            }}
            onBlur={() => setLowOctaveText(String(project.lowOctave))}
          />

          <span className="font-medium">High:</span>
          <input
              type="text"
              className="w-14 rounded-md border px-2 py-0.5 text-sm"
              value={highOctaveText}
              onChange={(e) => setHighOctaveText(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;

                const val = parseInt(e.currentTarget.value.trim(), 10);
                if (Number.isNaN(val)) {
                  setHighOctaveText(String(project.highOctave));
                  return;
                }

                const clamped = Math.max(0, Math.min(8, val));
                const nextHigh = clamped;
                const nextLow = Math.min(project.lowOctave, clamped);
                const allowedPitches = new Set(
                  getPitches(project.keyRoot, project.scaleFamily, nextLow, nextHigh)
                );
                const notesToDelete = project.notes.filter((n) => !allowedPitches.has(n.pitch)).length;

                if (notesToDelete > 0) {
                  const confirmed = window.confirm(
                    `Change octave range to ${nextLow}-${nextHigh}?\n\n` +
                      `This will delete ${notesToDelete} note(s) outside the new range.`
                  );

                  if (!confirmed) {
                    setHighOctaveText(String(project.highOctave));
                    return;
                  }
                }

                setProject((p) => ({
                  ...p,
                  highOctave: nextHigh,
                  lowOctave: nextLow, // keep range valid
                  notes: p.notes.filter((n) => allowedPitches.has(n.pitch)),
                  updatedAt: Date.now(),
                }));

                setHighOctaveText(String(clamped));
                e.currentTarget.blur();
              }}
              onBlur={() => setHighOctaveText(String(project.highOctave))}
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

      <button
        className={`rounded-md px-4 py-2 text-sm text-white ${
          isPlaying ? "bg-red-600" : "bg-black"
        }`}
        onClick={async () => {
          await Tone.start(); // unlock audio on first user gesture
          setIsPlaying((prev) => !prev);
        }}
      >
        {isPlaying ? "Stop" : "Play"}
      </button>

      <button
        className="rounded-md border px-3 py-1 text-sm"
        onClick={() => setMetronomeOn(v => !v)}
      >
        Metronome: {metronomeOn ? "On" : "Off"}
      </button>

      <div className="flex-1 overflow-auto border mt-2 mb-2 rounded-lg">
        <div className="flex flex-row pt-2 pb-2 pl-1 text-sm">
          {/* labels column stays fixed */}
          <div className="flex flex-col mr-2 shrink-0">
            <div className="h-8 mb-1" />
            <ul className="w-14 items-center flex flex-col py-0 px-1 rounded-md text-lg list-none">
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

          <div className="w-full min-w-0">
            {/* ruler: sticky in vertical scroll, synced to horizontal scrollLeft */}
            <div className="sticky top-0 z-30 mb-1 bg-neutral-50/95 dark:bg-neutral-950/95 backdrop-blur-sm relative">
              {noteViewportWidth > 0 && (
                <div
                  className="absolute top-1 z-40 -translate-x-1/2 rounded bg-yellow-300 px-1.5 py-0.5 text-[10px] font-semibold text-black pointer-events-none"
                  style={{ left: playheadIndicatorX }}
                >
                  {playheadIndicatorLabel}
                </div>
              )}
              <div className="relative h-8 overflow-hidden rounded-sm bg-neutral-700">
                <div
                  ref={rulerRef}
                  className="relative h-8 select-none"
                  style={{
                    width: GRID_BEATS * CELL_W,
                    transform: `translateX(${-scrollLeft}px)`,
                  }}
                  onMouseDown={(e) => {
                    if (!rulerRef.current) return;
                    const b = step16FromClientX(e.clientX, rulerRef.current, scrollLeft);
                    setPlayheadStep16(b);
                    isScrubbingRef.current = true;
                  }}
                  onMouseMove={(e) => {
                    if (!isScrubbingRef.current) return;
                    if (!rulerRef.current) return;
                    const b = step16FromClientX(e.clientX, rulerRef.current, scrollLeft);
                    setPlayheadStep16(b);
                  }}
                >
                  {Array.from({ length: project.bars }, (_, barIndex) => {
                    const left = barIndex * BAR_WIDTH_PX;
                    return (
                      <div key={`bar-mark-${barIndex}`}>
                        <div
                          className="absolute top-0 bottom-0 w-px bg-neutral-400/70 pointer-events-none"
                          style={{ left }}
                        />
                        <div
                          className="absolute top-1 text-[10px] text-neutral-200 pointer-events-none"
                          style={{ left: left + 4 }}
                        >
                          {barIndex + 1}
                        </div>
                      </div>
                    );
                  })}
                  <div
                    className="absolute top-0 bottom-0 w-[2px] bg-yellow-400 pointer-events-none z-30"
                    style={{ left: notePlayheadPx }}
                  />
                </div>
              </div>
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
                style={{ left: notePlayheadPx }}/>

              {/* grid */}
              <div
                className="rounded-sm bg-neutral-600"
                style={{
                  width: GRID_BEATS * CELL_W,
                }}
              >
              {pitches.map((pitch) => (
                <div key={pitch} className="flex" style={{ height: CELL_H }}>
                  <div
                    aria-hidden="true"
                    className="shrink-0"
                    style={{ width: noteWindow.start * CELL_W }}
                  />
                  {Array.from(
                    { length: noteWindow.end - noteWindow.start },
                    (_, localIndex) => {
                  const beat = noteWindow.start + localIndex;
                  const filled = hasNoteAt(project.notes, pitch, beat);
                  const noteOccupyingCell = getNoteOccupying(project.notes, pitch, beat);
                  const isContinuation = Boolean(noteOccupyingCell);
                  const isNoteStart = Boolean(noteOccupyingCell && noteOccupyingCell.startBeat === beat);
                  const isNoteEnd = Boolean(
                    noteOccupyingCell &&
                    beat === noteOccupyingCell.startBeat + noteOccupyingCell.durationBeats - 1
                  );
                  const existingInstrument = normalizeInstrument(noteOccupyingCell?.instrument);
                  const filledClass = noteOccupyingCell
                    ? NOTE_INSTRUMENT_COLORS[existingInstrument]
                    : "bg-emerald-500 hover:bg-emerald-600";

                  const barIndex = Math.floor(beat / STEPS_PER_BAR);
                  const isAltBar = barIndex % 2 === 1;

                  return (
                    <button
                      key={`${pitch}-${beat}`}
                      type="button"
                      aria-label={`${pitch} beat ${beat} ${filled ? "on" : "off"}`}
                      className={`rounded-sm p-0 cursor-pointer transition-colors
                        border border-neutral-400 dark:border-neutral-600
                        ${filled && isNoteEnd ? "cursor-e-resize" : "cursor-pointer"}
                        ${
                          filled
                            ? filledClass
                            : isAltBar
                              ? "bg-neutral-300 dark:bg-neutral-800 hover:bg-neutral-400 dark:hover:bg-neutral-700"
                              : "bg-neutral-200 dark:bg-neutral-900 hover:bg-neutral-300 dark:hover:bg-neutral-800"
                        }
                        ${filled ? "rounded-none" : ""}`}
                      style={{
                        width: CELL_W,
                        height: CELL_H,
                        borderTopLeftRadius: isNoteStart ? 4 : 0,
                        borderBottomLeftRadius: isNoteStart ? 4 : 0,
                        borderTopRightRadius: isNoteEnd ? 4 : 0,
                        borderBottomRightRadius: isNoteEnd ? 4 : 0,
                        borderLeftWidth: isContinuation && !isNoteStart ? 0 : 1,
                        borderRightWidth: isContinuation && !isNoteEnd ? 0 : 1,
                      }}
                      onMouseDown={(e) => {
                        clearPendingNoteDelete();
                        setNoteMenu(null);

                        // Resize only from the right-edge handle of the note end cell.
                        if (noteOccupyingCell) {
                          const isRightEdgeGrab = e.nativeEvent.offsetX >= CELL_W - NOTE_RESIZE_HANDLE_PX;
                          if (!isNoteEnd || !isRightEdgeGrab) return;

                          suppressDeleteClickRef.current = true;
                          document.body.style.cursor = "col-resize";
                          document.body.style.userSelect = "none";
                          noteResizeRef.current = {
                            noteId: noteOccupyingCell.id,
                            pitch,
                            startBeat: noteOccupyingCell.startBeat,
                          };
                          return;
                        }

                        const newNoteId = crypto.randomUUID();
                        previewNote(pitch, 0.8, defaultInstrument);
                        document.body.style.cursor = "col-resize";
                        document.body.style.userSelect = "none";
                        setProject((p) => ({
                          ...p,
                          notes: [
                            ...p.notes,
                            {
                              id: newNoteId,
                              pitch,
                              startBeat: beat,
                              durationBeats: 1,
                              velocity: 0.8,
                              instrument: defaultInstrument,
                            },
                          ],
                          updatedAt: Date.now(),
                        }));
                        justSpawnedNoteIdRef.current = newNoteId;
                        noteResizeRef.current = {
                          noteId: newNoteId,
                          pitch,
                          startBeat: beat,
                        };
                      }}
                      onClick={() => {
                        clearPendingNoteDelete();
                        if (suppressDeleteClickRef.current) {
                          suppressDeleteClickRef.current = false;
                          return;
                        }

                        if (!noteOccupyingCell) return;
                        if (justSpawnedNoteIdRef.current === noteOccupyingCell.id) {
                          justSpawnedNoteIdRef.current = null;
                          return;
                        }
                        noteDeleteTimeoutRef.current = window.setTimeout(() => {
                          setProject((p) => ({
                            ...p,
                            notes: p.notes.filter((n) => n.id !== noteOccupyingCell.id),
                            updatedAt: Date.now(),
                          }));
                          noteDeleteTimeoutRef.current = null;
                        }, 220);
                      }}
                      onDoubleClick={(e) => {
                        if (!noteOccupyingCell) return;
                        clearPendingNoteDelete();
                        const menuWidth = 240;
                        const menuHeight = 220;
                        const x = Math.min(e.clientX + 12, window.innerWidth - menuWidth - 12);
                        const y = Math.min(e.clientY + 12, window.innerHeight - menuHeight - 12);
                        setNoteMenu({ noteId: noteOccupyingCell.id, x, y });
                      }}
                    />
                  );
                    }
                  )}
                  <div
                    aria-hidden="true"
                    className="shrink-0"
                    style={{ width: (GRID_BEATS - noteWindow.end) * CELL_W }}
                  />
                </div>
              ))}
              </div>
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
                <div key={track.id} className="flex">
                  <div
                    aria-hidden="true"
                    className="shrink-0"
                    style={{ width: drumWindow.start * DRUM_CELL_W }}
                  />
                  {Array.from(
                    { length: drumWindow.end - drumWindow.start },
                    (_, localIndex) => {
                    const step = drumWindow.start + localIndex;
                    const hit = track.hits.find((h) => h.step === step);
                    const barIndex = Math.floor(step / DRUM_STEPS_PER_BAR); // 0,1,2...
                    const isAltBar = barIndex % 2 === 1;
                    const isQuarterStart = step % DRUM_STEPS_PER_BEAT === 0; // every 4 sixteenths

                    return (
                      <button
                        key={`${track.id}-${step}`}
                        className={`h-6 transition-colors
                          border-t border-b border-neutral-300 dark:border-neutral-700
                          ${hit ? "bg-emerald-500 hover:bg-emerald-600" : ""}
                          ${
                            !hit
                              ? isAltBar
                                ? "bg-neutral-200 dark:bg-neutral-900 hover:bg-neutral-300 dark:hover:bg-neutral-800"
                                : "bg-white dark:bg-neutral-950 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                              : ""
                          }`}
                        style={{
                          width: DRUM_CELL_W,
                          // quarter note divider (stronger line every 4 steps)
                          borderLeft: isQuarterStart
                            ? "2px solid rgba(120,120,120,0.6)"
                            : "1px solid rgba(120,120,120,0.25)",
                        }}
                        onClick={() => {
                          setProject((p) => ({
                            ...p,
                            drumTracks: p.drumTracks.map((t) => {
                              if (t.id !== track.id) return t;

                              const existing = t.hits.find((h) => h.step === step);
                              if (existing) {
                                return { ...t, hits: t.hits.filter((h) => h.id !== existing.id) };
                              }
                              
                              // 🔊 preview sound when placing hit
                              previewDrum(t.drum, t.variant, 0.9);
                              
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
                    }
                  )}
                  <div
                    aria-hidden="true"
                    className="shrink-0"
                    style={{ width: (DRUM_GRID_BEATS - drumWindow.end) * DRUM_CELL_W }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {noteMenu && selectedNote && (
        <div
          ref={noteMenuRef}
          className="fixed z-50 w-60 rounded-md border bg-white p-3 shadow-xl dark:bg-neutral-900"
          style={{ left: noteMenu.x, top: noteMenu.y }}
        >
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Note Options
          </div>
          <div className="mb-2 text-xs text-neutral-500">
            {selectedNote.pitch} at beat {selectedNote.startBeat}
          </div>
          <label className="mb-2 block text-xs font-medium">
            Instrument
            <select
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              value={normalizeInstrument(selectedNote.instrument)}
              onChange={(e) => {
                const instrument = e.target.value as MelodyInstrument;
                updateNoteById(selectedNote.id, { instrument });
                previewNote(selectedNote.pitch, selectedNote.velocity ?? 0.8, instrument);
              }}
            >
              {MELODY_INSTRUMENTS.map((instrument) => (
                <option key={instrument} value={instrument}>
                  {instrument}
                </option>
              ))}
            </select>
          </label>
          <label className="mb-2 block text-xs font-medium">
            Duration
            <select
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              value={selectedNote.durationBeats}
              onChange={(e) => {
                const durationBeats = Number(e.target.value);
                updateNoteById(selectedNote.id, { durationBeats });
              }}
            >
              <option value={1}>1 step</option>
              <option value={2}>2 steps</option>
              <option value={4}>4 steps</option>
              <option value={8}>8 steps</option>
            </select>
          </label>
          <label className="mb-3 block text-xs font-medium">
            Velocity
            <select
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              value={selectedNote.velocity ?? 0.8}
              onChange={(e) => {
                const velocity = Number(e.target.value);
                updateNoteById(selectedNote.id, { velocity });
                previewNote(selectedNote.pitch, velocity, normalizeInstrument(selectedNote.instrument));
              }}
            >
              <option value={0.4}>0.4</option>
              <option value={0.6}>0.6</option>
              <option value={0.8}>0.8</option>
              <option value={1}>1.0</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs"
              onClick={() => setNoteMenu(null)}
            >
              Close
            </button>
            <button
              type="button"
              className="rounded bg-red-600 px-2 py-1 text-xs text-white"
              onClick={() => {
                setProject((p) => ({
                  ...p,
                  notes: p.notes.filter((n) => n.id !== selectedNote.id),
                  updatedAt: Date.now(),
                }));
                setNoteMenu(null);
              }}
            >
              Delete Note
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
