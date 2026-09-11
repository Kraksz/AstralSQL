import { useEffect, useRef, type RefObject } from "react";

/** Move the introductory star into an existing header logo using FLIP geometry. */
export function useFlipAnimation(
  sourceRef: RefObject<HTMLElement | null>,
  targetId: string,
  active: boolean,
  onComplete: () => void,
) {
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  useEffect(() => {
    if (!active) return;
    const source = sourceRef.current;
    if (
      !source ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      completeRef.current();
      return;
    }

    let disposed = false;
    let animation: Animation | undefined;
    let fallbackTimer: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      const start = source.getBoundingClientRect();
      const destination = document
        .getElementById(targetId)
        ?.getBoundingClientRect();
      const finish = () => {
        if (!disposed) completeRef.current();
      };
      if (typeof source.animate !== "function") {
        finish();
        return;
      }
      const dx = destination
        ? destination.left +
          destination.width / 2 -
          start.left -
          start.width / 2
        : 0;
      const dy = destination
        ? destination.top +
          destination.height / 2 -
          start.top -
          start.height / 2
        : -16;
      const scale =
        destination && start.width ? destination.width / start.width : 0.75;
      animation = source.animate(
        [
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
          {
            transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
            opacity: destination ? 1 : 0,
          },
        ],
        {
          delay: 90,
          duration: 420,
          easing: "cubic-bezier(0.65, 0, 0.2, 1)",
          fill: "forwards",
        },
      );
      void animation.finished.then(finish).catch(() => {
        /* cleanup cancels the animation */
      });
      // A suspended/unsupported animation must never leave a loading overlay up.
      fallbackTimer = window.setTimeout(finish, 650);
    });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(fallbackTimer);
      animation?.cancel();
    };
  }, [active, sourceRef, targetId]);
}
