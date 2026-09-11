"use client";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";

export default function SiteNavigation({ guide = false }: { guide?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const links = guide
    ? [
        ["/", "Home"],
        ["/#workspace", "Workspace"],
        ["/#desktop", "Downloads"],
        ["/docs", "Documentation"],
      ]
    : [
        ["#workspace", "Workspace"],
        ["#built-different", "Why Astral"],
        ["#desktop", "Downloads"],
        ["/docs", "Documentation"],
      ];
  return (
    <nav
      ref={ref}
      className="site-navigation"
      aria-label={guide ? "Guide navigation" : "Main navigation"}
    >
      <button
        ref={button}
        type="button"
        className="mobile-menu-toggle"
        aria-expanded={open}
        aria-controls="site-navigation-links"
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={19} /> : <Menu size={19} />}
        <span>Menu</span>
      </button>
      <div
        id="site-navigation-links"
        className="site-navigation-links"
        data-open={open}
      >
        {links.map(([href, text]) => (
          <a key={href} href={href} onClick={() => setOpen(false)}>
            {text}
          </a>
        ))}
      </div>
    </nav>
  );
}
