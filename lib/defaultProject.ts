import type { Project } from "@/types/project";

export function createDefaultProject(name = "Untitled"): Project {
  return {
    id: crypto.randomUUID(),
    name,
    bpm: 120,
    keyRoot: "C",
    scaleFamily: "MAJOR",
    lowOctave: 3,
    highOctave: 5,
    bars: 8,
    notes: [],
    audioTracks: [
      { id: crypto.randomUUID(), name: "Mic", clips: [] },
    ],
    settings: {
      masterVolume: 0.9,
      reverbWet: 0.2,
      reverbDecay: 2.5,
      drumVolume: 0.9,
      drumReverbWet: 0.2,
      drumReverbDecay: 2.2,
      sfxPreset: "Clean",
      distortionAmount: 0,
    },
    drumTracks: [
      { id: crypto.randomUUID(), drum: "kick", variant: 0, hits: [] },
      { id: crypto.randomUUID(), drum: "snare", variant: 0, hits: [] },
      { id: crypto.randomUUID(), drum: "hat", variant: 0, hits: [] },
      { id: crypto.randomUUID(), drum: "tom", variant: 0, hits: [] },
    ],
    updatedAt: Date.now(),
  };
}
