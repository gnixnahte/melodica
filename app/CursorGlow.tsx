"use client";

import { useEffect, useRef } from "react";

export function CursorGlow() {
  const glowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const canHover = window.matchMedia("(pointer: fine)").matches;
    if (!canHover) return;

    const glow = glowRef.current;
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
  }, []);

  return (
    <div
      ref={glowRef}
      className="pointer-events-none fixed left-0 top-0 z-50 h-44 w-44 rounded-full bg-white/35 opacity-0 blur-[56px] transition-opacity duration-200"
    />
  );
}
