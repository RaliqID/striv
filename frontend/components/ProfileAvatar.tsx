"use client";

import { useRef, useState } from "react";
import { apiClient } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/provider";

/**
 * Profile photo control: shows the current avatar, and lets the member replace
 * or remove it.
 *
 * ---------------------------------------------------------------------------
 * WHY IT RESIZES BEFORE UPLOADING
 * ---------------------------------------------------------------------------
 * A phone camera produces 3-5 MB images at 4000px. Sending that to display a
 * 80px circle wastes the member's data, makes the upload slow enough that they
 * may navigate away, and would breach the server's 5 MB cap on some devices.
 *
 * So the image is drawn to a canvas at a fixed 512px square and re-encoded
 * before it leaves the browser. 512 is generous for a photo that renders at
 * 80-128px even on a high-density screen, and the result is typically 30-80 KB.
 *
 * The server still validates the real content type and size — this is a
 * courtesy, not a security boundary. Anything can be posted by a determined
 * caller, which is why the backend re-checks.
 */
export default function ProfileAvatar({
  name,
  avatarUrl,
  lockedUntil,
  onChanged,
}: {
  name: string | null;
  /** Versioned URL from the API, or null when the member has no photo. */
  avatarUrl: string | null;
  /**
   * ISO timestamp until which changing the photo is refused, or null.
   *
   * Sent by the server so the control can be disabled and explained BEFORE the
   * member picks a file. The server enforces the same limit regardless; this
   * only avoids the worse experience of choosing a photo and then being told no.
   */
  lockedUntil?: string | null;
  /** Called with the new URL (or null after removal) so the page can update. */
  onChanged: (url: string | null) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  /** Initial to show when there is no photo. */
  const initial = name ? name.charAt(0).toUpperCase() : "U";

  /*
   * Whether the cooldown is still running.
   *
   * Compared against the clock rather than trusted as a boolean, because the
   * timestamp is fixed at page load: a tab left open past the window would
   * otherwise stay locked out until reloaded.
   */
  const locked = !!lockedUntil && new Date(lockedUntil).getTime() > Date.now();

  /** How much longer, rounded up, for the message. */
  const hoursLeft = locked
    ? Math.max(1, Math.ceil((new Date(lockedUntil!).getTime() - Date.now()) / 3_600_000))
    : 0;

  async function handleFile(file: File) {
    setError(null);

    // Reject early on type, so an obviously wrong file never reaches the
    // canvas. The server checks again; this is only to give a faster answer.
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError(t("profile.avatarInvalidType"));
      return;
    }

    setBusy(true);

    try {
      const dataUrl = await downscale(file);

      // Show the chosen photo immediately so the member sees their pick while
      // the upload runs, rather than the old avatar with a spinner.
      setPreview(dataUrl);

      const res = await apiClient.post<{ avatar_url: string | null }>(
        "/profile/avatar",
        {
          // The API accepts a data URL and strips the prefix itself, so the
          // string is sent as produced rather than split here.
          image: dataUrl,
          mime: "image/jpeg",
        },
        // Longer than the default: this is an upload, not a read.
        { timeoutMs: 30_000 }
      );

      onChanged(res.avatar_url);
      setPreview(null);
    } catch (err: any) {
      setPreview(null);
      // The server's message is already localized (it comes from the lang
      // files), so it is preferred over a generic fallback.
      setError(err?.message || t("profile.avatarFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setBusy(true);

    try {
      await apiClient.delete("/profile/avatar");
      onChanged(null);
      setPreview(null);
    } catch (err: any) {
      setError(err?.message || t("profile.avatarFailed"));
    } finally {
      setBusy(false);
    }
  }

  const shown = preview ?? avatarUrl;

  /**
   * What hovering the photo says it does.
   *
   * Only ever the change action or the busy state. There is deliberately no
   * "Locked" wording here: the cooldown is explained by the caption underneath,
   * where there is room to say WHEN it lifts. Printing the word on the photo
   * itself just labelled the member as blocked without telling them anything
   * actionable, and it sat on top of their own face.
   */
  const overlayLabel = busy ? t("profile.uploadingPhoto") : t("profile.changePhotoShort");

  return (
    <div className="flex w-40 flex-col items-center gap-2">
      {/*
        The photo IS the control, and the caption explaining that sits BELOW it
        rather than beside it. Beside meant competing with the member's name for
        horizontal space and pushing it off-centre; below keeps the identity
        block as a single centred column: photo, then what to do with it.
      */}
      <div
        role={locked ? undefined : "button"}
        tabIndex={locked ? undefined : 0}
        onClick={() => !locked && !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (locked || busy) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        aria-label={locked ? t("profile.avatarLockedShort") : t("profile.changePhoto")}
        aria-disabled={locked || busy}
        className={`group relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-surface-variant ${
          locked ? "cursor-not-allowed" : "cursor-pointer"
        }`}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- served from an
          // authorised API route, not a static asset, so next/image cannot
          // optimise it.
          <img src={shown} alt={name ?? ""} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-metric-display text-2xl text-on-surface">
            {initial}
          </span>
        )}

        {/*
          Hover overlay. Names the action in place, so the member learns the photo
          is clickable by pointing at it.

          Deliberately NOT shown while locked. The caption below already says when
          the cooldown lifts, which is the useful part; darkening the member's own
          photo and stamping a word on it would just mark them as blocked without
          telling them anything they can act on. It stays visible while busy
          because that state is transient and has no caption of its own.
        */}
        <span
          className={`absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55 px-1 text-center text-white transition-opacity ${
            busy ? "opacity-100" : locked ? "opacity-0" : "opacity-0 group-hover:opacity-100"
          }`}
          aria-hidden="true"
        >
          <span
            className={`material-symbols-outlined text-[20px] ${busy ? "animate-spin" : ""}`}
          >
            {busy ? "progress_activity" : "photo_camera"}
          </span>
          <span className="font-label-caps text-[10px] leading-tight">{overlayLabel}</span>
        </span>
      </div>

      {/*
        The caption. Two mutually exclusive states, because they are the only two
        things the member can usefully be told about this control:

          locked  — when the next change is allowed. Stated as a time remaining
                    rather than "not allowed", so it reads as a wait and not a
                    refusal.
          normal  — that the photo can be clicked. Without this the affordance is
                    invisible until the pointer happens to cross it, which on a
                    touch device never happens at all.
      */}
      {locked ? (
        <p className="text-center font-label-caps text-label-caps text-on-surface-variant">
          {t("profile.avatarLocked", { hours: hoursLeft })}
        </p>
      ) : (
        <p className="text-center font-label-caps text-label-caps text-on-surface-variant">
          {t("profile.avatarHint")}
        </p>
      )}

      {/* Hidden file input, opened by the photo. `accept` filters the picker;
          `capture` is deliberately absent so the member can also choose an
          existing photo, not only take a new one. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset the input so choosing the SAME file again still fires change.
          e.target.value = "";

          if (file) handleFile(file);
        }}
      />

      {error && (
        <p role="alert" className="text-center font-body-sm text-body-sm text-error">
          {error}
        </p>
      )}

      {/* Removal is only offered when there is a photo, and is subject to the
          same cooldown server-side. */}
      {avatarUrl && !busy && !locked && (
        <button
          type="button"
          onClick={handleRemove}
          className="font-label-caps text-label-caps text-on-surface-variant underline-offset-2 hover:underline"
        >
          {t("profile.removePhoto")}
        </button>
      )}
    </div>
  );
}

/**
 * Draw an image to a 512px square canvas and return a JPEG data URL.
 *
 * Cropped to a centred square rather than stretched: an avatar renders in a
 * circle, so a non-square source would otherwise be distorted.
 *
 * Rejects if the browser cannot decode the file, which is how a corrupt or
 * mislabelled image is caught before an upload is attempted.
 */
async function downscale(file: File, size = 512, quality = 0.85): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => null);

  if (!bitmap) {
    throw new Error("decode failed");
  }

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");

  // Shortest edge fills the square; the overflow is cropped evenly.
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", quality);
}
