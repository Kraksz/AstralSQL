"use client";
import { useEffect } from "react";

export default function RevealMotion() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches || !("IntersectionObserver" in window)) return;
    const nodes = document.querySelectorAll<HTMLElement>(
      ".workspace-showcase, .feature-grid article, .connection-invitation, .download-station",
    );
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-visible");
            observer.unobserve(entry.target);
          }
      },
      { threshold: 0.08 },
    );
    nodes.forEach((node) => {
      node.classList.add("reveal-ready");
      observer.observe(node);
    });
    return () => {
      observer.disconnect();
      nodes.forEach((node) =>
        node.classList.remove("reveal-ready", "reveal-visible"),
      );
    };
  }, []);
  return null;
}
