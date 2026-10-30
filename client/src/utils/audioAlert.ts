/**
 * audioAlert.ts
 * -------------
 * Synthesizes a soothing, audible chime notification for medication & routine alerts
 * using the HTML5 Web Audio API (zero external audio file dependencies).
 */

class AudioAlertService {
  private audioCtx: AudioContext | null = null;
  private buzzerInterval: ReturnType<typeof setInterval> | null = null;
  private isBuzzerRunning = false;
  private buzzerToneToggle = false;
  private activeOscillators: OscillatorNode[] = [];
  private buzzerListeners: Set<(active: boolean) => void> = new Set();

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.audioCtx || this.audioCtx.state === "closed") {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public resume(): void {
    const ctx = this.getContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  }

  public isBuzzerActive(): boolean {
    return this.isBuzzerRunning;
  }

  public onBuzzerChange(listener: (active: boolean) => void): () => void {
    this.buzzerListeners.add(listener);
    // Immediately emit current state to new subscriber
    listener(this.isBuzzerRunning);
    return () => {
      this.buzzerListeners.delete(listener);
    };
  }

  private notifyBuzzerListeners(): void {
    this.buzzerListeners.forEach((listener) => {
      try {
        listener(this.isBuzzerRunning);
      } catch (err) {
        console.error("Error in buzzer listener:", err);
      }
    });
  }

  /**
   * Starts a continuous, repeating emergency buzzer alarm (dual-tone alternating sawtooth pulses).
   * Will NOT stop until stopContinuousBuzzer() is explicitly called by the user.
   */
  public startContinuousBuzzer(): void {
    if (this.isBuzzerRunning) return;
    this.isBuzzerRunning = true;
    this.notifyBuzzerListeners();

    // Ensure audio context is running
    const ctx = this.getContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const pulse = () => {
      if (!this.isBuzzerRunning) return;
      try {
        const audio = this.getContext();
        if (!audio) return;
        if (audio.state === "suspended") {
          audio.resume().catch(() => {});
        }

        const now = audio.currentTime;
        // Alternate between 960Hz and 720Hz for an unmistakable emergency siren tone
        this.buzzerToneToggle = !this.buzzerToneToggle;
        const freq = this.buzzerToneToggle ? 960 : 720;

        const osc = audio.createOscillator();
        const gain = audio.createGain();

        // Sawtooth wave produces an urgent, crisp buzzer timbre
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, now);

        // Rapid attack and loud volume (0.65 gain)
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.65, now + 0.015);
        gain.gain.setValueAtTime(0.65, now + 0.17);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.21);

        osc.connect(gain);
        gain.connect(audio.destination);

        osc.start(now);
        osc.stop(now + 0.22);

        this.activeOscillators.push(osc);
        osc.onended = () => {
          this.activeOscillators = this.activeOscillators.filter((o) => o !== osc);
        };
      } catch (err) {
        console.warn("Buzzer audio pulse error:", err);
      }
    };

    // Play immediate pulse on user click
    pulse();

    // Repeat pulses every 260ms indefinitely until stopped
    if (this.buzzerInterval) {
      clearInterval(this.buzzerInterval);
    }
    this.buzzerInterval = setInterval(pulse, 260);
  }

  /**
   * Stops the continuous buzzer immediately and silences all sound.
   */
  public stopContinuousBuzzer(): void {
    this.isBuzzerRunning = false;
    if (this.buzzerInterval) {
      clearInterval(this.buzzerInterval);
      this.buzzerInterval = null;
    }

    // Stop and disconnect any active oscillator nodes immediately
    this.activeOscillators.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {}
    });
    this.activeOscillators = [];

    this.notifyBuzzerListeners();
  }

  /**
   * Plays a pleasant 3-note chime sequence (C5 -> E5 -> G5)
   */
  public playChime(): void {
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      const startTime = ctx.currentTime + 0.05;

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime + idx * 0.22);

        // Attack & decay envelope
        const noteStart = startTime + idx * 0.22;
        gain.gain.setValueAtTime(0.001, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.4, noteStart + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(noteStart);
        osc.stop(noteStart + 0.65);
      });
    } catch (err) {
      console.warn("Could not play audio chime alert:", err);
    }
  }

  /**
   * Plays a distinct warning buzzer sequence (e.g., 3 sharp buzz pulses)
   * used when the patient moves outside their designated safe radius.
   */
  public playWarningBeep(count = 3, frequency = 880): void {
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const runBeep = () => {
        const startTime = ctx.currentTime + 0.05;
        const beepDuration = 0.16; // 160ms sound
        const pauseDuration = 0.09; // 90ms silence

        for (let i = 0; i < count; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          const noteStart = startTime + i * (beepDuration + pauseDuration);
          const noteEnd = noteStart + beepDuration;

          // Sawtooth wave produces a crisp, unmistakable electronic buzzer timbre
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(frequency, noteStart);

          // Sharp attack and decay envelope
          gain.gain.setValueAtTime(0.001, noteStart);
          gain.gain.linearRampToValueAtTime(0.35, noteStart + 0.02);
          gain.gain.setValueAtTime(0.35, noteEnd - 0.02);
          gain.gain.linearRampToValueAtTime(0.001, noteEnd);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(noteStart);
          osc.stop(noteEnd + 0.01);
        }
      };

      if (ctx.state === "suspended") {
        ctx.resume().then(runBeep).catch(() => {});
      } else {
        runBeep();
      }
    } catch (err) {
      console.warn("Could not play warning beep alert:", err);
    }
  }

  /**
   * Speaks the reminder text clearly using SpeechSynthesis.
   */
  public speak(text: string): void {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9; // Slightly slower, calm delivery for dementia/Alzheimer patients
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn("Speech synthesis error:", err);
    }
  }
}

export const audioAlert = new AudioAlertService();

// Automatically unlock browser audio restrictions on the very first user click/touch
if (typeof window !== "undefined") {
  const unlockAudio = () => {
    audioAlert.resume();
    window.removeEventListener("click", unlockAudio);
    window.removeEventListener("keydown", unlockAudio);
    window.removeEventListener("touchstart", unlockAudio);
  };
  window.addEventListener("click", unlockAudio);
  window.addEventListener("keydown", unlockAudio);
  window.addEventListener("touchstart", unlockAudio);
}
