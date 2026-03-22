"use client";

import * as Tone from "tone";
import { useEffect, useMemo, useRef, useState } from "react";
import { createDefaultProject } from "@/lib/defaultProject";
import { getPitches, ALL_MAJOR_KEYS, ALL_MINOR_KEYS } from "@/lib/pitches";
import type { KeyRoot } from "@/lib/pitches";
import { normalizeInstrument } from "@/lib/editorUtils";
import type { Project, NoteEvent, MelodyInstrument, SfxPreset } from "@/types/project";
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
import { useRouter, useSearchParams } from "next/navigation";
import { useEditorSave } from "./hooks/useEditorSave";
import { useCursorGlow } from "./hooks/useCursorGlow";

const ALL_KEYS = new Set<KeyRoot>([...ALL_MAJOR_KEYS, ...ALL_MINOR_KEYS]);
const AUDIO_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_AUDIO_BUCKET || "audio-clips";
const MELODY_INSTRUMENT_GAIN_DB: Record<MelodyInstrument, number> = {
  Triangle: 1,
  Saw: -6,
  Square: -7,
  "FM Bell": 3,
  "AM Pad": 6,
  "Duo Lead": -3,
};
const SFX_PRESET_SETTINGS: Record<
  SfxPreset,
  { filterType: "lowpass" | "bandpass"; filterFrequency: number; filterQ: number }
> = {
  Clean: { filterType: "lowpass", filterFrequency: 20000, filterQ: 0.0001 },
  "Lo-Fi": { filterType: "lowpass", filterFrequency: 3200, filterQ: 0.8 },
  Telephone: { filterType: "bandpass", filterFrequency: 1300, filterQ: 1.5 },
  Crunch: { filterType: "lowpass", filterFrequency: 9000, filterQ: 0.6 },
};

function getBestRecorderMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/webm",
  ];
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return "";
}

function createMelodySynthPreset(instrument: MelodyInstrument) {
  // Short release so notes stop when the playhead passes the end of the note (no reverb tail).
  const shortRelease = 0.04;
  switch (instrument) {
    case "Saw":
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.01, decay: 0.08, sustain: 0.45, release: shortRelease },
      });
    case "Square":
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "square" },
        envelope: { attack: 0.005, decay: 0.05, sustain: 0.35, release: shortRelease },
      });
    case "FM Bell":
      return new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3,
        modulationIndex: 8,
        envelope: { attack: 0.005, decay: 0.25, sustain: 0.1, release: shortRelease },
      });
    case "AM Pad":
      return new Tone.PolySynth(Tone.AMSynth, {
        harmonicity: 1.5,
        envelope: { attack: 0.08, decay: 0.2, sustain: 0.55, release: shortRelease },
      });
    case "Duo Lead":
      return new Tone.PolySynth(Tone.DuoSynth, {
        vibratoAmount: 0.3,
        vibratoRate: 5,
        harmonicity: 1.5,
      });
    case "Triangle":
    default:
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.01, decay: 0.01, sustain: 0.4, release: shortRelease },
      });
  }
}
type MelodyPolySynth = ReturnType<typeof createMelodySynthPreset>;

