"use client";

import { useEffect, useRef, useState } from "react";
import type { Project, MelodyInstrument, NoteEvent } from "@/types/project";
import { hasNoteAt, getNoteOccupying, normalizeInstrument } from "@/lib/editorUtils";
import {
  CELL_W,
  CELL_H,
  NOTE_RESIZE_HANDLE_PX,
  NOTE_INSTRUMENT_COLORS,
  NOTE_STEPS_PER_BAR,
} from "./constants";

export type Step16FromClientX = (clientX: number, el: HTMLElement) => number;

export interface PianoRollProps {
  project: Project;
  setProject: React.Dispatch<React.SetStateAction<Project>>;
  pitches: string[];
  noteWindow: { start: number; end: number };
  gridBeats: number;
  scrollLeft: number;
  noteScrollRef: React.RefObject<HTMLDivElement | null>;
  rulerRef: React.RefObject<HTMLDivElement | null>;
  onNoteScroll: () => void;
  step16FromClientX: Step16FromClientX;
  setPlayheadStep16: (step16: number) => void;
  isScrubbingRef: React.MutableRefObject<boolean>;
  notePlayheadPx: number;
  playheadIndicatorX: number;
  playheadIndicatorLabel: string;
  noteViewportWidth: number;
  barWidthPx: number;
  bars: number;
  clearPendingNoteDelete: () => void;
  setNoteMenu: (menu: { noteId: string; x: number; y: number } | null) => void;
  noteResizeRef: React.MutableRefObject<{
    noteId: string;
    pitch: string;
    startBeat: number;
  } | null>;
  suppressDeleteClickRef: React.MutableRefObject<boolean>;
  justSpawnedNoteIdRef: React.MutableRefObject<string | null>;
  noteDeleteTimeoutRef: React.MutableRefObject<number | null>;
  onPreviewNote: (
    pitch: string,
    velocity: number,
    instrument: MelodyInstrument
  ) => void;
  updateNoteById: (noteId: string, patch: Partial<NoteEvent>) => void;
  defaultInstrument: MelodyInstrument;
  isRecordingVocals: boolean;
  vocalCountdown: number | null;
  currentStep16: number;
  recordingStartStep16: number | null;
  onToggleVocalRecording: () => void | Promise<void>;
  audioInputDevices: MediaDeviceInfo[];
  selectedAudioInputId: string;
  onSelectedAudioInputIdChange: (deviceId: string) => void;
}

