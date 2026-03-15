"use client";

import * as Tone from "tone";
import { useEffect, useMemo, useRef, useState } from "react";
import { createDefaultProject } from "@/lib/defaultProject";
import { getPitches, ALL_MAJOR_KEYS, ALL_MINOR_KEYS } from "@/lib/pitches";
import type { KeyRoot } from "@/lib/pitches";
import { normalizeInstrument } from "@/lib/editorUtils";
import type { Project, NoteEvent, MelodyInstrument } from "@/types/project";
import {
  CELL_W,
  NOTE_STEPS_PER_BAR,
  DRUM_STEPS_PER_BAR,
  NOTE_RENDER_BUFFER_COLS,
  DRUM_RENDER_BUFFER_STEPS,
} from "./constants";
import { EditorHeader } from "./EditorHeader";
import { EditorToolbar } from "./EditorToolbar";
import { PianoRoll } from "./PianoRoll";
import { DrumSequencer } from "./DrumSequencer";
import { NoteOptionsMenu } from "./NoteOptionsMenu";
import { supabase } from "@/lib/supabase";

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
  const [songId, setSongId] = useState<string | null>(null);

  const signatureNotesRef = useRef<Record<string, NoteEvent[]>>({});

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

  const getCompatibleKeyForScaleFamily = (
    key: KeyRoot,
    scaleFamily: "MAJOR" | "MINOR"
  ): KeyRoot => {
    const options = scaleFamily === "MAJOR" ? ALL_MAJOR_KEYS : ALL_MINOR_KEYS;
    if (options.includes(key as never)) return key;

    const targetPc = keyToMidi(key) % 12;
    const samePitchClass = options.find((candidate) => keyToMidi(candidate) % 12 === targetPc);
    return samePitchClass ?? options[0];
  };

  const signatureKey = (
    keyRoot: KeyRoot,
    scaleFamily: "MAJOR" | "MINOR",
    lowOctave: number,
    highOctave: number
  ) => `${scaleFamily}:${keyRoot}:${lowOctave}:${highOctave}`;

  const snapPitchToScale = (pitch: string, allowedPitches: string[]) => {
    if (allowedPitches.includes(pitch)) return pitch;
    if (allowedPitches.length === 0) return pitch;

    const targetMidi = Tone.Frequency(pitch).toMidi();
    let bestPitch = allowedPitches[0];
    let bestDistance = Math.abs(Tone.Frequency(bestPitch).toMidi() - targetMidi);

    for (let i = 1; i < allowedPitches.length; i++) {
      const candidate = allowedPitches[i];
      const distance = Math.abs(Tone.Frequency(candidate).toMidi() - targetMidi);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPitch = candidate;
      }
    }

    return bestPitch;
  };

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

  const handleScaleFamilyChange = (newFamily: "MAJOR" | "MINOR") => {
    setProject((p) => {
      if (p.scaleFamily === newFamily) return p;

      const currentSignature = signatureKey(
        p.keyRoot,
        p.scaleFamily,
        p.lowOctave,
        p.highOctave
      );
      signatureNotesRef.current[currentSignature] = p.notes.map((n) => ({ ...n }));

      const nextKey = getCompatibleKeyForScaleFamily(p.keyRoot, newFamily);
      const nextSignature = signatureKey(nextKey, newFamily, p.lowOctave, p.highOctave);
      const cachedNotes = signatureNotesRef.current[nextSignature];

      const nextNotes = cachedNotes
        ? cachedNotes.map((n) => ({ ...n }))
        : p.notes.map((n) => ({
            ...n,
            pitch: snapPitchToScale(
              n.pitch,
              getPitches(nextKey, newFamily, p.lowOctave, p.highOctave)
            ),
          }));

      return {
        ...p,
        keyRoot: nextKey,
        scaleFamily: newFamily,
        notes: nextNotes,
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

 const handleSave = async () => {
  console.log("songId before save:", songId);

  if (songId) {
    console.log("RUNNING UPDATE");

    const { data, error } = await supabase
      .from("songs")
      .update({
        title: project.name || "Untitled",
        bpm: project.bpm || 120,
        project_data: project,
      })
      .eq("id", songId)
      .select()
      .single();

    console.log("update data:", data);
    console.log("update error:", error);

  } else {
    console.log("RUNNING INSERT");

    const { data, error } = await supabase
      .from("songs")
      .insert([
        {
          title: project.name || "Untitled",
          bpm: project.bpm || 120,
          project_data: project,
        },
      ])
      .select()
      .single();

    console.log("insert data:", data);
    console.log("insert error:", error);

    if (data) {
      console.log("setting songId to:", data.id);
      setSongId(data.id);
    }
  }
};


  // Convert a click on the ruler (which is already visually scrolled via CSS transform)
  // into a 16th-step index. We do NOT add scrollLeft here, because the transform has
  // already moved the element in view space.
  function step16FromClientX(clientX: number, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
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
        const notesToPlay = project.notes.filter((n) => n.startBeat === beat8);

        // Grid units: 1 beat8 = 1 eighth note.
        // Quarter note duration in seconds = 60 / bpm, so one eighth = half of that.
        const eighthDurationSeconds = (60 / project.bpm) / 2;

        for (const n of notesToPlay) {
          const instrument = normalizeInstrument(n.instrument);
          const noteDurationSeconds = n.durationBeats * eighthDurationSeconds;
          getMelodySynth(instrument).triggerAttackRelease(
            n.pitch,
            noteDurationSeconds,
            time,
            n.velocity
          );
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
    <main className="h-screen flex flex-col bg-neutral-100 dark:bg-neutral-950">
      <EditorHeader onSave={handleSave} />
      <EditorToolbar
        project={project}
        setProject={setProject}
        bpmText={bpmText}
        setBpmText={setBpmText}
        barsText={barsText}
        setBarsText={setBarsText}
        lowOctaveText={lowOctaveText}
        setLowOctaveText={setLowOctaveText}
        highOctaveText={highOctaveText}
        setHighOctaveText={setHighOctaveText}
        keys={keys}
        handleKeyChange={handleKeyChange}
        handleScaleFamilyChange={handleScaleFamilyChange}
        defaultInstrument={defaultInstrument}
        setDefaultInstrument={setDefaultInstrument}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        metronomeOn={metronomeOn}
        setMetronomeOn={setMetronomeOn}
      />
      <PianoRoll
        project={project}
        setProject={setProject}
        pitches={pitches}
        noteWindow={noteWindow}
        gridBeats={GRID_BEATS}
        scrollLeft={scrollLeft}
        noteScrollRef={noteScrollRef}
        rulerRef={rulerRef}
        onNoteScroll={() => syncScroll("notes")}
        step16FromClientX={step16FromClientX}
        setPlayheadStep16={setPlayheadStep16}
        isScrubbingRef={isScrubbingRef}
        notePlayheadPx={notePlayheadPx}
        playheadIndicatorX={playheadIndicatorX}
        playheadIndicatorLabel={playheadIndicatorLabel}
        noteViewportWidth={noteViewportWidth}
        barWidthPx={BAR_WIDTH_PX}
        bars={project.bars}
        clearPendingNoteDelete={clearPendingNoteDelete}
        setNoteMenu={setNoteMenu}
        noteResizeRef={noteResizeRef}
        suppressDeleteClickRef={suppressDeleteClickRef}
        justSpawnedNoteIdRef={justSpawnedNoteIdRef}
        noteDeleteTimeoutRef={noteDeleteTimeoutRef}
        onPreviewNote={previewNote}
        updateNoteById={updateNoteById}
        defaultInstrument={defaultInstrument}
      />
      <DrumSequencer
        project={project}
        setProject={setProject}
        drumScrollRef={drumScrollRef}
        onScroll={() => syncScroll("drums")}
        currentStep16={currentStep16}
        drumWindow={drumWindow}
        gridBeats={GRID_BEATS}
        drumGridBeats={DRUM_GRID_BEATS}
        onPreviewDrum={previewDrum}
      />
      {noteMenu && selectedNote && (
        <NoteOptionsMenu
          note={selectedNote}
          position={{ x: noteMenu.x, y: noteMenu.y }}
          menuRef={noteMenuRef}
          onClose={() => setNoteMenu(null)}
          onUpdate={updateNoteById}
          onDelete={(noteId) => {
            setProject((p) => ({
              ...p,
              notes: p.notes.filter((n) => n.id !== noteId),
              updatedAt: Date.now(),
            }));
          }}
          onPreviewNote={previewNote}
        />
      )}
    </main>
  );
}