function normalizeLoadedProject(
  song: {
    id: string;
    title: string | null;
    bpm: number | null;
    project_data: unknown;
  }
): Project {
  const base = createDefaultProject(song.title ?? "Untitled");
  const raw =
    song.project_data && typeof song.project_data === "object"
      ? (song.project_data as Partial<Project>)
      : {};

  const keyRoot =
    typeof raw.keyRoot === "string" && ALL_KEYS.has(raw.keyRoot as KeyRoot)
      ? (raw.keyRoot as KeyRoot)
      : base.keyRoot;
  const scaleFamily =
    raw.scaleFamily === "MAJOR" || raw.scaleFamily === "MINOR"
      ? raw.scaleFamily
      : base.scaleFamily;

  const lowOctave =
    typeof raw.lowOctave === "number" && Number.isFinite(raw.lowOctave)
      ? Math.max(0, Math.min(8, raw.lowOctave))
      : base.lowOctave;
  const highOctave =
    typeof raw.highOctave === "number" && Number.isFinite(raw.highOctave)
      ? Math.max(0, Math.min(8, raw.highOctave))
      : base.highOctave;

  const safeProject: Project = {
    ...base,
    ...raw,
    id: song.id ?? base.id,
    name:
      typeof raw.name === "string" && raw.name.trim().length > 0
        ? raw.name
        : song.title ?? base.name,
    bpm:
      typeof raw.bpm === "number" && Number.isFinite(raw.bpm)
        ? raw.bpm
        : typeof song.bpm === "number" && Number.isFinite(song.bpm)
          ? song.bpm
          : base.bpm,
    bars:
      typeof raw.bars === "number" && Number.isFinite(raw.bars)
        ? Math.max(1, Math.min(256, Math.round(raw.bars)))
        : base.bars,
    keyRoot,
    scaleFamily,
    lowOctave: Math.min(lowOctave, highOctave),
    highOctave: Math.max(lowOctave, highOctave),
    notes: Array.isArray(raw.notes) ? raw.notes : base.notes,
    audioTracks: Array.isArray(raw.audioTracks)
      ? raw.audioTracks.map((track) => ({
          id:
            typeof track.id === "string" && track.id.length > 0
              ? track.id
              : crypto.randomUUID(),
          name:
            typeof track.name === "string" && track.name.length > 0
              ? track.name
              : "Mic",
          clips: Array.isArray(track.clips)
            ? track.clips.filter(
                (clip) =>
                  typeof clip.id === "string" &&
                  typeof clip.url === "string" &&
                  typeof clip.startStep16 === "number" &&
                  typeof clip.durationStep16 === "number"
              )
            : [],
        }))
      : base.audioTracks,
    drumTracks: Array.isArray(raw.drumTracks) ? raw.drumTracks : base.drumTracks,
    settings:
      raw.settings && typeof raw.settings === "object"
        ? { ...base.settings, ...raw.settings }
        : base.settings,
    updatedAt:
      typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
        ? raw.updatedAt
        : Date.now(),
  };

  return safeProject;
}

