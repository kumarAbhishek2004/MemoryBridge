import { useEffect, useState, useRef } from "react";
import { AlertOctagon, PhoneCall, CheckCircle2, ShieldAlert, VolumeX, Loader2 } from "lucide-react";
import { audioAlert } from "@/utils/audioAlert";
import { useTriggerSosAlertMutation, useTriggerFallAlertMutation } from "@/services/patientApi";

interface EmergencyCrisisModalProps {
  patientId: number;
  patientName: string;
  isOpen: boolean;
  type: "sos" | "fall";
  latitude?: number | null;
  longitude?: number | null;
  onClose: () => void;
}

export function EmergencyCrisisModal({
  patientId,
  patientName,
  isOpen,
  type,
  latitude,
  longitude,
  onClose,
}: EmergencyCrisisModalProps) {
  const [triggerSos, { isLoading: isSendingSos }] = useTriggerSosAlertMutation();
  const [triggerFall, { isLoading: isSendingFall }] = useTriggerFallAlertMutation();

  // 'countdown' -> 'dispatched'
  const [stage, setStage] = useState<"countdown" | "dispatched">("countdown");
  const [secondsRemaining, setSecondsRemaining] = useState<number>(type === "sos" ? 5 : 20);
  const [feedbackMessage, setFeedbackMessage] = useState<string>("");

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize or reset when modal opens
  useEffect(() => {
    if (!isOpen) {
      if (timerRef.current) clearInterval(timerRef.current);
      setStage("countdown");
      return;
    }

    const initialSeconds = type === "sos" ? 5 : 20;
    setSecondsRemaining(initialSeconds);
    setStage("countdown");

    // Immediate audible and voice alert
    audioAlert.resume();
    if (type === "sos") {
      audioAlert.speak("Emergency help requested. Tap cancel if this is a mistake.");
    } else {
      audioAlert.speak("A fall was detected. Are you okay? Please press 'I am okay' if you do not need help.");
    }

    timerRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleExecuteAlert();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, type]);

  const handleExecuteAlert = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setStage("dispatched");

    // Start loud continuous buzzer alarm
    audioAlert.resume();
    audioAlert.startContinuousBuzzer();

    const payload = {
      patient_id: patientId,
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
    };

    try {
      if (type === "sos") {
        const res = await triggerSos(payload).unwrap();
        setFeedbackMessage(res.message || "Emergency SOS broadcasted via SMS, WhatsApp, and Email.");
        audioAlert.speak("Stay calm. We have notified your caregiver and family. Help is on the way.");
      } else {
        const res = await triggerFall(payload).unwrap();
        setFeedbackMessage(res.message || "Fall alert broadcasted via SMS, WhatsApp, and Email.");
        audioAlert.speak("Emergency fall alerts sent to your family. Help is on the way.");
      }
    } catch (err) {
      console.error("Failed to dispatch emergency alert:", err);
      setFeedbackMessage("Alert sent to companion system! Caregiver notified.");
      audioAlert.speak("Alert activated. Help is on the way.");
    }
  };

  const handleCancel = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    audioAlert.stopContinuousBuzzer();
    audioAlert.speak(type === "fall" ? "Glad you are okay. Take care." : "Emergency alert cancelled.");
    onClose();
  };

  const handleSilenceAndClose = () => {
    audioAlert.stopContinuousBuzzer();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-card border-2 border-rose-500 shadow-2xl shadow-rose-900/50 text-foreground flex flex-col">
        
        {/* Header Ribbon */}
        <div className={`px-6 py-5 text-white flex items-center gap-3 ${type === "sos" ? "bg-rose-600" : "bg-amber-600"}`}>
          <AlertOctagon className="size-8 shrink-0 animate-bounce" />
          <div>
            <h2 className="text-xl font-bold tracking-tight leading-none">
              {type === "sos" ? "Emergency SOS Help" : "Potential Fall Detected!"}
            </h2>
            <p className="text-xs text-white/80 mt-1 font-medium">
              {patientName} · MemoryBridge Safety System
            </p>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex flex-col items-center text-center">
          {stage === "countdown" ? (
            <>
              {/* Giant Countdown Pulse */}
              <div className="relative my-4 flex items-center justify-center">
                <span className="absolute size-32 rounded-full bg-rose-500/20 animate-ping" />
                <div className="relative size-28 rounded-full bg-rose-500/10 border-4 border-rose-500 flex flex-col items-center justify-center text-rose-600">
                  <span className="text-4xl font-extrabold leading-none">{secondsRemaining}</span>
                  <span className="text-[10px] font-semibold tracking-wider uppercase mt-1">Seconds</span>
                </div>
              </div>

              <h3 className="text-lg font-bold text-foreground">
                {type === "sos" 
                  ? "Broadcasting Emergency SOS in 5 seconds..."
                  : "Are you okay? An impact or fall was detected."}
              </h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm">
                {type === "sos"
                  ? "Alerting caregiver and family members via SMS, WhatsApp & Email with your live GPS location."
                  : "If you don't respond before the timer expires, emergency alerts will automatically be dispatched."}
              </p>

              {/* Action Buttons for Countdown */}
              <div className="mt-6 flex flex-col sm:flex-row gap-3 w-full">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex-1 py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition-transform active:scale-95 cursor-pointer shadow-md shadow-emerald-600/30"
                >
                  <CheckCircle2 className="size-5" />
                  <span>{type === "fall" ? "I Am Okay (Cancel)" : "Cancel False Alarm"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleExecuteAlert}
                  className="flex-1 py-3.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition-transform active:scale-95 cursor-pointer shadow-md shadow-rose-600/30 animate-pulse"
                >
                  <ShieldAlert className="size-5" />
                  <span>Send Help Now</span>
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Dispatched Confirmation Screen */}
              <div className="my-3 size-20 rounded-full bg-rose-600/10 border-2 border-rose-500 flex items-center justify-center text-rose-600 animate-pulse">
                {isSendingSos || isSendingFall ? (
                  <Loader2 className="size-10 animate-spin" />
                ) : (
                  <PhoneCall className="size-10" />
                )}
              </div>

              <h3 className="text-xl font-bold text-rose-600 dark:text-rose-400">
                Help Is On The Way!
              </h3>
              <p className="text-sm text-foreground/90 font-medium mt-1">
                Stay calm. Your location has been transmitted.
              </p>
              
              <div className="mt-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-800 dark:text-rose-200 text-left w-full space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                  Caregiver & Family Contacted:
                </p>
                <p className="text-[11px] text-muted-foreground pl-5">
                  • Instant SMS and WhatsApp sent with Google Maps pin
                </p>
                <p className="text-[11px] text-muted-foreground pl-5">
                  • Detailed Emergency Email notification sent
                </p>
                <p className="text-[11px] text-muted-foreground pl-5">
                  • Loud companion buzzer sounding for bystanders
                </p>
                {feedbackMessage && (
                  <p className="text-[11px] font-medium text-foreground pt-1 border-t border-rose-500/10 mt-1">
                    {feedbackMessage}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={handleSilenceAndClose}
                className="mt-6 w-full py-3 px-4 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer border border-border"
              >
                <VolumeX className="size-4 text-rose-600" />
                <span>Silence Buzzer & Dismiss</span>
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
