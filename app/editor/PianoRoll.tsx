"use client";

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
}: PianoRollProps) {
  return (
    <div className="flex-1 overflow-auto border border-neutral-200 dark:border-neutral-700 mt-2 mx-4 mb-2 rounded-lg">
      <div className="flex flex-row pt-2 pb-2 pl-1 text-sm">
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
              className="rounded-sm bg-neutral-600"
              style={{ width: gridBeats * CELL_W }}
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
                          className={`rounded-sm p-0 cursor-pointer transition-colors border border-neutral-400 dark:border-neutral-600 ${
                            filled && isNoteEnd
                              ? "cursor-e-resize"
                              : "cursor-pointer"
                          } ${
                            filled
                              ? filledClass
                              : isAltBar
                                ? "bg-neutral-300 dark:bg-neutral-800 hover:bg-neutral-400 dark:hover:bg-neutral-700"
                                : "bg-neutral-200 dark:bg-neutral-900 hover:bg-neutral-300 dark:hover:bg-neutral-800"
                          } ${filled ? "rounded-none" : ""}`}
                          style={{
                            width: CELL_W,
                            height: CELL_H,
                            borderTopLeftRadius: isNoteStart ? 4 : 0,
                            borderBottomLeftRadius: isNoteStart ? 4 : 0,
                            borderTopRightRadius: isNoteEnd ? 4 : 0,
                            borderBottomRightRadius: isNoteEnd ? 4 : 0,
                            borderLeftWidth:
                              isContinuation && !isNoteStart ? 0 : 1,
                            borderRightWidth:
                              isContinuation && !isNoteEnd ? 0 : 1,
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
