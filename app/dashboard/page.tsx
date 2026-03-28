"use client";
import Link from "next/link";
import * as Tone from "tone";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
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
  user_id: string | null;
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
const COVER_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_COVER_BUCKET || "album-covers";
const OWNER_EMAIL = "ethanxing2007@gmail.com";

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

function getSongCoverUrl(song: SongRow) {
  const project = normalizeSongProject(song);
  const coverUrl = project.settings.albumCoverUrl;
  return typeof coverUrl === "string" && coverUrl.length > 0 ? coverUrl : null;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
        return;
      }
      reject(new Error("Failed to read image."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image."));
    reader.readAsDataURL(file);
  });
}

function toInt16Pcm(input: Float32Array) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const sample = Math.max(-1, Math.min(1, input[i] ?? 0));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

type Mp3EncoderCtor = new (channels: number, sampleRate: number, kbps: number) => {
  encodeBuffer: (left: Int16Array, right?: Int16Array) => Int8Array;
  flush: () => Int8Array;
};

async function loadMp3EncoderFromVendorScript(): Promise<Mp3EncoderCtor> {
  if (typeof window === "undefined") {
    throw new Error("MP3 export is only available in the browser.");
  }

  const getCtorFromWindow = () => {
    const w = window as Window & {
      lamejs?: { Mp3Encoder?: Mp3EncoderCtor };
    };
    return w.lamejs?.Mp3Encoder;
  };

  const existing = getCtorFromWindow();
  if (existing) return existing;

  await new Promise<void>((resolve, reject) => {
    const scriptId = "lamejs-vendor-script";
    const already = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (already) {
      const checkLoaded = () => {
        if (getCtorFromWindow()) {
          resolve();
          return true;
        }
        return false;
      };
      if (checkLoaded()) return;
      already.addEventListener("load", () => {
        if (checkLoaded()) return;
        reject(new Error("MP3 encoder did not initialize."));
      }, { once: true });
      already.addEventListener("error", () => reject(new Error("Failed to load MP3 encoder.")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "/vendor/lame.all.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load MP3 encoder."));
    document.head.appendChild(script);
  });

  const loaded = getCtorFromWindow();
  if (!loaded) throw new Error("MP3 encoder unavailable after script load.");
  return loaded;
}

async function loadMp3EncoderCtor(): Promise<Mp3EncoderCtor> {
  // Force the vendor UMD build, because the npm module path can throw
  // `MPEGMode is not defined` in browser-bundled environments.
  return loadMp3EncoderFromVendorScript();
}

type Mp3EncodableAudioBuffer = {
  numberOfChannels: number;
  sampleRate: number;
  getChannelData: (channel: number) => Float32Array;
};

async function encodeAudioBufferToMp3(audioBuffer: Mp3EncodableAudioBuffer) {
  const channels = Math.max(1, Math.min(2, audioBuffer.numberOfChannels));
  const left = toInt16Pcm(audioBuffer.getChannelData(0));
  const right = channels === 2 ? toInt16Pcm(audioBuffer.getChannelData(1)) : left;
  const Mp3EncoderCtor = await loadMp3EncoderCtor();
  const encoder = new Mp3EncoderCtor(channels, audioBuffer.sampleRate, 192);
  const blockSize = 1152;
  const mp3Bytes: number[] = [];

  if (channels === 2) {
    for (let i = 0; i < left.length; i += blockSize) {
      const leftChunk = left.subarray(i, i + blockSize);
      const rightChunk = right.subarray(i, i + blockSize);
      const encoded = encoder.encodeBuffer(leftChunk, rightChunk);
      if (encoded.length > 0) mp3Bytes.push(...encoded);
    }
  } else {
    for (let i = 0; i < left.length; i += blockSize) {
      const chunk = left.subarray(i, i + blockSize);
      const encoded = encoder.encodeBuffer(chunk);
      if (encoded.length > 0) mp3Bytes.push(...encoded);
    }
  }

  const flushed = encoder.flush();
  if (flushed.length > 0) mp3Bytes.push(...flushed);
  return new Blob([new Uint8Array(mp3Bytes)], { type: "audio/mpeg" });
}

export default function DashboardPage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [viewerName, setViewerName] = useState("there");
  const [viewerEmail, setViewerEmail] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [openMenuSongId, setOpenMenuSongId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [uploadingCoverId, setUploadingCoverId] = useState<string | null>(null);
  const [pinnedSongIds, setPinnedSongIds] = useState<string[]>([]);
  const [activeSongId, setActiveSongId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const scheduleIdRef = useRef<number | null>(null);
  const synthBankRef = useRef<Map<MelodyInstrument, MelodyPolySynth>>(new Map());
  const masterGainRef = useRef<Tone.Gain | null>(null);
  const reverbRef = useRef<Tone.Reverb | null>(null);
  const drumReverbRef = useRef<Tone.Reverb | null>(null);
  const drumDryGainRef = useRef<Tone.Gain | null>(null);
  const drumWetGainRef = useRef<Tone.Gain | null>(null);
  const sfxFilterRef = useRef<Tone.Filter | null>(null);
  const sfxDistortionRef = useRef<Tone.Distortion | null>(null);
  const kickRef = useRef<Tone.MembraneSynth[]>([]);
  const snareRef = useRef<Tone.NoiseSynth[]>([]);
  const hatRef = useRef<Tone.MetalSynth[]>([]);
  const tomRef = useRef<Tone.MembraneSynth[]>([]);
  const playingVocalPlayersRef = useRef<Array<{ player: Tone.Player; gain: Tone.Gain }>>([]);
  const coverUploadInputRef = useRef<HTMLInputElement | null>(null);
  const coverUploadSongRef = useRef<SongRow | null>(null);
  const masterVolumeRef = useRef(0.9);
  const playbackStepRef = useRef(0);
  const totalStepsRef = useRef(1);
  const playbackDurationSecondsRef = useRef(0);
  const playbackRafRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);
  const activeSongIdRef = useRef<string | null>(null);

  const nameFromEmail = (email: string | undefined) => {
    if (!email) return "there";
    const [localPart] = email.split("@");
    const clean = (localPart ?? "").trim();
    return clean.length > 0 ? clean : "there";
  };

  const stopAllVocalAudio = () => {
    for (const { player, gain } of playingVocalPlayersRef.current) {
      try {
        player.stop();
      } catch {
        // no-op: player may already be stopped/disposed
      }
      player.dispose();
      gain.dispose();
    }
    playingVocalPlayersRef.current = [];
  };

  const clearPlayback = () => {
    if (playbackRafRef.current !== null) {
      cancelAnimationFrame(playbackRafRef.current);
      playbackRafRef.current = null;
    }
    if (scheduleIdRef.current !== null) {
      Tone.Transport.clear(scheduleIdRef.current);
      scheduleIdRef.current = null;
    }
    stopAllVocalAudio();
    Tone.Transport.stop();
    Tone.Transport.cancel();
    Tone.Transport.seconds = 0;
    playbackStepRef.current = 0;
    totalStepsRef.current = 1;
    playbackDurationSecondsRef.current = 0;
  };

  const startProgressAnimation = () => {
    if (playbackRafRef.current !== null) {
      cancelAnimationFrame(playbackRafRef.current);
      playbackRafRef.current = null;
    }

    const tick = () => {
      if (!isPlayingRef.current || !activeSongIdRef.current) {
        playbackRafRef.current = null;
        return;
      }

      const totalDuration = playbackDurationSecondsRef.current;
      if (totalDuration > 0) {
        const nextProgress = Math.max(
          0,
          Math.min(1, Tone.Transport.seconds / totalDuration)
        );
        setPlaybackProgress((prev) =>
          Math.abs(prev - nextProgress) > 0.0005 ? nextProgress : prev
        );
      }

      playbackRafRef.current = requestAnimationFrame(tick);
    };

    playbackRafRef.current = requestAnimationFrame(tick);
  };

  const applySongFxSettings = (project: Project) => {
    const master = masterGainRef.current;
    const reverb = reverbRef.current;
    const drumDry = drumDryGainRef.current;
    const drumWet = drumWetGainRef.current;
    const drumReverb = drumReverbRef.current;
    const filter = sfxFilterRef.current;
    const distortion = sfxDistortionRef.current;
    if (!master || !reverb || !drumDry || !drumWet || !drumReverb || !filter || !distortion) return;

    const settings = project.settings;
    const nextMaster = Math.max(0, Math.min(1, settings.masterVolume ?? 0.9));
    const nextWet = Math.max(0, Math.min(1, settings.reverbWet ?? 0.2));
    const nextDecay = Math.max(0.2, Math.min(10, settings.reverbDecay ?? 2.5));
    const nextDrumVolume = Math.max(0, Math.min(1, settings.drumVolume ?? 0.9));
    const nextDrumWet = Math.max(0, Math.min(1, settings.drumReverbWet ?? 0.2));
    const nextDrumDecay = Math.max(0.2, Math.min(10, settings.drumReverbDecay ?? 2.2));
    const nextDistortion = Math.max(0, Math.min(1, settings.distortionAmount ?? 0));
    const preset = SFX_PRESET_SETTINGS[settings.sfxPreset ?? "Clean"];

    masterVolumeRef.current = nextMaster;
    master.gain.value = nextMaster;
    reverb.wet.value = nextWet;
    reverb.decay = nextDecay;
    void reverb.generate();
    drumDry.gain.value = nextDrumVolume * (1 - nextDrumWet);
    drumWet.gain.value = nextDrumVolume * nextDrumWet;
    drumReverb.decay = nextDrumDecay;
    void drumReverb.generate();
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

  const connectDrumNode = <T extends Tone.ToneAudioNode>(node: T): T => {
    const drumDry = drumDryGainRef.current;
    const drumReverb = drumReverbRef.current;
    if (drumDry) node.connect(drumDry);
    if (drumReverb) node.connect(drumReverb);
    if (!drumDry && !drumReverb) node.toDestination();
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
      const sessionEmail = data.session.user.email?.toLowerCase() ?? "";
      if (sessionEmail !== OWNER_EMAIL) {
        await supabase.auth.signOut({ scope: "local" });
        router.replace("/login?unauthorized=1");
        return;
      }
      setViewerId(data.session.user.id);
      setViewerEmail(data.session.user.email ?? null);
      setViewerName(nameFromEmail(data.session.user.email));
      setAuthReady(true);
    };

    void ensureAuthenticated();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        const sessionEmail = session.user.email?.toLowerCase() ?? "";
        if (sessionEmail !== OWNER_EMAIL) {
          void supabase.auth.signOut({ scope: "local" });
          setViewerId(null);
          setViewerEmail(null);
          setViewerName("there");
          setAuthReady(false);
          router.replace("/login?unauthorized=1");
          return;
        }
        setViewerId(session.user.id);
        setViewerEmail(session.user.email ?? null);
        setViewerName(nameFromEmail(session.user.email));
        setAuthReady(true);
        return;
      }
      setViewerId(null);
      setViewerEmail(null);
      setViewerName("there");
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
    if (!viewerId) return;

    async function loadSongs() {
      const { data, error } = await supabase
        .from("songs")
        .select("*")
        .eq("user_id", viewerId)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false });

      if (error) {
        console.error("Error loading songs:", error);
        return;
      }

      setSongs(data || []);
    }

    loadSongs();
  }, [authReady, viewerId]);

  useEffect(() => {
    if (!viewerEmail) {
      setPinnedSongIds([]);
      return;
    }
    const key = `melodica:pinnedSongs:${viewerEmail}`;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        setPinnedSongIds([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setPinnedSongIds([]);
        return;
      }
      const valid = parsed.filter((id): id is string => typeof id === "string");
      setPinnedSongIds(valid.slice(0, 3));
    } catch {
      setPinnedSongIds([]);
    }
  }, [viewerEmail]);

  useEffect(() => {
    if (!viewerEmail) return;
    const key = `melodica:pinnedSongs:${viewerEmail}`;
    try {
      window.localStorage.setItem(key, JSON.stringify(pinnedSongIds.slice(0, 3)));
    } catch {
      // ignore storage write failures
    }
  }, [pinnedSongIds, viewerEmail]);

  useEffect(() => {
    const synthBank = synthBankRef.current;
    const master = new Tone.Gain(0.9).toDestination();
    const reverb = new Tone.Reverb({ decay: 2.5, wet: 0.2 });
    const drumReverb = new Tone.Reverb({ decay: 2.2, wet: 1 });
    const drumDry = new Tone.Gain(1);
    const drumWet = new Tone.Gain(0);
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
    drumDry.toDestination();
    drumReverb.connect(drumWet);
    drumWet.toDestination();
    sfxFilter.connect(sfxDistortion);
    sfxDistortion.connect(master);
    masterGainRef.current = master;
    reverbRef.current = reverb;
    drumReverbRef.current = drumReverb;
    drumDryGainRef.current = drumDry;
    drumWetGainRef.current = drumWet;
    sfxFilterRef.current = sfxFilter;
    sfxDistortionRef.current = sfxDistortion;

    kickRef.current = [
      connectDrumNode(new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 7,
        envelope: { attack: 0.001, decay: 0.16, sustain: 0 },
      })),
      connectDrumNode(new Tone.MembraneSynth({
        pitchDecay: 0.06,
        octaves: 10,
        envelope: { attack: 0.001, decay: 0.30, sustain: 0 },
      })),
      connectDrumNode(new Tone.MembraneSynth({
        pitchDecay: 0.03,
        octaves: 6,
        envelope: { attack: 0.001, decay: 0.12, sustain: 0 },
      })),
    ];

    snareRef.current = [
      connectDrumNode(new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.12, sustain: 0 },
      })),
      connectDrumNode(new Tone.NoiseSynth({
        noise: { type: "pink" },
        envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
      })),
      connectDrumNode(new Tone.NoiseSynth({
        noise: { type: "brown" },
        envelope: { attack: 0.001, decay: 0.08, sustain: 0 },
      })),
    ];

    hatRef.current = [
      (() => {
        const h = connectDrumNode(new Tone.MetalSynth({
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
        const h = connectDrumNode(new Tone.MetalSynth({
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
        const h = connectDrumNode(new Tone.MetalSynth({
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
      connectDrumNode(new Tone.MembraneSynth({
        pitchDecay: 0.03,
        octaves: 4,
        envelope: { attack: 0.001, decay: 0.22, sustain: 0 },
      })),
      connectDrumNode(new Tone.MembraneSynth({
        pitchDecay: 0.025,
        octaves: 3,
        envelope: { attack: 0.001, decay: 0.20, sustain: 0 },
      })),
      connectDrumNode(new Tone.MembraneSynth({
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
      drumWet.dispose();
      drumDry.dispose();
      drumReverb.dispose();
      reverb.dispose();
      master.dispose();
      sfxDistortionRef.current = null;
      sfxFilterRef.current = null;
      drumWetGainRef.current = null;
      drumDryGainRef.current = null;
      drumReverbRef.current = null;
      reverbRef.current = null;
      masterGainRef.current = null;
      kickRef.current = [];
      snareRef.current = [];
      hatRef.current = [];
      tomRef.current = [];
    };
  }, []);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    activeSongIdRef.current = activeSongId;
  }, [activeSongId]);

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
        if (playbackRafRef.current !== null) {
          cancelAnimationFrame(playbackRafRef.current);
          playbackRafRef.current = null;
        }
        setIsPlaying(false);
      } else {
        Tone.Transport.start();
        setIsPlaying(true);
        startProgressAnimation();
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
    playbackDurationSecondsRef.current = totalSteps16 * ((60 / safeBpm) / 4);
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
        const reverb = reverbRef.current;
        if (!reverb) {
          const audio = new Audio(clip.url);
          audio.volume = Math.max(
            0,
            Math.min(1, (clip.gain ?? 1) * masterVolumeRef.current)
          );
          audio.currentTime = 0;
          void audio.play().catch(() => {});
          continue;
        }

        try {
          const clipGain = Math.max(0, Math.min(1, clip.gain ?? 1));
          const gain = new Tone.Gain(clipGain);
          const player = new Tone.Player({
            url: clip.url,
            autostart: false,
          });

          player.connect(gain);
          gain.connect(reverb);
          player.start(time);
          player.onstop = () => {
            player.dispose();
            gain.dispose();
            playingVocalPlayersRef.current = playingVocalPlayersRef.current.filter(
              (entry) => entry.player !== player
            );
          };
          playingVocalPlayersRef.current.push({ player, gain });
        } catch {
          // Fallback keeps dashboard playback alive even if Tone.Player cannot start this clip.
          const audio = new Audio(clip.url);
          audio.volume = Math.max(
            0,
            Math.min(1, (clip.gain ?? 1) * masterVolumeRef.current)
          );
          audio.currentTime = 0;
          void audio.play().catch(() => {});
        }
      }

      const isLastStep = step16 >= totalSteps16 - 1;
      const nextStep = isLastStep ? totalSteps16 - 1 : step16 + 1;
      playbackStepRef.current = nextStep;
      Tone.Draw.schedule(() => {
        if (isLastStep) {
          setPlaybackProgress(1);
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
    startProgressAnimation();
  }

  function handleSeek(songId: string, value: number) {
    if (songId !== activeSongId) return;
    const clamped = Math.max(0, Math.min(100, value));
    const targetStep = Math.floor((clamped / 100) * totalStepsRef.current);
    playbackStepRef.current = Math.min(totalStepsRef.current - 1, targetStep);
    const duration = playbackDurationSecondsRef.current;
    if (duration > 0) {
      Tone.Transport.seconds = (clamped / 100) * duration;
    }
    setPlaybackProgress(clamped / 100);
  }

  async function handleDelete(songId: string, title: string | null) {
    const confirmed = window.confirm(
      `Delete "${title ?? "Untitled"}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(songId);
    setOpenMenuSongId(null);
    if (!viewerId) {
      setDeletingId(null);
      return;
    }
    const { error } = await supabase.from("songs").delete().eq("id", songId).eq("user_id", viewerId);
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

  async function handleRename(songId: string, currentTitle: string | null) {
    setOpenMenuSongId(null);
    const currentName = (currentTitle ?? "Untitled").trim();
    const renamed = window.prompt("Rename project", currentName);
    if (renamed === null) return;

    const nextName = renamed.trim();
    if (!nextName) {
      window.alert("Project name can't be empty.");
      return;
    }
    if (nextName === currentName) return;

    if (!viewerId) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("songs")
      .update({
        title: nextName,
        updated_at: now,
      })
      .eq("id", songId)
      .eq("user_id", viewerId);

    if (error) {
      console.error("Error renaming song:", error);
      window.alert("Could not rename project. Please try again.");
      return;
    }

    setSongs((prev) =>
      prev.map((song) =>
        song.id === songId ? { ...song, title: nextName, updated_at: now } : song
      )
    );
  }

  async function updateSongProjectData(song: SongRow, nextProject: Project) {
    if (!viewerId) return { ok: false as const, now: new Date().toISOString() };
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("songs")
      .update({
        title: nextProject.name || song.title || "Untitled",
        bpm: nextProject.bpm || song.bpm || 120,
        project_data: nextProject,
        updated_at: now,
      })
      .eq("id", song.id)
      .eq("user_id", viewerId);

    if (error) return { ok: false as const, now };

    setSongs((prev) =>
      prev.map((s) =>
        s.id === song.id
          ? {
              ...s,
              title: nextProject.name || s.title,
              bpm: nextProject.bpm,
              project_data: nextProject,
              updated_at: now,
            }
          : s
      )
    );
    return { ok: true as const, now };
  }

  function handleRequestCoverUpload(song: SongRow) {
    coverUploadSongRef.current = song;
    setOpenMenuSongId(null);
    coverUploadInputRef.current?.click();
  }

  async function handleCoverInputChange(event: ChangeEvent<HTMLInputElement>) {
    const song = coverUploadSongRef.current;
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    coverUploadSongRef.current = null;
    if (!song || !file) return;
    if (!file.type.startsWith("image/")) {
      window.alert("Please choose an image file.");
      return;
    }
    if (!viewerId) {
      window.alert("You need to be logged in to upload covers.");
      return;
    }

    setUploadingCoverId(song.id);
    try {
      const applyCoverUrl = async (coverUrl: string) => {
        const project = normalizeSongProject(song);
        const nextProject: Project = {
          ...project,
          settings: {
            ...project.settings,
            albumCoverUrl: coverUrl,
          },
          updatedAt: Date.now(),
        };
        const result = await updateSongProjectData(song, nextProject);
        if (!result.ok) {
          window.alert("Could not save cover to project. Please try again.");
        }
      };

      const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
      const safeExt = extension.replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${viewerId}/${song.id}/cover-${Date.now()}.${safeExt}`;
      const { error: uploadError } = await supabase.storage
        .from(COVER_BUCKET)
        .upload(path, file, { upsert: true, cacheControl: "3600" });

      if (!uploadError) {
        const { data } = supabase.storage.from(COVER_BUCKET).getPublicUrl(path);
        await applyCoverUrl(data.publicUrl);
        return;
      }

      // Storage fallback: keep covers usable even if bucket/policies are not set up yet.
      if (file.size > 1_500_000) {
        window.alert("Cover upload failed (storage config) and file is too large for fallback. Use an image under 1.5MB.");
        return;
      }
      const dataUrl = await fileToDataUrl(file);
      await applyCoverUrl(dataUrl);
    } finally {
      setUploadingCoverId(null);
    }
  }

  async function handleRemoveCover(song: SongRow) {
    setOpenMenuSongId(null);
    const project = normalizeSongProject(song);
    if (!project.settings.albumCoverUrl) return;
    const nextProject: Project = {
      ...project,
      settings: {
        ...project.settings,
      },
      updatedAt: Date.now(),
    };
    delete nextProject.settings.albumCoverUrl;
    const result = await updateSongProjectData(song, nextProject);
    if (!result.ok) {
      window.alert("Could not remove cover. Please try again.");
    }
  }

  function handleTogglePin(songId: string) {
    setPinnedSongIds((current) => {
      if (current.includes(songId)) {
        return current.filter((id) => id !== songId);
      }
      return [...current, songId].slice(0, 3);
    });
    setOpenMenuSongId(null);
  }

  async function handleExport(song: SongRow) {
    if (exportingId) return;
    setOpenMenuSongId(null);
    setExportingId(song.id);
    const project = normalizeSongProject(song);
    const fileSafeTitle = (song.title ?? "untitled")
      .trim()
      .replace(/[^a-z0-9-_ ]/gi, "")
      .replace(/\s+/g, "-")
      .toLowerCase();

    try {
      const bpm = Math.max(20, Math.min(400, Number(project.bpm) || 120));
      const step16Duration = (60 / bpm) / 4;
      const totalSteps16 = getPlayableSteps16(project);
      const totalDurationSeconds =
        totalSteps16 * step16Duration + Math.max(1.5, project.settings.reverbDecay + 0.5);

      const rendered = await Tone.Offline(async () => {
        const reverbWet = Math.max(0, Math.min(1, project.settings.reverbWet ?? 0.2));
        const master = new Tone.Gain(
          Math.max(0, Math.min(1, project.settings.masterVolume ?? 0.9))
        ).toDestination();
        const dryGain = new Tone.Gain(1);
        const wetGain = new Tone.Gain(reverbWet);
        const reverb = new Tone.Reverb({
          decay: Math.max(0.2, Math.min(10, project.settings.reverbDecay ?? 2.5)),
          wet: 1,
        });
        await reverb.generate();
        const sfxFilter = new Tone.Filter({
          type: "lowpass",
          frequency: 20000,
          Q: 0.0001,
        });
        const sfxDistortion = new Tone.Distortion({
          distortion: Math.max(0, Math.min(1, project.settings.distortionAmount ?? 0)),
          wet: 1,
        });
        const preset = SFX_PRESET_SETTINGS[project.settings.sfxPreset ?? "Clean"];
        sfxFilter.type = preset.filterType;
        sfxFilter.frequency.value = preset.filterFrequency;
        sfxFilter.Q.value = preset.filterQ;

        dryGain.connect(sfxFilter);
        reverb.connect(wetGain);
        wetGain.connect(sfxFilter);
        sfxFilter.connect(sfxDistortion);
        sfxDistortion.connect(master);

        const connect = <T extends Tone.ToneAudioNode>(node: T): T => {
          node.connect(dryGain);
          node.connect(reverb);
          return node;
        };

        const synthBank = new Map<MelodyInstrument, MelodyPolySynth>();
        const getSynth = (instrument: MelodyInstrument) => {
          const normalized = normalizeInstrument(instrument);
          const existing = synthBank.get(normalized);
          if (existing) return existing;
          const created = connect(createMelodySynthPreset(normalized));
          synthBank.set(normalized, created);
          return created;
        };

        for (const note of project.notes) {
          const startTime = Math.max(0, note.startBeat * 2) * step16Duration;
          const durationTime = Math.max(1, note.durationBeats * 2) * step16Duration;
          getSynth(normalizeInstrument(note.instrument)).triggerAttackRelease(
            note.pitch,
            durationTime,
            startTime,
            note.velocity ?? 0.8
          );
        }

        const kick = [
          connect(new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 7, envelope: { attack: 0.001, decay: 0.16, sustain: 0 } })),
          connect(new Tone.MembraneSynth({ pitchDecay: 0.06, octaves: 10, envelope: { attack: 0.001, decay: 0.30, sustain: 0 } })),
          connect(new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 6, envelope: { attack: 0.001, decay: 0.12, sustain: 0 } })),
        ];
        const snare = [
          connect(new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.12, sustain: 0 } })),
          connect(new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.001, decay: 0.18, sustain: 0 } })),
          connect(new Tone.NoiseSynth({ noise: { type: "brown" }, envelope: { attack: 0.001, decay: 0.08, sustain: 0 } })),
        ];
        const hat = [
          (() => {
            const h = connect(new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.05, release: 0.01 }, harmonicity: 5.1, modulationIndex: 28, resonance: 2500, octaves: 1.2 }));
            h.frequency.value = 250;
            return h;
          })(),
          (() => {
            const h = connect(new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.11, release: 0.02 }, harmonicity: 5.1, modulationIndex: 32, resonance: 3500, octaves: 1.6 }));
            h.frequency.value = 300;
            return h;
          })(),
          (() => {
            const h = connect(new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.07, release: 0.01 }, harmonicity: 5.1, modulationIndex: 40, resonance: 5200, octaves: 1.4 }));
            h.frequency.value = 220;
            return h;
          })(),
        ];
        const tom = [
          connect(new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 4, envelope: { attack: 0.001, decay: 0.22, sustain: 0 } })),
          connect(new Tone.MembraneSynth({ pitchDecay: 0.025, octaves: 3, envelope: { attack: 0.001, decay: 0.20, sustain: 0 } })),
          connect(new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 2, envelope: { attack: 0.001, decay: 0.18, sustain: 0 } })),
        ];

        for (const hit of project.drumTracks.flatMap((track) => track.hits)) {
          const when = Math.max(0, hit.step) * step16Duration;
          const velocity = hit.velocity ?? 0.9;
          const variant = hit.variant ?? 0;
          if (hit.drum === "kick") kick[variant]?.triggerAttackRelease("C1", "16n", when, velocity);
          if (hit.drum === "snare") snare[variant]?.triggerAttackRelease("16n", when, velocity);
          if (hit.drum === "hat") hat[variant]?.triggerAttackRelease("16n", when, velocity);
          if (hit.drum === "tom") tom[variant]?.triggerAttackRelease("G2", "16n", when, velocity);
        }

        const vocalClips = project.audioTracks.flatMap((track) => track.clips);
        await Promise.all(
          vocalClips.map(async (clip) => {
            try {
              const clipGain = new Tone.Gain(Math.max(0, Math.min(1, clip.gain ?? 1)));
              const player = new Tone.Player({ autostart: false });
              player.connect(clipGain);
              clipGain.connect(reverb);
              await player.load(clip.url);
              player.start(Math.max(0, clip.startStep16) * step16Duration);
            } catch {
              // skip clips that fail to load during export
            }
          })
        );
      }, totalDurationSeconds);

      const mp3Blob = await encodeAudioBufferToMp3(rendered);
      const url = URL.createObjectURL(mp3Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileSafeTitle || "melodica-project"}.mp3`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting MP3:", error);
      window.alert("MP3 export failed. Please try again.");
    } finally {
      setExportingId(null);
    }
  }

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      const signOutPromise = supabase.auth.signOut({ scope: "local" });
      await Promise.race([
        signOutPromise,
        new Promise((resolve) => window.setTimeout(resolve, 2500)),
      ]);
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      router.replace("/login");
      window.location.assign("/login");
    }
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

  const explicitPinned = pinnedSongIds
    .map((id) => songs.find((song) => song.id === id))
    .filter((song): song is SongRow => Boolean(song));
  const pinnedProjects = explicitPinned.slice(0, 3);
  const pinnedGridClass =
    pinnedProjects.length === 2
      ? "mt-3 grid grid-cols-1 gap-3 md:grid-cols-2"
      : pinnedProjects.length === 3
        ? "mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"
        : "mt-3 grid grid-cols-1 gap-3";
  
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#ffffff_0%,#e8edf4_50%,#dfe6ef_100%)] p-8 dark:bg-[radial-gradient(circle_at_top,#353844_0%,#2c2f38_55%,#23262e_100%)]">
      <div className="mx-auto max-w-5xl rounded-3xl border border-white/60 bg-white/50 p-6 shadow-2xl shadow-slate-400/20 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/35 dark:shadow-black/20">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-base opacity-75 md:text-lg">{`Welcome ${viewerName}.`}</p>
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Dashboard</h1>
          <p className="mt-1 text-sm opacity-80">
            Your projects will show up here.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={isLoggingOut}
          className="rounded-md bg-slate-800 px-4 py-2 text-sm text-white transition-all duration-200 hover:bg-slate-700 hover:shadow-[0_0_18px_rgba(255,255,255,0.5)] dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white dark:hover:shadow-[0_0_18px_rgba(255,255,255,0.5)]"
        >
          {isLoggingOut ? "Logging out..." : "Log Out"}
        </button>
      </header>

      <div className="mt-10 w-full">
        <Link
          href="/editor"
          className="flex w-full items-center justify-center rounded-xl bg-emerald-500 px-6 py-5 text-base font-semibold text-white shadow-sm transition-all duration-200 hover:bg-emerald-600 hover:shadow-[0_0_18px_rgba(74,222,128,0.55)] dark:bg-emerald-400 dark:text-slate-900 dark:hover:bg-emerald-300 dark:hover:shadow-[0_0_18px_rgba(74,222,128,0.4)]"
        >
          + New Project
        </Link>
      </div>
      <input
        ref={coverUploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleCoverInputChange(e)}
      />

      {pinnedProjects.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] opacity-65">
            Pinned Projects
          </h2>
          <div className={pinnedGridClass}>
            {pinnedProjects.map((song) => {
              const isActive = activeSongId === song.id;
              const isSongPlaying = isActive && isPlaying;
              const totalSeconds = getSongDurationSeconds(song);
              const currentSeconds = isSongPlaying ? playbackProgress * totalSeconds : 0;
              const sliderValue = isActive ? playbackProgress * 100 : 0;
              const isPinned = pinnedSongIds.includes(song.id);
              const coverUrl = getSongCoverUrl(song);
              return (
                <div
                  key={`pinned-${song.id}`}
                  className="relative rounded-2xl bg-white/65 p-4 shadow-sm ring-1 ring-white/40 backdrop-blur dark:bg-zinc-800/45 dark:ring-white/10"
                >
                  <button
                    type="button"
                    onClick={() => handleTogglePin(song.id)}
                    aria-label={isPinned ? "Unpin project" : "Pin project"}
                    className="absolute right-3 top-3 flex items-center justify-center px-1 py-0.5 text-slate-900 transition-all duration-200 hover:scale-110 hover:[text-shadow:0_0_10px_rgba(255,255,255,0.75)] dark:text-slate-100 dark:hover:[text-shadow:0_0_10px_rgba(255,255,255,0.45)]"
                  >
                    <span className="text-sm font-semibold leading-none" aria-hidden="true">
                      ×
                    </span>
                  </button>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleRequestCoverUpload(song)}
                      disabled={uploadingCoverId === song.id}
                      aria-label={coverUrl ? "Replace album cover" : "Upload album cover"}
                      className="shrink-0 rounded-xl transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {coverUrl ? (
                        <img
                          src={coverUrl}
                          alt={`${song.title ?? "Untitled"} cover`}
                          className="h-12 w-12 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/60 text-sm font-semibold text-slate-600 dark:bg-zinc-700/60 dark:text-slate-300">
                          Art
                        </div>
                      )}
                    </button>
                    <p className="truncate text-lg font-semibold">{song.title ?? "Untitled"}</p>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handlePlayPause(song)}
                      aria-label={isSongPlaying ? "Pause" : "Play"}
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-white/85 text-sm text-slate-900 shadow-sm transition-all duration-200 hover:bg-white hover:shadow-[0_0_14px_rgba(255,255,255,0.65)] dark:bg-zinc-700/70 dark:text-slate-100 dark:hover:bg-zinc-700"
                    >
                      {isSongPlaying ? (
                        <span className="flex items-center gap-1">
                          <span className="h-4 w-1 rounded-sm bg-current" />
                          <span className="h-4 w-1 rounded-sm bg-current" />
                        </span>
                      ) : (
                        "▶"
                      )}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={sliderValue}
                      onInput={(e) => handleSeek(song.id, Number(e.currentTarget.value))}
                      onChange={(e) => handleSeek(song.id, Number(e.currentTarget.value))}
                      className="dashboard-slider h-2 w-full appearance-none rounded-full transition-all duration-200"
                      style={{
                        background: `linear-gradient(90deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.96) ${sliderValue.toFixed(3)}%, rgba(148,163,184,0.35) ${sliderValue.toFixed(3)}%, rgba(148,163,184,0.35) 100%)`,
                        boxShadow:
                          isSongPlaying
                            ? "0 0 16px rgba(255,255,255,0.8), inset 0 0 8px rgba(255,255,255,0.55)"
                            : "inset 0 0 6px rgba(255,255,255,0.25)",
                      }}
                    />
                    <span className="text-sm opacity-80">
                      {isSongPlaying
                        ? formatDuration(currentSeconds)
                        : formatDuration(totalSeconds)}
                    </span>
                    <button
                      type="button"
                      onClick={() => router.push(`/editor?id=${song.id}`)}
                      className="shrink-0 rounded-md bg-slate-200/85 px-3 py-1 text-sm font-medium text-slate-800 transition-all duration-200 hover:bg-slate-200 dark:bg-zinc-700/85 dark:text-slate-100 dark:hover:bg-zinc-700"
                    >
                      Open
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

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
                const sliderValue = isActive ? playbackProgress * 100 : 0;
                const coverUrl = getSongCoverUrl(song);
                return (
              <div
                key={song.id}
                className={`relative rounded-xl border border-white/60 bg-white/55 p-4 backdrop-blur dark:border-white/10 dark:bg-zinc-800/40 ${
                  openMenuSongId === song.id ? "z-30" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleRequestCoverUpload(song)}
                        disabled={uploadingCoverId === song.id}
                        aria-label={coverUrl ? "Replace album cover" : "Upload album cover"}
                        className="shrink-0 rounded-lg transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {coverUrl ? (
                          <img
                            src={coverUrl}
                            alt={`${song.title ?? "Untitled"} cover`}
                            className="h-10 w-10 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/60 text-xs font-semibold text-slate-600 dark:bg-zinc-700/60 dark:text-slate-300">
                            Art
                          </div>
                        )}
                      </button>
                      <p className="font-medium">{song.title}</p>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => void handlePlayPause(song)}
                        aria-label={activeSongId === song.id && isPlaying ? "Pause" : "Play"}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/70 text-sm text-slate-800 transition-all duration-200 hover:bg-white hover:shadow-[0_0_18px_rgba(255,255,255,0.65)] dark:bg-zinc-700/50 dark:text-slate-100 dark:hover:bg-zinc-700/80 dark:hover:shadow-[0_0_18px_rgba(255,255,255,0.35)]"
                      >
                        {activeSongId === song.id && isPlaying ? (
                          <span className="flex items-center gap-1">
                            <span className="h-4 w-1 rounded-sm bg-current" />
                            <span className="h-4 w-1 rounded-sm bg-current" />
                          </span>
                        ) : (
                          "▶"
                        )}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={sliderValue}
                        onInput={(e) => handleSeek(song.id, Number(e.currentTarget.value))}
                        onChange={(e) => handleSeek(song.id, Number(e.currentTarget.value))}
                        className="dashboard-slider h-2 w-full appearance-none rounded-full border border-white/70 transition-all duration-200"
                        style={{
                          background: `linear-gradient(90deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.96) ${sliderValue.toFixed(3)}%, rgba(148,163,184,0.35) ${sliderValue.toFixed(3)}%, rgba(148,163,184,0.35) 100%)`,
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
                  <div className="flex items-center gap-2 self-center">
                    <button
                      onClick={() => router.push(`/editor?id=${song.id}`)}
                      className="rounded-md bg-white/70 px-3 py-1 text-sm text-slate-800 transition-all duration-200 hover:bg-white hover:shadow-[0_0_18px_rgba(255,255,255,0.65)] dark:bg-zinc-700/50 dark:text-slate-100 dark:hover:bg-zinc-700/80 dark:hover:shadow-[0_0_18px_rgba(255,255,255,0.35)]"
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
                            onClick={() => handleRequestCoverUpload(song)}
                            disabled={uploadingCoverId === song.id}
                            className="w-full rounded-md px-3 py-1.5 text-left text-sm text-slate-800 transition-all duration-150 hover:bg-white hover:shadow-[0_0_14px_rgba(255,255,255,0.65)] disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-100 dark:hover:bg-zinc-700/80 dark:hover:shadow-[0_0_14px_rgba(255,255,255,0.35)]"
                          >
                            {uploadingCoverId === song.id ? "Uploading..." : "Upload Cover"}
                          </button>
                          {coverUrl && (
                            <button
                              type="button"
                              onClick={() => void handleRemoveCover(song)}
                              className="mt-1 w-full rounded-md px-3 py-1.5 text-left text-sm text-slate-800 transition-all duration-150 hover:bg-white hover:shadow-[0_0_14px_rgba(255,255,255,0.65)] dark:text-slate-100 dark:hover:bg-zinc-700/80 dark:hover:shadow-[0_0_14px_rgba(255,255,255,0.35)]"
                            >
                              Remove Cover
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleTogglePin(song.id)}
                            className="mt-1 w-full rounded-md px-3 py-1.5 text-left text-sm text-slate-800 transition-all duration-150 hover:bg-white hover:shadow-[0_0_14px_rgba(255,255,255,0.65)] dark:text-slate-100 dark:hover:bg-zinc-700/80 dark:hover:shadow-[0_0_14px_rgba(255,255,255,0.35)]"
                          >
                            {pinnedSongIds.includes(song.id) ? "Unpin" : "Pin"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRename(song.id, song.title)}
                            className="mt-1 w-full rounded-md px-3 py-1.5 text-left text-sm text-slate-800 transition-all duration-150 hover:bg-white hover:shadow-[0_0_14px_rgba(255,255,255,0.65)] dark:text-slate-100 dark:hover:bg-zinc-700/80 dark:hover:shadow-[0_0_14px_rgba(255,255,255,0.35)]"
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleExport(song)}
                            disabled={exportingId === song.id}
                            className="mt-1 w-full rounded-md px-3 py-1.5 text-left text-sm text-slate-800 transition-all duration-150 hover:bg-white hover:shadow-[0_0_14px_rgba(255,255,255,0.65)] disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-100 dark:hover:bg-zinc-700/80 dark:hover:shadow-[0_0_14px_rgba(255,255,255,0.35)]"
                          >
                            {exportingId === song.id ? "Exporting..." : "Export"}
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
