"use client";

import { useTranslation } from "@/lib/i18n/provider";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The photo captured for a set, before it is uploaded.
 *
 * A plain object rather than a File: the image has already been downscaled to a
 * data URL on the canvas, so there is nothing left to stream and the payload can
 * go as JSON.
 */
export interface CapturedPhoto {
  dataUrl: string;
  mime: string;
}

/**
 * Camera capture for workout evidence.
 *
 * Opens the device camera directly (`capture="environment"`) rather than a file
 * picker, because the evidence has to be taken at the gym — a member should not
 * be able to upload a photo from their camera roll, which is the loophole that
 * would make this whole feature pointless.
 *
 * Downscales on a canvas before returning. A modern phone photo is 3-8 MB and
 * uploading that would be slow on gym wifi and wasteful on a metered plan; the
 * verifier only needs enough detail to recognise equipment.
 */
export default function PhotoCapture({
  open,
  exerciseName,
  onCapture,
  onCancel,
}: {
  open: boolean;
  exerciseName: string;
  onCapture: (photo: CapturedPhoto) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<CapturedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset whenever the sheet reopens, so a previous set's photo never leaks
  // into the next one.
  useEffect(() => {
    if (open) {
      setPreview(null);
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const handleFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);

      try {
        const dataUrl = await downscale(file);
        setPreview({ dataUrl, mime: "image/jpeg" });
      } catch {
        setError(t("photo.errProcess"));
      } finally {
        setBusy(false);
      }
    },
    [t]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("photo.dialogTitle")}
    >
      <div className="w-full max-w-md rounded-t-2xl bg-surface p-5 sm:rounded-2xl">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
            {t("photo.dialogTitle")}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("action.cancel")}
            className="rounded-full p-1 text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <p className="mb-4 font-body-md text-sm text-on-surface-variant">
          {t("photo.dialogHint", { exercise: exerciseName })}
        </p>

        {error && (
          <div className="mb-3 rounded-lg bg-error-container p-3 text-sm text-on-error-container" role="alert">
            {error}
          </div>
        )}

        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.dataUrl}
              alt={t("photo.previewAlt")}
              className="mb-3 w-full rounded-xl border border-outline-variant object-cover"
              style={{ maxHeight: 320 }}
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  inputRef.current?.click();
                }}
                className="flex-1 rounded-lg border border-outline-variant px-4 py-3 font-metric-sm text-metric-sm text-on-surface transition-colors hover:bg-surface-container-low"
              >
                {t("photo.retake")}
              </button>
              <button
                type="button"
                onClick={() => preview && onCapture(preview)}
                className="flex-1 rounded-lg bg-primary px-4 py-3 font-metric-sm text-metric-sm text-on-primary transition-colors hover:bg-primary/90"
              >
                {t("photo.usePhoto")}
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-outline-variant px-4 py-10 transition-colors hover:border-primary disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[40px] text-on-surface-variant">
              {busy ? "progress_activity" : "photo_camera"}
            </span>
            <span className="font-metric-sm text-metric-sm text-on-surface">
              {busy ? t("photo.processing") : t("photo.takePhoto")}
            </span>
            <span className="text-center font-body-md text-[12px] text-on-surface-variant">
              {t("photo.takePhotoHint")}
            </span>
          </button>
        )}

        {/* capture=environment opens the rear camera directly: no camera-roll
            upload, which is the loophole that would defeat the verification. */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

/**
 * Shrink an image to a data URL.
 *
 * Caps the longest edge at 1024px and re-encodes as JPEG at q0.75. That is
 * plenty for the model to identify equipment, and it turns a multi-megabyte
 * upload into a couple of hundred kilobytes.
 */
async function downscale(file: File, maxEdge = 1024, quality = 0.75): Promise<string> {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("no 2d context");
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  return canvas.toDataURL("image/jpeg", quality);
}
