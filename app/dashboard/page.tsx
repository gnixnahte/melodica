"use client";
import Link from "next/link";
import * as Tone from "tone";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { createDefaultProject } from "@/lib/defaultProject";
import { normalizeInstrument } from "@/lib/editorUtils";
import type { MelodyInstrument, Project, SfxPreset } from "@/types/project";
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

const SFX_PRESET_SETTINGS: Record<
  SfxPreset,
  { filterType: "lowpass" | "bandpass"; filterFrequency: number; filterQ: number }
> = {
  Clean: { filterType: "lowpass", filterFrequency: 20000, filterQ: 0.0001 },
  "Lo-Fi": { filterType: "lowpass", filterFrequency: 3200, filterQ: 0.8 },
  Telephone: { filterType: "bandpass", filterFrequency: 1300, filterQ: 1.5 },
  Crunch: { filterType: "lowpass", filterFrequency: 9000, filterQ: 0.6 },
};

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
    audioTracks: Array.isArray(raw.audioTracks)
      ? raw.audioTracks.map((track) => ({
          id:
            typeof track.id === "string" && track.id.length > 0
              ? track.id
              : crypto.randomUUID(),
          name: typeof track.name === "string" && track.name.length > 0 ? track.name : "Mic",
          clips: Array.isArray(track.clips)
            ? track.clips.filter(
                (clip) =>
                  typeof clip.id === "string" &&
                  typeof clip.url === "string" &&
                  Number.isFinite(clip.startStep16) &&
                  Number.isFinite(clip.durationStep16)
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

  const lastVocalStepExclusive = project.audioTracks
    .flatMap((track) => track.clips)
    .reduce(
      (max, clip) =>
        Math.max(
          max,
          Math.max(0, Math.floor(clip.startStep16)) + Math.max(1, Math.floor(clip.durationStep16))
        ),
      0
    );

  const lastEventStepExclusive = Math.max(
    lastNoteStepExclusive,
    lastDrumStepExclusive,
    lastVocalStepExclusive
  );
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
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [openMenuSongId, setOpenMenuSongId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeSongId, setActiveSongId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const scheduleIdRef = useRef<number | null>(null);
  const synthBankRef = useRef<Map<MelodyInstrument, MelodyPolySynth>>(new Map());
  const masterGainRef = useRef<Tone.Gain | null>(null);
  const reverbRef = useRef<Tone.Reverb | null>(null);
  const sfxFilterRef = useRef<Tone.Filter | null>(null);
  const sfxDistortionRef = useRef<Tone.Distortion | null>(null);
  const kickRef = useRef<Tone.MembraneSynth[]>([]);
  const snareRef = useRef<Tone.NoiseSynth[]>([]);
  const hatRef = useRef<Tone.MetalSynth[]>([]);
  const tomRef = useRef<Tone.MembraneSynth[]>([]);
  const playingVocalAudioRef = useRef<HTMLAudioElement[]>([]);
  const masterVolumeRef = useRef(0.9);
  const playbackStepRef = useRef(0);
  const totalStepsRef = useRef(1);

  const stopAllVocalAudio = () => {
    for (const audio of playingVocalAudioRef.current) {
      audio.pause();
      audio.currentTime = 0;
    }
    playingVocalAudioRef.current = [];
  };

  const clearPlayback = () => {
    if (scheduleIdRef.current !== null) {
      Tone.Transport.clear(scheduleIdRef.current);
      scheduleIdRef.current = null;
    }
    stopAllVocalAudio();
    Tone.Transport.stop();
    Tone.Transport.cancel();
    Tone.Transport.position = 0;
    playbackStepRef.current = 0;
    totalStepsRef.current = 1;
  };

  const applySongFxSettings = (project: Project) => {
    const master = masterGainRef.current;
    const reverb = reverbRef.current;
    const filter = sfxFilterRef.current;
    const distortion = sfxDistortionRef.current;
    if (!master || !reverb || !filter || !distortion) return;

    const settings = project.settings;
    const nextMaster = Math.max(0, Math.min(1, settings.masterVolume ?? 0.9));
    const nextWet = Math.max(0, Math.min(1, settings.reverbWet ?? 0.2));
    const nextDecay = Math.max(0.2, Math.min(10, settings.reverbDecay ?? 2.5));
    const nextDistortion = Math.max(0, Math.min(1, settings.distortionAmount ?? 0));
    const preset = SFX_PRESET_SETTINGS[settings.sfxPreset ?? "Clean"];

    masterVolumeRef.current = nextMaster;
    master.gain.value = nextMaster;
    reverb.wet.value = nextWet;
    reverb.decay = nextDecay;
    void reverb.generate();
    filter.type = preset.filterType;
    filter.frequency.value = preset.filterFrequency;
    filter.Q.value = preset.filterQ;
    distortion.set({ distortion: nextDistortion });
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

  useEffect(() => {
    if (!authReady) return;

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
  }, [authReady]);

  useEffect(() => {
    const synthBank = synthBankRef.current;
    const master = new Tone.Gain(0.9).toDestination();
    const reverb = new Tone.Reverb({ decay: 2.5, wet: 0.2 });
    const sfxFilter = new Tone.Filter({
      type: "lowpass",
      frequency: 20000,
      Q: 0.0001,
    });
    const sfxDistortion = new Tone.Distortion({
      distortion: 0,
      wet: 1,
    });
    reverb.connect(sfxFilter);
    sfxFilter.connect(sfxDistortion);
    sfxDistortion.connect(master);
    masterGainRef.current = master;
    reverbRef.current = reverb;
    sfxFilterRef.current = sfxFilter;
    sfxDistortionRef.current = sfxDistortion;

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

    return () => {
      clearPlayback();
      synthBank.forEach((synth) => synth.dispose());
      synthBank.clear();
      [...kickRef.current, ...snareRef.current, ...hatRef.current, ...tomRef.current].forEach(
        (inst) => inst.dispose()
      );
      sfxDistortion.dispose();
      sfxFilter.dispose();
      reverb.dispose();
      master.dispose();
      sfxDistortionRef.current = null;
      sfxFilterRef.current = null;
      reverbRef.current = null;
      masterGainRef.current = null;
      kickRef.current = [];
      snareRef.current = [];
      hatRef.current = [];
      tomRef.current = [];
    };
  }, []);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-song-menu-root]")) return;
      setOpenMenuSongId(null);
    };

    window.addEventListener("mousedown", onDocumentClick);
    return () => window.removeEventListener("mousedown", onDocumentClick);
  }, []);

  async function handlePlayPause(song: SongRow) {
    await Tone.start();

    if (activeSongId === song.id) {
      if (isPlaying) {
        Tone.Transport.pause();
        stopAllVocalAudio();
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
    applySongFxSettings(project);
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
    setOpenMenuSongId(null);
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

  function handleExport(song: SongRow) {
    const project = normalizeSongProject(song);
    const fileSafeTitle = (song.title ?? "untitled")
      .trim()
      .replace(/[^a-z0-9-_ ]/gi, "")
      .replace(/\s+/g, "-")
      .toLowerCase();
    const exportPayload = {
      ...project,
      id: song.id,
      name: song.title ?? project.name,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileSafeTitle || "melodica-project"}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setOpenMenuSongId(null);
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) {
      console.error("Error signing out:", error);
    }
    router.replace("/login");
    router.refresh();
  }

  if (!authReady) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#ffffff_0%,#e8edf4_50%,#dfe6ef_100%)] p-8 dark:bg-[radial-gradient(circle_at_top,#353844_0%,#2c2f38_55%,#23262e_100%)]">
        <div className="mx-auto max-w-5xl rounded-3xl border border-white/60 bg-white/50 p-6 shadow-2xl shadow-slate-400/20 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/35 dark:shadow-black/20">
          <p className="text-sm opacity-80">Checking session...</p>
        </div>
      </main>
    );
  }
  
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#ffffff_0%,#e8edf4_50%,#dfe6ef_100%)] p-8 dark:bg-[radial-gradient(circle_at_top,#353844_0%,#2c2f38_55%,#23262e_100%)]">
      <div className="mx-auto max-w-5xl rounded-3xl border border-white/60 bg-white/50 p-6 shadow-2xl shadow-slate-400/20 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/35 dark:shadow-black/20">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="mt-1 text-sm opacity-80">
            Your projects will show up here.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleLogout()}
          className="rounded-md border border-slate-300/80 bg-slate-800 px-4 py-2 text-sm text-white transition-all duration-200 hover:border-white/90 hover:bg-slate-700 hover:shadow-[0_0_18px_rgba(255,255,255,0.5)] dark:border-slate-500/50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white dark:hover:shadow-[0_0_18px_rgba(255,255,255,0.5)]"
        >
          Log Out
        </button>
      </header>

      <div className="mt-6 w-full">
        <Link
          href="/editor"
          className="flex w-full items-center justify-center rounded-xl border border-emerald-400/80 bg-emerald-500 px-6 py-4 text-base font-semibold text-white shadow-sm transition-all duration-200 hover:border-emerald-300 hover:bg-emerald-600 hover:shadow-[0_0_18px_rgba(74,222,128,0.55)] dark:border-emerald-300/50 dark:bg-emerald-400 dark:text-slate-900 dark:hover:bg-emerald-300 dark:hover:shadow-[0_0_18px_rgba(74,222,128,0.4)]"
        >
          + New Project
        </Link>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Projects</h2>

        <div className="mt-3 space-y-3">
          {songs.length === 0 ? (
            <div className="rounded-xl border border-white/60 bg-white/55 p-4 text-sm opacity-80 backdrop-blur dark:border-white/10 dark:bg-zinc-800/40">
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
                className={`relative rounded-xl border border-white/60 bg-white/55 p-4 backdrop-blur dark:border-white/10 dark:bg-zinc-800/40 ${
                  openMenuSongId === song.id ? "z-30" : ""
                }`}
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
                        className="dashboard-slider h-2 w-full appearance-none rounded-full border border-white/70 transition-all duration-200"
                        style={{
                          background: `linear-gradient(90deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.96) ${sliderValue}%, rgba(148,163,184,0.35) ${sliderValue}%, rgba(148,163,184,0.35) 100%)`,
                          boxShadow:
                            isActive && isPlaying
                              ? "0 0 16px rgba(255,255,255,0.8), inset 0 0 8px rgba(255,255,255,0.55)"
                              : "inset 0 0 6px rgba(255,255,255,0.25)",
                        }}
                      />
                      <span className="w-20 text-right text-xs opacity-70">
                        {`${formatDuration(currentSeconds)} / ${formatDuration(songDurationSeconds)}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void handlePlayPause(song)}
                      className="rounded-md border border-slate-300/80 bg-white/70 px-3 py-1 text-sm text-slate-800 transition-all duration-200 hover:border-white/95 hover:bg-white hover:shadow-[0_0_18px_rgba(255,255,255,0.65)] dark:border-white/15 dark:bg-zinc-700/50 dark:text-slate-100 dark:hover:bg-zinc-700/80 dark:hover:shadow-[0_0_18px_rgba(255,255,255,0.35)]"
                    >
                      {activeSongId === song.id && isPlaying ? "Pause" : "Play"}
                    </button>
                    <button
                      onClick={() => router.push(`/editor?id=${song.id}`)}
                      className="rounded-md border border-slate-300/80 bg-white/70 px-3 py-1 text-sm text-slate-800 transition-all duration-200 hover:border-white/95 hover:bg-white hover:shadow-[0_0_18px_rgba(255,255,255,0.65)] dark:border-white/15 dark:bg-zinc-700/50 dark:text-slate-100 dark:hover:bg-zinc-700/80 dark:hover:shadow-[0_0_18px_rgba(255,255,255,0.35)]"
                    >
                      Open
                    </button>
                    <div className="relative" data-song-menu-root>
                      <button
                        type="button"
                        aria-label="Project actions"
                        onClick={() =>
                          setOpenMenuSongId((current) => (current === song.id ? null : song.id))
                        }
                        className="flex h-8 w-8 cursor-pointer items-center justify-center text-lg leading-none font-semibold text-slate-700 transition-all duration-150 hover:scale-110 hover:text-slate-900 hover:[text-shadow:0_0_10px_rgba(255,255,255,0.95)] dark:text-slate-200 dark:hover:text-white dark:hover:[text-shadow:0_0_10px_rgba(255,255,255,0.7)]"
                      >
                        ⋯
                      </button>
                      {openMenuSongId === song.id && (
                        <div className="absolute bottom-full right-0 z-40 mb-2 w-36 rounded-lg border border-white/60 bg-white/90 p-1.5 shadow-xl backdrop-blur-md dark:border-white/15 dark:bg-zinc-900/90">
                          <button
                            type="button"
                            onClick={() => handleExport(song)}
                            className="w-full rounded-md px-3 py-1.5 text-left text-sm text-slate-800 transition-all duration-150 hover:bg-white hover:shadow-[0_0_14px_rgba(255,255,255,0.65)] dark:text-slate-100 dark:hover:bg-zinc-700/80 dark:hover:shadow-[0_0_14px_rgba(255,255,255,0.35)]"
                          >
                            Export
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(song.id, song.title)}
                            disabled={deletingId === song.id}
                            className="delete-glow-btn mt-1 w-full rounded-md px-3 py-1.5 text-left text-sm text-red-700 transition-all duration-150 hover:bg-red-100/80 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-200 dark:hover:bg-red-900/40"
                          >
                            {deletingId === song.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      )}
                    </div>
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
