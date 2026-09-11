"use client";
import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** A keyboard-accessible disclosure that animates both opening and closing. */
export default function AnimatedDisclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="astral-disclosure" data-open={open}>
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <span>{title}</span><ChevronDown size={18} aria-hidden="true" />
    </button>
    <div className="disclosure-track" id={id} aria-hidden={!open} inert={!open}>
      <div className="disclosure-clip"><div className="disclosure-content">{children}</div></div>
    </div>
  </div>;
}
