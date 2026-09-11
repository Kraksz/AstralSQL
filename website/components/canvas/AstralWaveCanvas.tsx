"use client";
import {
  dampingFactor,
  pointerToUv,
} from "./motion";
import { useEffect, useRef } from "react";
import {
  ASTRAL_PALETTE,
  fragmentShader,
  vertexShader,
} from "./floatingLinesShader";

export interface AstralWaveCanvasProps {
  className?: string;
  intensity?: number;
}

/** Decorative welcome/hero canvas. Mount inside a positioned, sized container. */
export function AstralWaveCanvas({
  className,
  intensity = 0.7,
}: AstralWaveCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const intensityRef = useRef(intensity);
  intensityRef.current = intensity;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    // The SQL workspace does not pay Three's download/startup cost until mounted.
    void import("three")
      .then((THREE) => {
        if (cancelled) return;
        let renderer: InstanceType<typeof THREE.WebGLRenderer>;
        try {
          renderer = new THREE.WebGLRenderer({
            alpha: false,
            antialias: false,
            powerPreference: "low-power",
            depth: false,
            stencil: false,
          });
        } catch {
          // CSS preserves the welcome screen on machines without WebGL.
          return;
        }

        const canvas = renderer.domElement;
        canvas.style.cssText =
          "display:block;width:100%;height:100%;pointer-events:none";
        canvas.setAttribute("aria-hidden", "true");
        container.appendChild(canvas);

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const geometry = new THREE.PlaneGeometry(2, 2);
        const uniforms = {
          iResolution: { value: new THREE.Vector2(1, 1) },
          iTime: { value: 0 },
          iMouse: { value: new THREE.Vector2(0.5, 0.5) },
          bendInfluence: { value: 0 },
          intensity: { value: intensityRef.current },
          lineGradient: {
            // Pass display-space channels directly to this unlit shader.
            value: ASTRAL_PALETTE.map(
              (hex) =>
                new THREE.Vector3(
                  parseInt(hex.slice(1, 3), 16) / 255,
                  parseInt(hex.slice(3, 5), 16) / 255,
                  parseInt(hex.slice(5, 7), 16) / 255,
                ),
            ),
          },
        };
        const material = new THREE.ShaderMaterial({
          vertexShader,
          fragmentShader,
          uniforms,
          depthTest: false,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        let intersects = true;
        let contextLost = false;
        let frameId = 0;
        let lastTime = 0;
        let pointerInside = false;
        let bounds = container.getBoundingClientRect();
        const targetMouse = new THREE.Vector2(0.5, 0.5);

        const visible = () =>
          !cancelled &&
          !contextLost &&
          intersects &&
          document.visibilityState !== "hidden";
        const render = () => {
          if (!visible()) return;
          const requestedIntensity = intensityRef.current;
          uniforms.intensity.value = Number.isFinite(requestedIntensity)
            ? Math.min(2, Math.max(0, requestedIntensity))
            : 0.7;
          renderer.render(scene, camera);
        };
        const tick = (now: number) => {
          frameId = 0;
          if (!visible()) return;
          const delta = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
          lastTime = now;
          uniforms.iTime.value += delta;
          // Exponential damping has the same feel on both 60 Hz and 120 Hz screens.
          const damping = dampingFactor(delta);
          uniforms.iMouse.value.lerp(targetMouse, damping);
          uniforms.bendInfluence.value +=
            ((pointerInside ? 1 : 0) - uniforms.bendInfluence.value) * damping;
          render();
          frameId = window.requestAnimationFrame(tick);
        };
        const syncLoop = () => {
          window.cancelAnimationFrame(frameId);
          frameId = 0;
          lastTime = 0;
          if (!visible()) return;
          render();
          frameId = window.requestAnimationFrame(tick);
        };
        const resize = () => {
          pointerInside = false;
          bounds = container.getBoundingClientRect();
          const width = Math.max(1, Math.round(bounds.width));
          const height = Math.max(1, Math.round(bounds.height));
          // Limit both pixel density and total shading work on large displays.
          const ratio = Math.min(
            window.devicePixelRatio || 1,
            1.5,
            Math.sqrt(900_000 / (width * height)),
          );
          renderer.setPixelRatio(ratio);
          renderer.setSize(width, height, false);
          renderer.getDrawingBufferSize(uniforms.iResolution.value);
          render();
        };
        const pointerMove = (event: PointerEvent) => {
          if (!intersects || !bounds.width || !bounds.height)
            return;
          const uv = pointerToUv(event.clientX, event.clientY, bounds);
          pointerInside = uv !== null;
          if (uv) targetMouse.set(uv.x, uv.y);
        };
        const pointerLeave = () => {
          pointerInside = false;
        };
        const refreshBounds = () => {
          bounds = container.getBoundingClientRect();
        };
        const onContextLost = (event: Event) => {
          event.preventDefault();
          contextLost = true;
          canvas.style.visibility = "hidden";
          syncLoop();
        };
        const onContextRestored = () => {
          contextLost = false;
          canvas.style.visibility = "visible";
          resize();
          syncLoop();
        };

        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container);
        const intersectionObserver = new IntersectionObserver(([entry]) => {
          intersects = entry?.isIntersecting ?? false;
          syncLoop();
        });
        intersectionObserver.observe(container);
        document.addEventListener("visibilitychange", syncLoop);
        window.addEventListener("pointermove", pointerMove, { passive: true });
        window.addEventListener("blur", pointerLeave);
        document.documentElement.addEventListener("pointerleave", pointerLeave);
        window.addEventListener("resize", resize, { passive: true });
        window.addEventListener("scroll", refreshBounds, {
          passive: true,
          capture: true,
        });
        canvas.addEventListener("webglcontextlost", onContextLost);
        canvas.addEventListener("webglcontextrestored", onContextRestored);
        resize();
        syncLoop();

        cleanup = () => {
          window.cancelAnimationFrame(frameId);
          resizeObserver.disconnect();
          intersectionObserver.disconnect();
          document.removeEventListener("visibilitychange", syncLoop);
          window.removeEventListener("pointermove", pointerMove);
          window.removeEventListener("blur", pointerLeave);
          document.documentElement.removeEventListener(
            "pointerleave",
            pointerLeave,
          );
          window.removeEventListener("resize", resize);
          window.removeEventListener("scroll", refreshBounds, true);
          canvas.removeEventListener("webglcontextlost", onContextLost);
          canvas.removeEventListener("webglcontextrestored", onContextRestored);
          scene.remove(mesh);
          geometry.dispose();
          material.dispose();
          renderer.dispose();
          renderer.forceContextLoss();
          canvas.remove();
        };
      })
      .catch(() => {
        // The decorative layer is optional if the lazy chunk cannot be loaded.
      });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        background:
          "radial-gradient(ellipse at 55% 65%, #082238 0%, #020617 65%)",
      }}
    />
  );
}

export default AstralWaveCanvas;
