import { useEffect, useRef, useCallback } from "react";

interface FallDetectionOptions {
  onFallDetected: () => void;
  impactThreshold?: number; // Total acceleration threshold in m/s^2 (default 24)
  stillnessDurationMs?: number; // Duration of stillness required after impact in ms (default 2500)
  enabled?: boolean;
}

export function useFallDetection({
  onFallDetected,
  impactThreshold = 24.0,
  stillnessDurationMs = 2500,
  enabled = true,
}: FallDetectionOptions) {
  const lastImpactTimeRef = useRef<number | null>(null);
  const stillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMotion = useCallback(
    (event: DeviceMotionEvent) => {
      if (!enabled) return;
      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

      const totalAcc = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);

      // 1. Detect high impact acceleration spike
      if (totalAcc > impactThreshold) {
        lastImpactTimeRef.current = Date.now();

        // Clear any previous stillness timer
        if (stillTimerRef.current) clearTimeout(stillTimerRef.current);

        // Schedule stillness check: if no new high-impact occurs and device stays still
        stillTimerRef.current = setTimeout(() => {
          if (lastImpactTimeRef.current && Date.now() - lastImpactTimeRef.current >= stillnessDurationMs) {
            console.warn("Fall detected: High impact followed by prolonged immobility.");
            onFallDetected();
            lastImpactTimeRef.current = null;
          }
        }, stillnessDurationMs);
      }
    },
    [enabled, impactThreshold, stillnessDurationMs, onFallDetected]
  );

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    // Check if DeviceMotionEvent is available in current browser/device
    if ("DeviceMotionEvent" in window) {
      window.addEventListener("devicemotion", handleMotion);
    }

    return () => {
      if (typeof window !== "undefined" && "DeviceMotionEvent" in window) {
        window.removeEventListener("devicemotion", handleMotion);
      }
      if (stillTimerRef.current) clearTimeout(stillTimerRef.current);
    };
  }, [enabled, handleMotion]);

  // Manual test trigger for desktops and demonstrations
  const triggerSimulatedFall = useCallback(() => {
    console.log("Simulating fall detection event...");
    onFallDetected();
  }, [onFallDetected]);

  return {
    triggerSimulatedFall,
  };
}
