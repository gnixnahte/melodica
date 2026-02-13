export type NoteEvent = {
    id: string;
    pitch: string;
    startBeat: number;
    durationBeats: number;
    velocity?: number;
  };
  
  export type ProjectSettings = {
    masterVolume: number;
    reverbWet: number;
    reverbDecay: number;
  };
  
  export type Project = {
    id: string;
    name: string;
    bpm: number;
    scale: "C_MAJOR";
    octaves: number;
    notes: NoteEvent[];
    settings: ProjectSettings;
    updatedAt: number;
  };