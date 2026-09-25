"use client";

import { useEffect, useRef, useState } from "react";
import Button from "./Button";

/**
 * Modal confirmation for destructive actions.
 *
 * Supports `requireText`, which forces the operator to type an exact phrase
 * before the confirm button unlocks. Used for account deletion, where the
 * action cannot be undone — a single mis-click must not be able to destroy a
 * user, so a password-style gate is warranted rather than a plain "OK".
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "danger",
  requireText,
  extra,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  requireText?: string;
  /** Additional confirmation input, e.g. a password field. */
  extra?: React.ReactNode;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setTyped("");
      return;
    }
    // Focus the gate field when present, otherwise the dialog itself, so
    // keyboard users land inside the modal rather than behind it.
    if (requireText) inputRef.current?.focus();
    else dialogRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, requireText, busy, onCancel]);

  if (!open) return null;

  const unlocked = !requireText || typed.trim() === requireText;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-xl outline-none"
      >
        <h2 id="confirm-title" className="font-headline-lg-mobile text-headline-lg-mobile text-primary">
          {title}
        </h2>
        <div className="mt-2 font-body-md text-body-md text-on-surface-variant">{description}</div>

        {requireText && (
          <label className="mt-4 block">
            <span className="font-label-caps text-label-caps text-on-surface-variant">
              Type <strong className="text-on-surface">{requireText}</strong> to confirm
            </span>
            <input
              ref={inputRef}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              disabled={busy}
              autoComplete="off"
              className="mt-2 w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none"
            />
          </label>
        )}

        {extra}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={!unlocked}
            busy={busy}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
