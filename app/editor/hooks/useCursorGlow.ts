"use client";

import { useEffect, useRef } from "react";

export function useCursorGlow(authReady: boolean) {
  const cursorGlowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!authReady) return;
    if (typeof window === "undefined") return;
    const canHover = window.matchMedia("(pointer: fine)").matches;
    if (!canHover) return;

    const glow = cursorGlowRef.current;
    if (!glow) return;

    const onPointerMove = (event: PointerEvent) => {
      glow.style.opacity = "0.28";
      glow.style.transform = `translate3d(${event.clientX - 88}px, ${event.clientY - 88}px, 0)`;
    };

    const hideGlow = () => {
      glow.style.opacity = "0";
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerleave", hideGlow);
    window.addEventListener("blur", hideGlow);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", hideGlow);
      window.removeEventListener("blur", hideGlow);
    };
  }, [authReady]);

  return cursorGlowRef;
}
