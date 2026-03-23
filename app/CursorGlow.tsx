"use client";

import { useEffect, useRef } from "react";

export function CursorGlow() {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const coreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const canHover = window.matchMedia("(pointer: fine)").matches;
    if (!canHover) return;

    const layer = layerRef.current;
    const core = coreRef.current;
    if (!layer || !core) return;

    const onPointerMove = (event: PointerEvent) => {
      layer.style.opacity = "0.35";
      core.style.transform = `translate3d(${event.clientX - 88}px, ${event.clientY - 88}px, 0)`;
    };

    const hideGlow = () => {
      layer.style.opacity = "0";
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
      ref={layerRef}
      className="pointer-events-none fixed inset-0 z-50 opacity-0 transition-opacity duration-300"
    >
      <div ref={coreRef} className="absolute left-0 top-0">
        <div className="h-[176px] w-[176px] rounded-full bg-white/16 blur-[68px]" />
        <div className="absolute left-1/2 top-1/2 h-[116px] w-[116px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 blur-[40px]" />
      </div>
    </div>
  );
}