export function PianoRoll({
  project,
  setProject,
  pitches,
  noteWindow,
  gridBeats,
  scrollLeft,
  noteScrollRef,
  rulerRef,
  onNoteScroll,
  step16FromClientX,
  setPlayheadStep16,
  isScrubbingRef,
  notePlayheadPx,
  playheadIndicatorX,
  playheadIndicatorLabel,
  noteViewportWidth,
  barWidthPx,
  bars,
  clearPendingNoteDelete,
  setNoteMenu,
  noteResizeRef,
  suppressDeleteClickRef,
  justSpawnedNoteIdRef,
  noteDeleteTimeoutRef,
  onPreviewNote,
  updateNoteById,
  defaultInstrument,
  isRecordingVocals,
  vocalCountdown,
  currentStep16,
  recordingStartStep16,
  onToggleVocalRecording,
  audioInputDevices,
  selectedAudioInputId,
  onSelectedAudioInputIdChange,
}: PianoRollProps) {
  type VocalMenuState = {
    clipId: string;
    x: number;
    y: number;
  };
  type VocalResizeState = {
    clipId: string;
    edge: "left" | "right";
    anchorStep16: number;
  };
  type MicInputMenuState = {
    x: number;
    y: number;
  };

  const [vocalMenu, setVocalMenu] = useState<VocalMenuState | null>(null);
  const [micInputMenu, setMicInputMenu] = useState<MicInputMenuState | null>(null);
  const vocalMenuRef = useRef<HTMLDivElement | null>(null);
  const micInputMenuRef = useRef<HTMLDivElement | null>(null);
  const micButtonRef = useRef<HTMLButtonElement | null>(null);
  const micClickTimeoutRef = useRef<number | null>(null);
  const vocalResizeRef = useRef<VocalResizeState | null>(null);
  const melodicPitches = pitches.length > 1 ? pitches.slice(0, -1) : pitches;
  const micTrack = project.audioTracks[0];
  const clipVisuals = micTrack?.clips ?? [];
  const recordingClip =
    isRecordingVocals && recordingStartStep16 !== null
      ? {
          startStep16: recordingStartStep16,
          durationStep16: Math.max(1, currentStep16 - recordingStartStep16 + 1),
        }
      : null;
  const allVisualClips = recordingClip ? [...clipVisuals, recordingClip] : clipVisuals;
  const selectedVocalClip = vocalMenu
    ? clipVisuals.find((clip) => clip.id === vocalMenu.clipId) ?? null
    : null;

  useEffect(() => {
    if (!vocalMenu) return;

    const onMouseDown = (event: MouseEvent) => {
      if (!vocalMenuRef.current) return;
      if (vocalMenuRef.current.contains(event.target as Node)) return;
      setVocalMenu(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setVocalMenu(null);
    };

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [vocalMenu]);

  useEffect(() => {
    if (!micInputMenu) return;

    const onMouseDown = (event: MouseEvent) => {
      if (!micInputMenuRef.current) return;
      if (micInputMenuRef.current.contains(event.target as Node)) return;
      if (micButtonRef.current?.contains(event.target as Node)) return;
      setMicInputMenu(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMicInputMenu(null);
    };

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [micInputMenu]);

  useEffect(() => {
    return () => {
      if (micClickTimeoutRef.current !== null) {
        window.clearTimeout(micClickTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onMouseUp = () => {
      if (!vocalResizeRef.current) return;
      vocalResizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    const onMouseMove = (e: MouseEvent) => {
      const resize = vocalResizeRef.current;
      const gridEl = noteScrollRef.current;
      if (!resize || !gridEl) return;

      e.preventDefault();
      const rect = gridEl.getBoundingClientRect();
      const xInGrid = e.clientX - rect.left + gridEl.scrollLeft;
      const beat = Math.max(0, Math.min(gridBeats - 1, Math.floor(xInGrid / CELL_W)));
      const offsetX = Math.max(0, Math.min(CELL_W - 0.01, xInGrid - beat * CELL_W));
      const pointerStep16 = beat * 2 + (offsetX >= CELL_W / 2 ? 1 : 0);

      setProject((p) => {
        const tracks = p.audioTracks.length > 0 ? p.audioTracks : [{ id: crypto.randomUUID(), name: "Mic", clips: [] }];
        const primary = tracks[0];
        const maxStep16 = p.bars * NOTE_STEPS_PER_BAR * 2;
        return {
          ...p,
          audioTracks: [
            {
              ...primary,
              clips: primary.clips.map((clip) => {
                if (clip.id !== resize.clipId) return clip;
                if (resize.edge === "left") {
                  const nextStart = Math.max(
                    0,
                    Math.min(resize.anchorStep16 - 1, pointerStep16)
                  );
                  return {
                    ...clip,
                    startStep16: nextStart,
                    durationStep16: resize.anchorStep16 - nextStart,
                  };
                }
                const requestedEnd = pointerStep16 + 1;
                const nextEnd = Math.min(maxStep16, Math.max(resize.anchorStep16 + 1, requestedEnd));
                return {
                  ...clip,
                  startStep16: resize.anchorStep16,
                  durationStep16: Math.max(1, nextEnd - resize.anchorStep16),
                };
              }),
            },
            ...tracks.slice(1),
          ],
          updatedAt: Date.now(),
        };
      });
    };

    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove, { passive: false });
    return () => {
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, [gridBeats, noteScrollRef, setProject]);

  const handleMicButtonClick = () => {
    if (micClickTimeoutRef.current !== null) {
      window.clearTimeout(micClickTimeoutRef.current);
    }
    micClickTimeoutRef.current = window.setTimeout(() => {
      void onToggleVocalRecording();
      micClickTimeoutRef.current = null;
    }, 220);
  };

  const handleMicButtonDoubleClick = () => {
    if (micClickTimeoutRef.current !== null) {
      window.clearTimeout(micClickTimeoutRef.current);
      micClickTimeoutRef.current = null;
    }
    const rect = micButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = 230;
    const menuHeight = 120;
    const x = Math.min(rect.right + 10, window.innerWidth - menuWidth - 12);
    const y = Math.min(rect.bottom + 8, window.innerHeight - menuHeight - 12);
    setMicInputMenu({ x, y });
  };

  return (
    <div className="mx-4 mb-2 mt-2 flex-1 overflow-auto rounded-2xl border border-white/60 bg-white/50 shadow-xl shadow-slate-300/15 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/35 dark:shadow-black/20">
      <div className="flex flex-row pt-2 pb-2 pl-2 text-sm">
        <div className="mr-2 flex shrink-0 flex-col">
          <div className="mb-1 h-8" />
          <ul className="flex w-14 list-none flex-col items-center gap-0.5 rounded-md px-0 py-0 text-lg">
            {melodicPitches.map((pitch) => (
              <li
                key={pitch}
                className="flex w-full items-center justify-center rounded-lg border border-zinc-500 bg-zinc-700 px-1 text-sm text-white dark:border-zinc-500 dark:bg-zinc-700"
                style={{ height: CELL_H - 2, minHeight: CELL_H - 2 }}
              >
                {pitch}
              </li>
            ))}
          </ul>
          <button
            ref={micButtonRef}
            type="button"
            onClick={handleMicButtonClick}
            onDoubleClick={handleMicButtonDoubleClick}
            className={`mt-0.5 flex w-full items-center justify-center rounded-lg border text-xs font-semibold transition-all duration-200 hover:shadow-[0_0_16px_rgba(255,255,255,0.72)] ${
              isRecordingVocals || vocalCountdown !== null
                ? "border-red-400 bg-red-500 text-white hover:bg-red-600"
                : "border-zinc-500 bg-zinc-700 text-white hover:bg-zinc-600 dark:border-zinc-500 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600"
            }`}
            style={{ height: CELL_H, minHeight: CELL_H }}
          >
            {vocalCountdown !== null
              ? `Rec ${vocalCountdown}`
              : isRecordingVocals
                ? "Stop Vox"
                : "Mic"}
          </button>
        </div>

        <div className="w-full min-w-0">
          <div className="sticky top-0 z-30 mb-1 relative rounded-md bg-white/65 backdrop-blur-sm dark:bg-zinc-900/50">
            {noteViewportWidth > 0 && (
              <div
                className="absolute top-1 z-40 -translate-x-1/2 rounded bg-yellow-300 px-1.5 py-0.5 text-[10px] font-semibold text-black pointer-events-none"
                style={{ left: playheadIndicatorX }}
              >
                {playheadIndicatorLabel}
              </div>
            )}
            <div className="relative h-8 overflow-hidden rounded-lg bg-slate-500/70 dark:bg-zinc-700/75">
              <div
                ref={rulerRef}
                className="relative h-8 select-none"
                style={{
                  width: gridBeats * CELL_W,
                  transform: `translateX(${-scrollLeft}px)`,
                }}
                onMouseDown={(e) => {
                  if (!rulerRef.current) return;
                  const b = step16FromClientX(e.clientX, rulerRef.current);
                  setPlayheadStep16(b);
                  isScrubbingRef.current = true;
                }}
                onMouseMove={(e) => {
                  if (!isScrubbingRef.current) return;
                  if (!rulerRef.current) return;
                  const b = step16FromClientX(e.clientX, rulerRef.current);
                  setPlayheadStep16(b);
                }}
              >
                {Array.from({ length: bars }, (_, barIndex) => {
                  const left = barIndex * barWidthPx;
                  return (
                    <div key={`bar-mark-${barIndex}`}>
                <div
                  className="absolute top-0 bottom-0 w-px bg-slate-300/70 pointer-events-none dark:bg-zinc-500/60"
                  style={{ left }}
                />
                <div
                  className="absolute top-1 text-[10px] text-slate-100 pointer-events-none"
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

          <div
            ref={noteScrollRef}
            onScroll={onNoteScroll}
            className="relative overflow-x-auto"
            style={{ width: "100%" }}
          >
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-yellow-400 pointer-events-none z-20"
              style={{ left: notePlayheadPx }}
            />
            <div
              className="rounded-lg bg-slate-400/45 dark:bg-zinc-800/50"
              style={{ width: gridBeats * CELL_W }}
            >
              {melodicPitches.map((pitch) => (
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
                      const filled = hasNoteAt(
                        project.notes,
                        pitch,
                        beat
                      );
                      const noteOccupyingCell = getNoteOccupying(
                        project.notes,
                        pitch,
                        beat
                      );
                      const isContinuation = Boolean(noteOccupyingCell);
                      const isNoteStart = Boolean(
                        noteOccupyingCell &&
                          noteOccupyingCell.startBeat === beat
                      );
                      const isNoteEnd = Boolean(
                        noteOccupyingCell &&
                          beat ===
                            noteOccupyingCell.startBeat +
                              noteOccupyingCell.durationBeats -
                              1
                      );
                      const existingInstrument = normalizeInstrument(
                        noteOccupyingCell?.instrument
                      );
                      const filledClass = noteOccupyingCell
                        ? NOTE_INSTRUMENT_COLORS[existingInstrument]
                        : "bg-emerald-500 hover:bg-emerald-600";
                      const barIndex = Math.floor(
                        beat / NOTE_STEPS_PER_BAR
                      );
                      const isAltBar = barIndex % 2 === 1;

                      return (
                        <button
                          key={`${pitch}-${beat}`}
                          type="button"
                          aria-label={`${pitch} beat ${beat} ${filled ? "on" : "off"}`}
                          className={`rounded-md p-0 cursor-pointer transition-colors border-[1.5px] border-neutral-500/75 dark:border-zinc-600/75 ${
                            filled && isNoteEnd
                              ? "cursor-e-resize"
                              : "cursor-pointer"
                          } ${
                            filled
                              ? filledClass
                              : isAltBar
                              ? "bg-neutral-300 dark:bg-zinc-800 hover:bg-neutral-400 dark:hover:bg-zinc-700"
                              : "bg-neutral-200 dark:bg-zinc-900 hover:bg-neutral-300 dark:hover:bg-zinc-800"
                          }`}
                          style={{
                            width: CELL_W,
                            height: CELL_H,
                            borderTopLeftRadius: isNoteStart ? 4 : 0,
                            borderBottomLeftRadius: isNoteStart ? 4 : 0,
                            borderTopRightRadius: isNoteEnd ? 4 : 0,
                            borderBottomRightRadius: isNoteEnd ? 4 : 0,
                            borderLeftWidth:
                              isContinuation && !isNoteStart ? 0 : 1.5,
                            borderRightWidth:
                              isContinuation && !isNoteEnd ? 0 : 1.5,
                          }}
                          onMouseDown={(e) => {
                            clearPendingNoteDelete();
                            setNoteMenu(null);

                            if (noteOccupyingCell) {
                              const isRightEdgeGrab =
                                e.nativeEvent.offsetX >=
                                CELL_W - NOTE_RESIZE_HANDLE_PX;
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
                            onPreviewNote(pitch, 0.8, defaultInstrument);
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
                            // Ignore the click that immediately follows spawning a note,
                            // so placing a note does not delete itself.
                            if (
                              justSpawnedNoteIdRef.current ===
                              noteOccupyingCell.id
                            ) {
                              justSpawnedNoteIdRef.current = null;
                              return;
                            }
                            noteDeleteTimeoutRef.current = window.setTimeout(
                              () => {
                                setProject((p) => ({
                                  ...p,
                                  notes: p.notes.filter(
                                    (n) => n.id !== noteOccupyingCell.id
                                  ),
                                  updatedAt: Date.now(),
                                }));
                                noteDeleteTimeoutRef.current = null;
                              },
                              220
                            );
                          }}
                          onDoubleClick={(e) => {
                            if (!noteOccupyingCell) return;
                            clearPendingNoteDelete();
                            const menuWidth = 240;
                            const menuHeight = 220;
                            const x = Math.min(
                              e.clientX + 12,
                              window.innerWidth - menuWidth - 12
                            );
                            const y = Math.min(
                              e.clientY + 12,
                              window.innerHeight - menuHeight - 12
                            );
                            setNoteMenu({
                              noteId: noteOccupyingCell.id,
                              x,
                              y,
                            });
                          }}
                        />
                      );
                    }
                  )}
                  <div
                    aria-hidden="true"
                    className="shrink-0"
                    style={{
                      width: (gridBeats - noteWindow.end) * CELL_W,
                    }}
                  />
                </div>
              ))}
              <div className="flex" style={{ height: CELL_H }}>
                <div
                  aria-hidden="true"
                  className="shrink-0"
                  style={{ width: noteWindow.start * CELL_W }}
                />
                {Array.from(
                  { length: noteWindow.end - noteWindow.start },
                  (_, localIndex) => {
                    const beat = noteWindow.start + localIndex;
                    const cellStartStep16 = beat * 2;
                    const cellEndStep16 = cellStartStep16 + 2;
                    const clipInCell = allVisualClips.find(
                      (clip) =>
                        clip.startStep16 < cellEndStep16 &&
                        clip.startStep16 + clip.durationStep16 > cellStartStep16
                    );
                    const clipStart = clipInCell?.startStep16 ?? -1;
                    const clipEndExclusive =
                      clipInCell ? clipInCell.startStep16 + clipInCell.durationStep16 : -1;
                    const isClipStart = Boolean(
                      clipInCell && clipStart >= cellStartStep16 && clipStart < cellEndStep16
                    );
                    const isClipEnd = Boolean(
                      clipInCell &&
                        clipEndExclusive > cellStartStep16 &&
                        clipEndExclusive <= cellEndStep16
                    );
                    const barIndex = Math.floor(beat / NOTE_STEPS_PER_BAR);
                    const isAltBar = barIndex % 2 === 1;
                    const persistedClipInCell = clipVisuals.find(
                      (clip) =>
                        clip.startStep16 < cellEndStep16 &&
                        clip.startStep16 + clip.durationStep16 > cellStartStep16
                    );
                    const persistedClipStartCell = persistedClipInCell
                      ? Math.floor(persistedClipInCell.startStep16 / 2)
                      : -1;
                    const persistedClipEndCell = persistedClipInCell
                      ? Math.floor(
                          (persistedClipInCell.startStep16 + persistedClipInCell.durationStep16 - 1) / 2
                        )
                      : -1;

                    return (
                      <div
                        key={`mic-${beat}`}
                        className={`rounded-md border-[1.5px] border-neutral-500/75 dark:border-zinc-600/75 ${
                          clipInCell
                            ? recordingClip && clipInCell === recordingClip
                              ? "bg-red-500/75"
                              : "bg-cyan-500/70"
                            : isAltBar
                              ? "bg-neutral-300 dark:bg-zinc-800"
                              : "bg-neutral-200 dark:bg-zinc-900"
                        }`}
                        style={{
                          width: CELL_W,
                          height: CELL_H,
                          borderTopLeftRadius: isClipStart ? 4 : 0,
                          borderBottomLeftRadius: isClipStart ? 4 : 0,
                          borderTopRightRadius: isClipEnd ? 4 : 0,
                          borderBottomRightRadius: isClipEnd ? 4 : 0,
                          borderLeftWidth: clipInCell && !isClipStart ? 0 : 1.5,
                          borderRightWidth: clipInCell && !isClipEnd ? 0 : 1.5,
                        }}
                        onMouseDown={(e) => {
                          if (!persistedClipInCell) return;
                          const onLeftEdge =
                            beat === persistedClipStartCell &&
                            e.nativeEvent.offsetX <= NOTE_RESIZE_HANDLE_PX;
                          const onRightEdge =
                            beat === persistedClipEndCell &&
                            e.nativeEvent.offsetX >= CELL_W - NOTE_RESIZE_HANDLE_PX;

                          if (!onLeftEdge && !onRightEdge) return;

                          document.body.style.cursor = "col-resize";
                          document.body.style.userSelect = "none";
                          vocalResizeRef.current = {
                            clipId: persistedClipInCell.id,
                            edge: onLeftEdge ? "left" : "right",
                            anchorStep16: onLeftEdge
                              ? persistedClipInCell.startStep16 + persistedClipInCell.durationStep16
                              : persistedClipInCell.startStep16,
                          };
                        }}
                        onDoubleClick={(e) => {
                          if (!persistedClipInCell) return;
                          const menuWidth = 170;
                          const menuHeight = 110;
                          const x = Math.min(
                            e.clientX + 10,
                            window.innerWidth - menuWidth - 12
                          );
                          const y = Math.min(
                            e.clientY + 10,
                            window.innerHeight - menuHeight - 12
                          );
                          setVocalMenu({
                            clipId: persistedClipInCell.id,
                            x,
                            y,
                          });
                        }}
                      />
                    );
                  }
                )}
                <div
                  aria-hidden="true"
                  className="shrink-0"
                  style={{
                    width: (gridBeats - noteWindow.end) * CELL_W,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      {vocalMenu && selectedVocalClip && (
        <div
          ref={vocalMenuRef}
          className="fixed z-[70] w-40 rounded-xl border border-slate-300/70 bg-white/90 p-2 shadow-xl backdrop-blur-md dark:border-white/15 dark:bg-zinc-900/90"
          style={{ left: vocalMenu.x, top: vocalMenu.y }}
        >
          <div className="mb-2 text-xs font-semibold text-slate-600 dark:text-zinc-300">Vocal Clip</div>
          <button
            type="button"
            className="delete-glow-btn w-full rounded-md border border-red-300 bg-red-500/90 px-2 py-1.5 text-left text-xs font-semibold text-white transition-all duration-200 hover:bg-red-600"
            onClick={() => {
              setProject((p) => {
                const tracks = p.audioTracks.length > 0 ? p.audioTracks : [{ id: crypto.randomUUID(), name: "Mic", clips: [] }];
                const primary = tracks[0];
                return {
                  ...p,
                  audioTracks: [
                    {
                      ...primary,
                      clips: primary.clips.filter((clip) => clip.id !== selectedVocalClip.id),
                    },
                    ...tracks.slice(1),
                  ],
                  updatedAt: Date.now(),
                };
              });
              setVocalMenu(null);
            }}
          >
            Delete Clip
          </button>
        </div>
      )}
      {micInputMenu && (
        <div
          ref={micInputMenuRef}
          className="fixed z-[80] w-56 rounded-xl border border-slate-300/70 bg-white/90 p-2 shadow-xl backdrop-blur-md dark:border-white/15 dark:bg-zinc-900/90"
          style={{ left: micInputMenu.x, top: micInputMenu.y }}
        >
          <div className="mb-2 text-xs font-semibold text-slate-600 dark:text-zinc-300">Mic Input</div>
          <select
            value={selectedAudioInputId}
            onChange={(e) => onSelectedAudioInputIdChange(e.target.value)}
            className="h-8 w-full rounded-lg border border-slate-300/80 bg-white/90 px-2 text-xs text-slate-800 dark:border-white/15 dark:bg-zinc-700/60 dark:text-slate-100"
            title="Vocal input device"
          >
            <option value="default">System Default</option>
            {audioInputDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Mic ${device.deviceId.slice(0, 6)}`}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
