import type { Project } from "@/types/project";

export function createDefaultProject(name = "Untitled"): Project {
  return {
    id: crypto.randomUUID(),
    name,
    bpm: 120,
    scale: "C_MAJOR",
    octaves: 2,
    notes: [],
    settings: {
      masterVolume: 0.9,
      reverbWet: 0.2,
      reverbDecay: 2.5,
    },
    updatedAt: Date.now(),
  };
}