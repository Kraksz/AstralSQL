import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import ConnectionGuide from "./ConnectionGuide";

export default function ConnectionGuideDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="connection-guide-dialog"
      aria-label="Remote connection guide"
      onCancel={onClose}
    >
      <header className="guide-dialog-toolbar">
        <span>ASTRAL / LEARN</span>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close connection guide"
          autoFocus
        >
          <X size={20} />
        </button>
      </header>
      <ConnectionGuide />
    </dialog>
  );
}
