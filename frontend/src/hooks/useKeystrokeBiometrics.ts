import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

// Standard simulation vectors representing behavioral drift profiles
export type SimulationMode = 'NONE' | 'LEGITIMATE' | 'COERCED_ANOMALOUS' | 'CONTEXT_MISM';

export function useKeystrokeBiometrics() {
  const { token, refreshSessionState } = useAuth();
  
  // Buffers
  const keydownTimes = useRef<Record<string, number>>({});
  const lastKeyupTime = useRef<number | null>(null);
  const dwellTimes = useRef<number[]>([]);
  const flightTimes = useRef<number[]>([]);
  const keystrokesCount = useRef(0);
  const correctionsCount = useRef(0);
  const timerStart = useRef<number>(Date.now());

  // Submit current metrics to the backend signal processing pipeline
  const submitSignal = async () => {
    if (!token) return;

    // Get current mode from localStorage
    const mode = (localStorage.getItem('cg_sim_mode') || 'NONE') as SimulationMode;

    // ── NONE mode = biometrics paused ────────────────────────────────
    // When no simulation profile is selected, we do NOT submit signals
    // to the ARES pipeline. This prevents false positives from normal
    // browsing (search queries, navigation keystrokes, etc.) whose
    // rhythm naturally deviates from the hardcoded baseline.
    //
    // To trigger ARES evaluations, the user must explicitly select a
    // simulation profile on the Security dashboard page.
    if (mode === 'NONE') {
      // Still collect keystroke data in the buffers (useful if the user
      // switches modes mid-session), but don't evaluate or submit.
      return;
    }

    let signalData: any = {};

    if (mode === 'LEGITIMATE') {
      // Simulate normal typing vector matching user's registered baseline
      signalData = {
        dwellTimeMs: 105 + (Math.random() - 0.5) * 10,
        flightTimeMs: 165 + (Math.random() - 0.5) * 20,
        typingSpeedCpm: 245 + (Math.random() - 0.5) * 30,
        correctionRate: 0.04 + (Math.random() - 0.5) * 0.02,
        context: { locationCoarse: 'US-EAST' },
      };
    } else if (mode === 'COERCED_ANOMALOUS') {
      // Simulate erratic, slower typing with high error rate (nervous, physical threat)
      signalData = {
        dwellTimeMs: 195 + (Math.random() - 0.5) * 30,
        flightTimeMs: 460 + (Math.random() - 0.5) * 60,
        typingSpeedCpm: 75 + (Math.random() - 0.5) * 15,
        correctionRate: 0.38 + (Math.random() - 0.5) * 0.08,
        context: { locationCoarse: 'US-EAST' },
      };
    } else if (mode === 'CONTEXT_MISM') {
      // Simulate normal typing but from a highly suspicious location context
      signalData = {
        dwellTimeMs: 110 + (Math.random() - 0.5) * 10,
        flightTimeMs: 170 + (Math.random() - 0.5) * 20,
        typingSpeedCpm: 235 + (Math.random() - 0.5) * 25,
        correctionRate: 0.05 + (Math.random() - 0.5) * 0.02,
        context: { locationCoarse: 'ASIA-PAC' }, // Mismatch location
      };
    }

    try {
      const res = await fetch('/api/ares/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signalData),
      });

      if (res.ok) {
        // Automatically check if the session state degraded (NORMAL -> STEP_UP -> RESTRICTED -> SHADOW)
        await refreshSessionState();
      }
    } catch (err) {
      console.error('Failed to submit ARES signal:', err);
    } finally {
      // Clear buffers
      dwellTimes.current = [];
      flightTimes.current = [];
      keystrokesCount.current = 0;
      correctionsCount.current = 0;
      timerStart.current = Date.now();
    }
  };

  useEffect(() => {
    if (!token) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore modifier keys
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;

      const code = e.code;
      if (!keydownTimes.current[code]) {
        const now = Date.now();
        keydownTimes.current[code] = now;

        if (lastKeyupTime.current) {
          const flight = now - lastKeyupTime.current;
          // Capture flight if realistic (less than 3 seconds)
          if (flight > 0 && flight < 3000) {
            flightTimes.current.push(flight);
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;

      const code = e.code;
      const downTime = keydownTimes.current[code];
      const now = Date.now();

      if (downTime) {
        const dwell = now - downTime;
        if (dwell > 0 && dwell < 1000) {
          dwellTimes.current.push(dwell);
        }
        delete keydownTimes.current[code];
      }

      lastKeyupTime.current = now;
      keystrokesCount.current += 1;

      if (e.key === 'Backspace' || e.key === 'Delete') {
        correctionsCount.current += 1;
      }

      // Auto-submit when user has typed enough keys AND a simulation mode is active.
      // 15 keystrokes is enough for a simulation profile to produce a meaningful signal.
      const mode = (localStorage.getItem('cg_sim_mode') || 'NONE') as SimulationMode;
      if (mode !== 'NONE' && keystrokesCount.current >= 15) {
        submitSignal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Periodically submit signal buffer (every 8 seconds) — only fires
    // if a simulation mode is active (submitSignal early-returns for NONE)
    const interval = setInterval(() => {
      submitSignal();
    }, 8000);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      clearInterval(interval);
    };
  }, [token]);
}
