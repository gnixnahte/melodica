"use client";
import Link from "next/link";
import * as Tone from "tone";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { createDefaultProject } from "@/lib/defaultProject";
import { normalizeInstrument } from "@/lib/editorUtils";
import type { MelodyInstrument, Project } from "@/types/project";
import { DRUM_STEPS_PER_BAR } from "../editor/constants";

type SongRow = {
  id: string;
  title: string | null;
  bpm: number | null;
  updated_at: string | null;
  created_at: string | null;
  project_data: unknown;
};

function createMelodySynthPreset(instrument: MelodyInstrument) {
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

function normalizeSongProject(song: SongRow): Project {
  const base = createDefaultProject(song.title ?? "Untitled");
  const raw =
    song.project_data && typeof song.project_data === "object"
      ? (song.project_data as Partial<Project>)
      : {};

  return {
    ...base,
    ...raw,
    id: song.id,
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
    notes: Array.isArray(raw.notes) ? raw.notes : base.notes,
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
}

function getPlayableSteps16(project: Project) {
  const lastNoteStepExclusive = project.notes.reduce((max, note) => {
    const startStep16 = Math.max(0, note.startBeat * 2);
    const durationStep16 = Math.max(1, note.durationBeats * 2);
    return Math.max(max, startStep16 + durationStep16);
  }, 0);

  const lastDrumStepExclusive = project.drumTracks
    .flatMap((track) => track.hits)
    .reduce((max, hit) => Math.max(max, hit.step + 1), 0);

  const lastEventStepExclusive = Math.max(lastNoteStepExclusive, lastDrumStepExclusive);
  return lastEventStepExclusive > 0
    ? lastEventStepExclusive
    : Math.max(1, project.bars * DRUM_STEPS_PER_BAR);
}

function getSongDurationSeconds(song: SongRow) {
  const project = normalizeSongProject(song);
  const steps16 = getPlayableSteps16(project);
  const bpm = Math.max(20, Math.min(400, Number(project.bpm) || 120));
  return steps16 * ((60 / bpm) / 4);
}

export default function DashboardPage() {
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeSongId, setActiveSongId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const router = useRouter();
  const scheduleIdRef = useRef<number | null>(null);
  const synthBankRef = useRef<Map<MelodyInstrument, MelodyPolySynth>>(new Map());
  const kickRef = useRef<Tone.MembraneSynth[]>([]);
  const snareRef = useRef<Tone.NoiseSynth[]>([]);
  const hatRef = useRef<Tone.MetalSynth[]>([]);
  const tomRef = useRef<Tone.MembraneSynth[]>([]);
  const playbackStepRef = useRef(0);
  const totalStepsRef = useRef(1);

  const clearPlayback = () => {
    if (scheduleIdRef.current !== null) {
      Tone.Transport.clear(scheduleIdRef.current);
      scheduleIdRef.current = null;
    }
    Tone.Transport.stop();
    Tone.Transport.cancel();
    Tone.Transport.position = 0;
    playbackStepRef.current = 0;
    totalStepsRef.current = 1;
  };

  const getMelodySynth = (instrument: MelodyInstrument) => {
    const normalized = normalizeInstrument(instrument);
    const existing = synthBankRef.current.get(normalized);
    if (existing) return existing;

    const created = createMelodySynthPreset(normalized);
    synthBankRef.current.set(normalized, created);
    return created;
  };

  const formatDuration = (seconds: number) => {
    const total = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  useEffect(() => {
    async function loadSongs() {
      const { data, error } = await supabase
        .from("songs")
        .select("*")
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false });

      if (error) {
        console.error("Error loading songs:", error);
        return;
      }

      setSongs(data || []);
    }

    loadSongs();
  }, []);

  useEffect(() => {
    const synthBank = synthBankRef.current;
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

    return () => {
      clearPlayback();
      synthBank.forEach((synth) => synth.dispose());
      synthBank.clear();
      [...kickRef.current, ...snareRef.current, ...hatRef.current, ...tomRef.current].forEach(
        (inst) => inst.dispose()
      );
      kickRef.current = [];
      snareRef.current = [];
      hatRef.current = [];
      tomRef.current = [];
    };
  }, []);

  async function handlePlayPause(song: SongRow) {
    await Tone.start();

    if (activeSongId === song.id) {
      if (isPlaying) {
        Tone.Transport.pause();
        setIsPlaying(false);
      } else {
        Tone.Transport.start();
        setIsPlaying(true);
      }
      return;
    }

    clearPlayback();
    setPlaybackProgress(0);

    const project = normalizeSongProject(song);
    const totalSteps16 = getPlayableSteps16(project);
    totalStepsRef.current = totalSteps16;
    playbackStepRef.current = 0;
    const safeBpm = Math.max(20, Math.min(400, Number(project.bpm) || 120));
    const now = Tone.now();
    Tone.Transport.bpm.cancelScheduledValues(now);
    Tone.Transport.bpm.setValueAtTime(safeBpm, now);

    const id = Tone.Transport.scheduleRepeat((time) => {
      const step16 = playbackStepRef.current;
      if (step16 % 2 === 0) {
        const beat8 = step16 / 2;
        const notesToPlay = project.notes.filter((n) => n.startBeat === beat8);
        const eighthDurationSeconds = (60 / project.bpm) / 2;

        for (const n of notesToPlay) {
          const instrument = normalizeInstrument(n.instrument);
          const noteDurationSeconds = n.durationBeats * eighthDurationSeconds;
          getMelodySynth(instrument).triggerAttackRelease(
            n.pitch,
            noteDurationSeconds,
            time,
            n.velocity ?? 0.8
          );
        }
      }

      const drumHitsNow = project.drumTracks.flatMap((t) => t.hits).filter((h) => h.step === step16);
      for (const h of drumHitsNow) {
        const velocity = h.velocity ?? 0.9;
        const variant = h.variant ?? 0;
        if (h.drum === "kick") kickRef.current[variant]?.triggerAttackRelease("C1", "16n", time, velocity);
        if (h.drum === "snare") snareRef.current[variant]?.triggerAttackRelease("16n", time, velocity);
        if (h.drum === "hat") hatRef.current[variant]?.triggerAttackRelease("16n", time, velocity);
        if (h.drum === "tom") tomRef.current[variant]?.triggerAttackRelease("G2", "16n", time, velocity);
      }

      const isLastStep = step16 >= totalSteps16 - 1;
      const nextStep = isLastStep ? totalSteps16 - 1 : step16 + 1;
      playbackStepRef.current = nextStep;
      Tone.Draw.schedule(() => {
        setPlaybackProgress(nextStep / totalSteps16);
        if (isLastStep) {
          clearPlayback();
          setIsPlaying(false);
          setActiveSongId(null);
        }
      }, time);
    }, "16n");

    scheduleIdRef.current = id;
    Tone.Transport.start();
    setActiveSongId(song.id);
    setIsPlaying(true);
  }

  function handleSeek(songId: string, value: number) {
    if (songId !== activeSongId) return;
    const clamped = Math.max(0, Math.min(100, value));
    const targetStep = Math.floor((clamped / 100) * totalStepsRef.current);
    playbackStepRef.current = Math.min(totalStepsRef.current - 1, targetStep);
    setPlaybackProgress(clamped / 100);
  }

  async function handleDelete(songId: string, title: string | null) {
    const confirmed = window.confirm(
      `Delete "${title ?? "Untitled"}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(songId);
    const { error } = await supabase.from("songs").delete().eq("id", songId);
    setDeletingId(null);

    if (error) {
      console.error("Error deleting song:", error);
      return;
    }

    if (songId === activeSongId) {
      clearPlayback();
      setActiveSongId(null);
      setIsPlaying(false);
      setPlaybackProgress(0);
    }

    setSongs((prev) => prev.filter((song) => song.id !== songId));
  }
  
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#ffffff_0%,#e8edf4_50%,#dfe6ef_100%)] p-8 dark:bg-[radial-gradient(circle_at_top,#3a4654_0%,#2b3440_55%,#212833_100%)]">
      <div className="mx-auto max-w-5xl rounded-3xl border border-white/60 bg-white/50 p-6 shadow-2xl shadow-slate-400/20 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/35 dark:shadow-black/20">
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
            className="rounded-md border border-white/70 bg-white/70 px-4 py-2 text-sm text-slate-800 shadow-sm backdrop-blur hover:bg-white dark:border-white/15 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/70"
          >
            New Project
          </Link>
          <Link
            href="/"
            className="rounded-md border border-slate-300/80 bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 dark:border-slate-500/50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
          >
            Log Out
          </Link>
        </div>
      </header>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Projects</h2>

        <div className="mt-3 space-y-3">
          {songs.length === 0 ? (
            <div className="rounded-xl border border-white/60 bg-white/55 p-4 text-sm opacity-80 backdrop-blur dark:border-white/10 dark:bg-slate-800/40">
              No projects yet. Click <span className="font-medium">New Project</span> to start.
            </div>
          ) : (
            songs.map((song) => (
              (() => {
                const songDurationSeconds = getSongDurationSeconds(song);
                const isActive = activeSongId === song.id;
                const currentSeconds = isActive && isPlaying
                  ? playbackProgress * songDurationSeconds
                  : 0;
                const sliderValue = isActive ? Math.round(playbackProgress * 100) : 0;
                return (
              <div
                key={song.id}
                className="rounded-xl border border-white/60 bg-white/55 p-4 backdrop-blur dark:border-white/10 dark:bg-slate-800/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{song.title}</p>
                    <p className="text-xs opacity-70">BPM: {song.bpm}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={sliderValue}
                        onChange={(e) => handleSeek(song.id, Number(e.currentTarget.value))}
                        className="w-full accent-slate-600"
                      />
                      <span className="w-20 text-right text-xs opacity-70">
                        {`${formatDuration(currentSeconds)} / ${formatDuration(songDurationSeconds)}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void handlePlayPause(song)}
                      className="rounded-md border border-slate-300/80 bg-white/70 px-3 py-1 text-sm text-slate-800 hover:bg-white dark:border-white/15 dark:bg-slate-700/50 dark:text-slate-100 dark:hover:bg-slate-700/80"
                    >
                      {activeSongId === song.id && isPlaying ? "Pause" : "Play"}
                    </button>
                    <button
                      onClick={() => router.push(`/editor?id=${song.id}`)}
                      className="rounded-md border border-slate-300/80 bg-white/70 px-3 py-1 text-sm text-slate-800 hover:bg-white dark:border-white/15 dark:bg-slate-700/50 dark:text-slate-100 dark:hover:bg-slate-700/80"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => void handleDelete(song.id, song.title)}
                      disabled={deletingId === song.id}
                      className="rounded-md border border-red-300/70 bg-red-50/80 px-3 py-1 text-sm text-red-700 hover:bg-red-100/80 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-300/30 dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/40"
                    >
                      {deletingId === song.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
                );
              })()
            ))
          )}
        </div>
      </section>
      </div>
    </main>
  );
}
