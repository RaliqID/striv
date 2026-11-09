/**
 * Web Audio API synthesizer & haptic engine for workout timers.
 *
 * Uses native Web Audio API oscillators and GainNodes to generate clean,
 * athletic auditory cues (countdown beeps and completion chime) without
 * loading external audio files. Honors user mute preference and device haptic support.
 */

class SoundFx {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("striv_rest_timer_muted");
        this.muted = stored === "true";
      } catch {
        this.muted = false;
      }
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("striv_rest_timer_muted", String(muted));
      } catch {}
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /**
   * Warning countdown beep for 3, 2, 1 seconds.
   * Pure sine wave with quick attack and smooth exponential decay.
   */
  public playBeep(freq = 880, duration = 0.08): void {
    if (this.muted) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio playback failed or blocked by browser policy
    }
  }

  /**
   * Harmonic completion chime (3-note ascending triad: C5 -> E5 -> G5).
   * Warm, celebratory, professional athletic tone.
   */
  public playFinishChime(): void {
    if (this.muted) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const notes = [
        { freq: 523.25, time: 0.0, dur: 0.22 }, // C5
        { freq: 659.25, time: 0.12, dur: 0.25 }, // E5
        { freq: 783.99, time: 0.24, dur: 0.45 }, // G5
      ];

      notes.forEach(({ freq, time, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + time);

        gain.gain.setValueAtTime(0.001, ctx.currentTime + time);
        gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + time + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + time);
        osc.stop(ctx.currentTime + time + dur);
      });
    } catch {
      // Audio playback failed
    }
  }

  /**
   * Device haptic vibration via Web Vibration API.
   * Safe check prevents crashes on unsupported devices or desktop browsers.
   */
  public vibrate(pattern: number | number[]): void {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Haptics not allowed or unsupported
      }
    }
  }
}

export const soundFx = new SoundFx();
