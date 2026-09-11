import { useEffect, useRef, useState } from "react";
import { useFlipAnimation } from "./useFlipAnimation";

const INTRO_KEY = "astral:intro-seen";

export interface PageLoaderProps {
  /** Opt in only on the welcome route, never on a reconnect or query operation. */
  enabled?: boolean;
  /** ID of the existing header logo element, used as the animation destination. */
  targetId?: string;
  onComplete?: () => void;
}

function shouldShowIntro(enabled: boolean) {
  if (!enabled || typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    return false;
  try {
    return window.sessionStorage.getItem(INTRO_KEY) !== "1";
  } catch {
    return true;
  }
}

/** Optional, once-per-session flourish. The application is interactive underneath. */
export function PageLoader({
  enabled = true,
  targetId = "astral-header-logo",
  onComplete,
}: PageLoaderProps) {
  const [visible, setVisible] = useState(() => shouldShowIntro(enabled));
  const starRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);
  const complete = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    try {
      window.sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      /* storage is optional */
    }
    setVisible(false);
    onComplete?.();
  };

  useFlipAnimation(starRef, targetId, visible && enabled, complete);

  useEffect(() => {
    if (!visible || !enabled) {
      complete();
      return;
    }
    const animation = backdropRef.current?.animate?.(
      [{ opacity: 0.8 }, { opacity: 0 }],
      {
        duration: 390,
        delay: 70,
        fill: "forwards",
        easing: "ease-out",
      },
    );
    return () => animation?.cancel();
    // Initialization is independent of the caller's callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, enabled]);

  if (!visible || !enabled) return null;
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        pointerEvents: "none",
        display: "grid",
        placeItems: "center",
      }}
    >
      <div
        ref={backdropRef}
        style={{ position: "absolute", inset: 0, background: "#020617" }}
      />
      <div
        ref={starRef}
        style={{
          width: 72,
          height: 72,
          position: "relative",
          transformOrigin: "center",
          willChange: "transform, opacity",
          filter: "drop-shadow(0 0 22px rgba(56,189,248,.3))",
        }}
      >
        <svg viewBox="0 0 64 64" width="72" height="72" fill="none">
          <path
            d="M32 5L38.8 25.2L59 32L38.8 38.8L32 59L25.2 38.8L5 32L25.2 25.2Z"
            fill="#bae6fd"
          />
          <path d="M32 5L38.8 25.2L59 32L38.8 38.8L32 59V32Z" fill="#38bdf8" />
          <circle
            cx="32"
            cy="32"
            r="21"
            stroke="#7dd3fc"
            strokeWidth="0.8"
            opacity="0.4"
          />
        </svg>
      </div>
    </div>
  );
}

export default PageLoader;
