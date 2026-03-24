"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Project } from "@/types/project";

type SaveStatus = "saving" | "saved" | "error";

const DEFAULT_AUTOSAVE_DELAY_MS = 1200;

type UseEditorSaveParams = {
  authReady: boolean;
  viewerId: string | null;
  songIdFromUrl: string | null;
  project: Project;
  songId: string | null;
  setSongId: (songId: string | null) => void;
  autosaveDelayMs?: number;
};

export function useEditorSave({
  authReady,
  viewerId,
  songIdFromUrl,
  project,
  songId,
  setSongId,
  autosaveDelayMs = DEFAULT_AUTOSAVE_DELAY_MS,
}: UseEditorSaveParams) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const projectSnapshot = useMemo(() => JSON.stringify(project), [project]);

  const lastSavedSnapshotRef = useRef("");
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const latestProjectRef = useRef(project);
  const latestProjectSnapshotRef = useRef(projectSnapshot);
  const songIdRef = useRef<string | null>(songId);
  const initializedNewProjectSnapshotRef = useRef(false);

  const hasUnsavedChanges = projectSnapshot !== lastSavedSnapshotRef.current;

  useEffect(() => {
    latestProjectRef.current = project;
    latestProjectSnapshotRef.current = projectSnapshot;
  }, [project, projectSnapshot]);

  useEffect(() => {
    songIdRef.current = songId;
  }, [songId]);

  useEffect(() => {
    if (initializedNewProjectSnapshotRef.current) return;
    if (songIdFromUrl) return;
    lastSavedSnapshotRef.current = projectSnapshot;
    initializedNewProjectSnapshotRef.current = true;
  }, [projectSnapshot, songIdFromUrl]);

  const persistLatestProject = useCallback(async () => {
    if (!authReady) return false;
    if (!viewerId) return false;
    if (songIdFromUrl && !songIdRef.current) return false;
    if (saveInFlightRef.current) {
      saveQueuedRef.current = true;
      setSaveStatus("saving");
      return false;
    }

    saveInFlightRef.current = true;
    setSaveStatus("saving");
    let savedAtLeastOnce = false;
    let saveFailed = false;

    try {
      do {
        saveQueuedRef.current = false;

        const projectToSave = latestProjectRef.current;
        const snapshotToSave = latestProjectSnapshotRef.current;
        if (snapshotToSave === lastSavedSnapshotRef.current) continue;

        const now = new Date().toISOString();
        const currentSongId = songIdRef.current;

        if (currentSongId) {
          const { error } = await supabase
            .from("songs")
            .update({
              title: projectToSave.name || "Untitled",
              bpm: projectToSave.bpm || 120,
              project_data: projectToSave,
              updated_at: now,
            })
            .eq("id", currentSongId)
            .eq("user_id", viewerId);

          if (error) {
            saveFailed = true;
            break;
          }

          lastSavedSnapshotRef.current = snapshotToSave;
          savedAtLeastOnce = true;
        } else {
          const { data, error } = await supabase
            .from("songs")
            .insert([
              {
                title: projectToSave.name || "Untitled",
                bpm: projectToSave.bpm || 120,
                project_data: projectToSave,
                user_id: viewerId,
                created_at: now,
                updated_at: now,
              },
            ])
            .select("id")
            .single();

          if (error || !data?.id) {
            saveFailed = true;
            break;
          }

          setSongId(data.id);
          songIdRef.current = data.id;
          lastSavedSnapshotRef.current = snapshotToSave;
          savedAtLeastOnce = true;
        }
      } while (
        saveQueuedRef.current ||
        latestProjectSnapshotRef.current !== lastSavedSnapshotRef.current
      );
    } finally {
      saveInFlightRef.current = false;
    }

    setSaveStatus(saveFailed ? "error" : "saved");
    return savedAtLeastOnce;
  }, [authReady, songIdFromUrl, setSongId, viewerId]);

  useEffect(() => {
    if (!authReady) return;
    setSaveStatus(hasUnsavedChanges ? "saving" : "saved");
  }, [authReady, hasUnsavedChanges]);

  useEffect(() => {
    if (!authReady) return;
    if (!hasUnsavedChanges) return;

    const timer = window.setTimeout(() => {
      void persistLatestProject();
    }, autosaveDelayMs);

    return () => window.clearTimeout(timer);
  }, [authReady, autosaveDelayMs, hasUnsavedChanges, projectSnapshot, persistLatestProject]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  const markSnapshotAsSaved = useCallback((snapshot: string) => {
    lastSavedSnapshotRef.current = snapshot;
    setSaveStatus("saved");
  }, []);

  const hasUnsavedChangesNow = useCallback(() => {
    return latestProjectSnapshotRef.current !== lastSavedSnapshotRef.current;
  }, []);

  return {
    hasUnsavedChanges,
    hasUnsavedChangesNow,
    markSnapshotAsSaved,
    persistLatestProject,
    saveStatus,
  };
}