export default function EditorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const songIdFromUrl = searchParams.get("id");
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const ensureAuthenticated = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setAuthReady(true);
    };

    void ensureAuthenticated();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setAuthReady(true);
        return;
      }
      setAuthReady(false);
      router.replace("/login");
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [router]);
  
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
  const [notesMuted, setNotesMuted] = useState(false);
  const [isRecordingVocals, setIsRecordingVocals] = useState(false);
  const [vocalCountdown, setVocalCountdown] = useState<number | null>(null);
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioInputId, setSelectedAudioInputId] = useState<string>("default");
  const [defaultInstrument, setDefaultInstrument] = useState<MelodyInstrument>("Triangle");
  const [noteMenu, setNoteMenu] = useState<NoteMenuState | null>(null);
  const [songId, setSongId] = useState<string | null>(null);
  const {
    hasUnsavedChanges,
    hasUnsavedChangesNow,
    markSnapshotAsSaved,
    persistLatestProject,
    saveStatus,
  } = useEditorSave({
    authReady,
    songIdFromUrl,
    project,
    songId,
    setSongId,
  });

  useEffect(() => {
    async function loadSong() {
      if (!authReady) return;
      if (!songIdFromUrl) return;

      const { data, error } = await supabase
        .from("songs")
        .select("*")
        .eq("id", songIdFromUrl)
        .single();

      if (error || !data) return;

      setSongId(data.id);
      const loaded = normalizeLoadedProject(data);
      setProject(loaded);
      markSnapshotAsSaved(JSON.stringify(loaded));
      setBpmText(String(loaded.bpm));
      setBarsText(String(loaded.bars));
      setLowOctaveText(String(loaded.lowOctave));
      setHighOctaveText(String(loaded.highOctave));
    }

    void loadSong();
  }, [authReady, markSnapshotAsSaved, songIdFromUrl]);

  const signatureNotesRef = useRef<Record<string, NoteEvent[]>>({});

  //synth and keys setup
  const keys = project.scaleFamily === "MAJOR" ? ALL_MAJOR_KEYS : ALL_MINOR_KEYS;
  const synthBankRef = useRef<Map<MelodyInstrument, MelodyPolySynth>>(new Map());
  const masterGainRef = useRef<Tone.Gain | null>(null);
  const reverbRef = useRef<Tone.Reverb | null>(null);
  const sfxFilterRef = useRef<Tone.Filter | null>(null);
  const sfxDistortionRef = useRef<Tone.Distortion | null>(null);
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
  const FALLBACK_NOTE_VIEWPORT_WIDTH = CELL_W * NOTE_STEPS_PER_BAR * 8;
  const FALLBACK_DRUM_VIEWPORT_WIDTH = DRUM_CELL_W * DRUM_STEPS_PER_BAR * 8;

  const [scrollLeft, setScrollLeft] = useState(0);
  const [noteViewportWidth, setNoteViewportWidth] = useState(() =>
    typeof window === "undefined" ? FALLBACK_NOTE_VIEWPORT_WIDTH : window.innerWidth
  );
  const [drumViewportWidth, setDrumViewportWidth] = useState(() =>
    typeof window === "undefined" ? FALLBACK_DRUM_VIEWPORT_WIDTH : window.innerWidth
  );
  const cursorGlowRef = useCursorGlow(authReady);
  const playheadStep16Ref = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeMsRef = useRef(0);
  const recordingStartStep16Ref = useRef<number | null>(null);
  const recordingBpmRef = useRef<number>(120);
  const countdownIntervalRef = useRef<number | null>(null);
  const playingVocalAudioRef = useRef<HTMLAudioElement[]>([]);
  const stopSongAfterVocalStopRef = useRef(false);
  const previousIsPlayingRef = useRef(false);
  const masterVolumeRef = useRef(project.settings.masterVolume);
  const previousMasterVolumeRef = useRef(project.settings.masterVolume);

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

  useEffect(() => {
    let mounted = true;
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.enumerateDevices) return;

    const refreshInputs = async () => {
      try {
        const devices = await mediaDevices.enumerateDevices();
        const inputs = devices.filter((device) => device.kind === "audioinput");
        if (!mounted) return;
        setAudioInputDevices(inputs);
        setSelectedAudioInputId((prev) =>
          prev === "default" || inputs.some((device) => device.deviceId === prev)
            ? prev
            : (inputs[0]?.deviceId ?? "default")
        );
      } catch (error) {
        console.error("Failed to enumerate audio input devices:", error);
      }
    };

    void refreshInputs();
    if (typeof mediaDevices.addEventListener === "function") {
      mediaDevices.addEventListener("devicechange", refreshInputs);
    }
    return () => {
      mounted = false;
      if (typeof mediaDevices.removeEventListener === "function") {
        mediaDevices.removeEventListener("devicechange", refreshInputs);
      }
    };
  }, []);

  const noteWindow = useMemo(() => {
    const effectiveViewportWidth = Math.max(noteViewportWidth, FALLBACK_NOTE_VIEWPORT_WIDTH);
    const viewportCols = Math.ceil(effectiveViewportWidth / CELL_W);
    const start = Math.max(0, Math.floor(scrollLeft / CELL_W) - NOTE_RENDER_BUFFER_COLS);
    const end = Math.min(
      GRID_BEATS,
      Math.ceil((scrollLeft + effectiveViewportWidth) / CELL_W) + NOTE_RENDER_BUFFER_COLS
    );
    const safeEnd = Math.max(end, start + Math.max(1, viewportCols));

    return {
      start,
      end: Math.min(GRID_BEATS, safeEnd),
    };
  }, [FALLBACK_NOTE_VIEWPORT_WIDTH, GRID_BEATS, noteViewportWidth, scrollLeft]);

  const drumWindow = useMemo(() => {
    const effectiveViewportWidth = Math.max(drumViewportWidth, FALLBACK_DRUM_VIEWPORT_WIDTH);
    const viewportSteps = Math.ceil(effectiveViewportWidth / DRUM_CELL_W);
    const start = Math.max(0, Math.floor(scrollLeft / DRUM_CELL_W) - DRUM_RENDER_BUFFER_STEPS);
    const end = Math.min(
      DRUM_GRID_BEATS,
      Math.ceil((scrollLeft + effectiveViewportWidth) / DRUM_CELL_W) + DRUM_RENDER_BUFFER_STEPS
    );
    const safeEnd = Math.max(end, start + Math.max(1, viewportSteps));

    return {
      start,
      end: Math.min(DRUM_GRID_BEATS, safeEnd),
    };
  }, [
    DRUM_CELL_W,
    DRUM_GRID_BEATS,
    FALLBACK_DRUM_VIEWPORT_WIDTH,
    drumViewportWidth,
    scrollLeft,
  ]);

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

  const stopAllVocalAudio = () => {
    for (const audio of playingVocalAudioRef.current) {
      audio.pause();
      audio.currentTime = 0;
    }
    playingVocalAudioRef.current = [];
  };

  const clearCountdown = () => {
    if (countdownIntervalRef.current !== null) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setVocalCountdown(null);
  };

  const stopAndReleaseMic = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const ensureMicTrack = (projectValue: Project) => {
    if (projectValue.audioTracks.length > 0) return projectValue.audioTracks;
    return [{ id: crypto.randomUUID(), name: "Mic", clips: [] }];
  };

  const uploadVocalClip = async (blob: Blob) => {
    const filePath = `vocals/${Date.now()}-${crypto.randomUUID()}.webm`;
    const { error: uploadError } = await supabase.storage
      .from(AUDIO_BUCKET)
      .upload(filePath, blob, {
        contentType: blob.type || "audio/webm",
        upsert: false,
      });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from(AUDIO_BUCKET).getPublicUrl(filePath);
    return data.publicUrl;
  };

  const triggerCountdownTick = (beatIndex: number) => {
    const isDownbeat = beatIndex === 4;
    metroRef.current?.triggerAttackRelease(
      isDownbeat ? "C6" : "A5",
      "32n",
      undefined,
      0.95
    );
  };

  const handleToggleVocalRecording = async () => {
    if (isRecordingVocals) {
      stopSongAfterVocalStopRef.current = true;
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state === "recording") {
        recorder.requestData();
        recorder.stop();
      } else {
        setIsRecordingVocals(false);
        setIsPlaying(false);
        Tone.Transport.stop();
        stopAllVocalAudio();
      }
      return;
    }

    if (vocalCountdown !== null) {
      clearCountdown();
      stopAndReleaseMic();
      return;
    }

    try {
      await Tone.start();
      const mediaDevices = navigator.mediaDevices;
      if (!mediaDevices?.getUserMedia) {
        throw new Error("This browser does not support audio input recording.");
      }
      const requestedAudio: MediaTrackConstraints | boolean =
        selectedAudioInputId !== "default"
          ? {
              deviceId: { exact: selectedAudioInputId },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              channelCount: 1,
              sampleRate: 48000,
            }
          : {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              channelCount: 1,
              sampleRate: 48000,
            };
      let stream: MediaStream;
      try {
        stream = await mediaDevices.getUserMedia({ audio: requestedAudio });
      } catch (error) {
        if (selectedAudioInputId === "default") throw error;
        stream = await mediaDevices.getUserMedia({ audio: true });
      }
      void mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const inputs = devices.filter((device) => device.kind === "audioinput");
          setAudioInputDevices(inputs);
          setSelectedAudioInputId((prev) =>
            prev === "default" || inputs.some((device) => device.deviceId === prev)
              ? prev
              : (inputs[0]?.deviceId ?? "default")
          );
        })
        .catch(() => {});
      const preferredMimeType = getBestRecorderMimeType();
      const recorder = new MediaRecorder(stream, {
        ...(preferredMimeType ? { mimeType: preferredMimeType } : {}),
        audioBitsPerSecond: 256_000,
      });
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      recordingBpmRef.current = project.bpm;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        let localUrl: string | undefined;
        try {
          if (recordingChunksRef.current.length === 0) return;
          const blob = new Blob(recordingChunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          const elapsedSec = Math.max(
            0.05,
            (performance.now() - recordingStartTimeMsRef.current) / 1000
          );
          const durationStep16 = Math.max(
            1,
            Math.round(elapsedSec * (recordingBpmRef.current / 60) * 4)
          );
          const startStep16 = recordingStartStep16Ref.current ?? playheadStep16Ref.current;
          const clipId = crypto.randomUUID();
          const clipUrl = URL.createObjectURL(blob);
          localUrl = clipUrl;

          setProject((p) => {
            const tracks = ensureMicTrack(p);
            const primary = tracks[0];
            return {
              ...p,
              audioTracks: [
                {
                  ...primary,
                  clips: [
                    ...primary.clips,
                    {
                      id: clipId,
                      startStep16,
                      durationStep16,
                      url: clipUrl,
                      gain: 1,
                    },
                  ],
                },
                ...tracks.slice(1),
              ],
              updatedAt: Date.now(),
            };
          });

          try {
            const uploadedUrl = await uploadVocalClip(blob);
            // Keep the local blob URL if the uploaded URL is missing or malformed.
            if (uploadedUrl && uploadedUrl.startsWith("http")) {
              setProject((p) => {
                const tracks = ensureMicTrack(p);
                const primary = tracks[0];
                return {
                  ...p,
                  audioTracks: [
                    {
                      ...primary,
                      clips: primary.clips.map((clip) =>
                        clip.id === clipId ? { ...clip, url: uploadedUrl } : clip
                      ),
                    },
                    ...tracks.slice(1),
                  ],
                  updatedAt: Date.now(),
                };
              });
              if (localUrl) URL.revokeObjectURL(localUrl);
            }
          } catch (uploadError) {
            console.error("Vocal upload failed; keeping local clip URL:", uploadError);
          }
        } catch (error) {
          console.error("Vocal recording save failed:", error);
        } finally {
          if (stopSongAfterVocalStopRef.current) {
            setIsPlaying(false);
            Tone.Transport.stop();
            stopAllVocalAudio();
          }
          stopSongAfterVocalStopRef.current = false;
          recordingChunksRef.current = [];
          recordingStartStep16Ref.current = null;
          stopAndReleaseMic();
          setIsRecordingVocals(false);
        }
      };

      let beatsLeft = 4;
      setVocalCountdown(beatsLeft);
      triggerCountdownTick(beatsLeft);

      const msPerBeat = Math.max(80, Math.round((60_000 / Math.max(20, project.bpm))));
      countdownIntervalRef.current = window.setInterval(() => {
        beatsLeft -= 1;
        if (beatsLeft <= 0) {
          clearCountdown();
          recordingStartStep16Ref.current = playheadStep16Ref.current;
          recordingStartTimeMsRef.current = performance.now();
          if (!isPlaying) setIsPlaying(true);
          recorder.start();
          setIsRecordingVocals(true);
          return;
        }
        setVocalCountdown(beatsLeft);
        triggerCountdownTick(beatsLeft);
      }, msPerBeat);
    } catch (error) {
      console.error("Could not start vocal recording:", error);
      clearCountdown();
      stopAndReleaseMic();
      setIsRecordingVocals(false);
    }
  };

  const connectInstrumentNode = <T extends Tone.ToneAudioNode>(node: T): T => {
    const reverb = reverbRef.current;
    if (reverb) node.connect(reverb);
    else node.toDestination();
    return node;
  };

  const getMelodySynth = (instrument: MelodyInstrument) => {
    const normalized = normalizeInstrument(instrument);
    const existing = synthBankRef.current.get(normalized);
    if (existing) return existing;

    const created = connectInstrumentNode(createMelodySynthPreset(normalized));
    // Level-match presets so different timbres feel closer in loudness.
    created.volume.value = MELODY_INSTRUMENT_GAIN_DB[normalized];
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
    if (notesMuted) return;
    await Tone.start(); // unlock audio if needed
    const dur = 0.12;   // seconds (short “tap”)
    getMelodySynth(instrument).triggerAttackRelease(pitch, dur, undefined, velocity);
  };

  const previewDrum = async (
    drum: "kick" | "snare" | "hat" | "tom",
    variant = 0,
    velocity = 0.9
  ) => {
    if (notesMuted) return;
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

  const handleExport = () => {
    const payload = {
      id: project.id,
      name: project.name,
      bpm: project.bpm,
      exported_at: new Date().toISOString(),
      project_data: project,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const safeName = (project.name || "melodica-project")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "melodica-project";
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBackToDashboard = async () => {
    if (hasUnsavedChanges) {
      await persistLatestProject();
    }
    if (hasUnsavedChangesNow()) {
      const confirmed = window.confirm(
        "We couldn't finish autosaving your latest changes. Leave editor anyway?"
      );
      if (!confirmed) return;
    }
    router.push("/dashboard");
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
    const master = new Tone.Gain(
      Math.max(0, Math.min(1, project.settings.masterVolume))
    ).toDestination();
    const reverb = new Tone.Reverb({
      decay: Math.max(0.2, Math.min(10, project.settings.reverbDecay)),
      wet: Math.max(0, Math.min(1, project.settings.reverbWet)),
    });
    const sfxFilter = new Tone.Filter({
      type: "lowpass",
      frequency: 20000,
      Q: 0.0001,
    });
    const sfxDistortion = new Tone.Distortion({
      distortion: Math.max(0, Math.min(1, project.settings.distortionAmount)),
      wet: 1,
    });
    reverb.connect(sfxFilter);
    sfxFilter.connect(sfxDistortion);
    sfxDistortion.connect(master);
    masterGainRef.current = master;
    reverbRef.current = reverb;
    sfxFilterRef.current = sfxFilter;
    sfxDistortionRef.current = sfxDistortion;
    synthBankRef.current.forEach((synth) => {
      synth.disconnect();
      synth.connect(reverb);
    });

    return () => {
      sfxDistortion.dispose();
      sfxFilter.dispose();
      reverb.dispose();
      master.dispose();
      sfxDistortionRef.current = null;
      sfxFilterRef.current = null;
      reverbRef.current = null;
      masterGainRef.current = null;
    };
  // Create the shared output FX graph once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!masterGainRef.current) return;
    const nextMasterVolume = Math.max(0, Math.min(1, project.settings.masterVolume));
    const prevMasterVolume = Math.max(0, Math.min(1, previousMasterVolumeRef.current));
    masterVolumeRef.current = nextMasterVolume;
    previousMasterVolumeRef.current = nextMasterVolume;
    masterGainRef.current.gain.rampTo(nextMasterVolume, 0.05);

    // HTMLAudioElement playback (vocal clips) sits outside the Tone graph.
    // Scale in-flight clip volumes so the Master dial is truly global.
    if (prevMasterVolume !== nextMasterVolume) {
      const ratio =
        prevMasterVolume > 0 ? nextMasterVolume / prevMasterVolume : 0;
      for (const audio of playingVocalAudioRef.current) {
        if (!Number.isFinite(audio.volume)) continue;
        audio.volume = Math.max(0, Math.min(1, audio.volume * ratio));
      }
    }
  }, [project.settings.masterVolume]);

  useEffect(() => {
    if (!reverbRef.current) return;
    reverbRef.current.wet.rampTo(
      Math.max(0, Math.min(1, project.settings.reverbWet)),
      0.05
    );
  }, [project.settings.reverbWet]);

  useEffect(() => {
    if (!reverbRef.current) return;
    reverbRef.current.decay = Math.max(0.2, Math.min(10, project.settings.reverbDecay));
    void reverbRef.current.generate();
  }, [project.settings.reverbDecay]);

  useEffect(() => {
    const filter = sfxFilterRef.current;
    if (!filter) return;

    const preset = SFX_PRESET_SETTINGS[project.settings.sfxPreset ?? "Clean"];
    filter.type = preset.filterType;
    filter.frequency.rampTo(preset.filterFrequency, 0.07);
    filter.Q.rampTo(preset.filterQ, 0.07);
  }, [project.settings.sfxPreset]);

  useEffect(() => {
    const distortion = sfxDistortionRef.current;
    if (!distortion) return;
    distortion.set({
      distortion: Math.max(0, Math.min(1, project.settings.distortionAmount)),
    });
  }, [project.settings.distortionAmount]);

  useEffect(() => {
    const synthBank = synthBankRef.current;
    return () => {
      clearCountdown();
      stopAndReleaseMic();
      stopAllVocalAudio();
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
      connectInstrumentNode(new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 7,
        envelope: { attack: 0.001, decay: 0.16, sustain: 0 },
      })),
  
      connectInstrumentNode(new Tone.MembraneSynth({
        pitchDecay: 0.06,
        octaves: 10,
        envelope: { attack: 0.001, decay: 0.30, sustain: 0 },
      })),
  
      connectInstrumentNode(new Tone.MembraneSynth({
        pitchDecay: 0.03,
        octaves: 6,
        envelope: { attack: 0.001, decay: 0.12, sustain: 0 },
      })),
    ];
  
    // SNARES (crisp / thicker / tight)
    snareRef.current = [
      connectInstrumentNode(new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.12, sustain: 0 },
      })),
  
      connectInstrumentNode(new Tone.NoiseSynth({
        noise: { type: "pink" },
        envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
      })),
  
      connectInstrumentNode(new Tone.NoiseSynth({
        noise: { type: "brown" },
        envelope: { attack: 0.001, decay: 0.08, sustain: 0 },
      })),
    ];
  
    // HATS (short / open-ish / bright)
    hatRef.current = [
      (() => {
        const h = connectInstrumentNode(new Tone.MetalSynth({
          envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
          harmonicity: 5.1,
          modulationIndex: 28,
          resonance: 2500,
          octaves: 1.2,
        }));
        h.frequency.value = 250;
        return h;
      })(),
    
      (() => {
        const h = connectInstrumentNode(new Tone.MetalSynth({
          envelope: { attack: 0.001, decay: 0.11, release: 0.02 },
          harmonicity: 5.1,
          modulationIndex: 32,
          resonance: 3500,
          octaves: 1.6,
        }));
        h.frequency.value = 300;
        return h;
      })(),
    
      (() => {
        const h = connectInstrumentNode(new Tone.MetalSynth({
          envelope: { attack: 0.001, decay: 0.07, release: 0.01 },
          harmonicity: 5.1,
          modulationIndex: 40,
          resonance: 5200,
          octaves: 1.4,
        }));
        h.frequency.value = 220;
        return h;
      })(),
    ];
  
    // TOMS (low / mid / high)
    tomRef.current = [
      connectInstrumentNode(new Tone.MembraneSynth({
        pitchDecay: 0.03,
        octaves: 4,
        envelope: { attack: 0.001, decay: 0.22, sustain: 0 },
      })),
  
      connectInstrumentNode(new Tone.MembraneSynth({
        pitchDecay: 0.025,
        octaves: 3,
        envelope: { attack: 0.001, decay: 0.20, sustain: 0 },
      })),
  
      connectInstrumentNode(new Tone.MembraneSynth({
        pitchDecay: 0.02,
        octaves: 2,
        envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
      })),
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
      if (!notesMuted && step16 % 2 === 0) {
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
      if (!notesMuted) {
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
      }

      const vocalClipsNow = project.audioTracks
        .flatMap((track) => track.clips)
        .filter((clip) => clip.startStep16 === step16);
      for (const clip of vocalClipsNow) {
        const audio = new Audio(clip.url);
        audio.volume = Math.max(
          0,
          Math.min(1, (clip.gain ?? 1) * masterVolumeRef.current)
        );
        audio.currentTime = 0;
        audio.play().catch(() => {});
        playingVocalAudioRef.current.push(audio);
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
      stopAllVocalAudio();
    };
  }, [isPlaying, metronomeOn, notesMuted, project.bpm, project.notes, project.drumTracks, project.audioTracks]);

  useEffect(() => {
    if (!notesMuted) return;
    synthBankRef.current.forEach((synth) => synth.releaseAll());
  }, [notesMuted]);

  useEffect(() => {
    const wasPlaying = previousIsPlayingRef.current;
    if (wasPlaying && !isPlaying && isRecordingVocals) {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state === "recording") {
        recorder.requestData();
        recorder.stop();
      }
    }
    previousIsPlayingRef.current = isPlaying;
  }, [isPlaying, isRecordingVocals]);

  if (!authReady) {
    return (
      <main className="flex h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#ffffff_0%,#e7ecf3_55%,#dce4ee_100%)] dark:bg-[radial-gradient(circle_at_top,#353844_0%,#2c2f38_55%,#23262e_100%)]">
        <div className="rounded-2xl border border-white/60 bg-white/60 px-8 py-6 text-center backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/40">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Loading your session
          </p>
          <div className="mt-4 flex items-center justify-center gap-2" aria-label="Loading" role="status">
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-slate-500 dark:bg-slate-300" />
            <span
              className="h-2.5 w-2.5 animate-bounce rounded-full bg-slate-500 dark:bg-slate-300"
              style={{ animationDelay: "120ms" }}
            />
            <span
              className="h-2.5 w-2.5 animate-bounce rounded-full bg-slate-500 dark:bg-slate-300"
              style={{ animationDelay: "240ms" }}
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col bg-[radial-gradient(circle_at_top,#ffffff_0%,#e7ecf3_55%,#dce4ee_100%)] dark:bg-[radial-gradient(circle_at_top,#353844_0%,#2c2f38_55%,#23262e_100%)]">
      <div
        ref={cursorGlowRef}
        className="pointer-events-none fixed left-0 top-0 z-50 h-44 w-44 rounded-full bg-white/35 opacity-0 blur-[56px] transition-opacity duration-200"
      />
      <EditorHeader
        onExport={handleExport}
        onBackToDashboard={handleBackToDashboard}
        saveStatus={saveStatus}
        projectName={project.name}
        onProjectNameChange={(name) =>
          setProject((p) => ({
            ...p,
            name,
            updatedAt: Date.now(),
          }))
        }
      />
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
        notesMuted={notesMuted}
        setNotesMuted={setNotesMuted}
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
        isRecordingVocals={isRecordingVocals}
        vocalCountdown={vocalCountdown}
        currentStep16={currentStep16}
        recordingStartStep16={recordingStartStep16Ref.current}
        onToggleVocalRecording={handleToggleVocalRecording}
        audioInputDevices={audioInputDevices}
        selectedAudioInputId={selectedAudioInputId}
        onSelectedAudioInputIdChange={setSelectedAudioInputId}
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
