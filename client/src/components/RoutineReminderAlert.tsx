import { useEffect, useState, useRef, useMemo } from "react";
import {
  Pill, Utensils, Activity, Sparkles, CheckCircle2,
  Volume2, Clock, Bell, X,
} from "lucide-react";
import { useGetRoutinesQuery, useCompleteRoutineMutation } from "@/services";
import type { RoutineItem } from "@/types";
import { Button } from "@/components/ui/button";
import { audioAlert } from "@/utils/audioAlert";
import { cn } from "@/lib/utils";

function toUtcDate(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const iso = dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : dateStr + "Z";
  return new Date(iso);
}

function wasCompletedToday(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  const comp = toUtcDate(dateStr);
  if (!comp) return false;
  const now = new Date();
  return (
    comp.getFullYear() === now.getFullYear() &&
    comp.getMonth() === now.getMonth() &&
    comp.getDate() === now.getDate()
  );
}

function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}

function format12Hour(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return time24;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export function RoutineReminderAlert({
  patientId,
  patientName,
}: {
  patientId: number;
  patientName: string;
}) {
  const { data: resp } = useGetRoutinesQuery(patientId, { pollingInterval: 5000 });
  const [completeRoutine, { isLoading: isCompleting }] = useCompleteRoutineMutation();

  const [activeAlert, setActiveAlert] = useState<RoutineItem | null>(null);
  const [snoozedUntil, setSnoozedUntil] = useState<Record<number, number>>({});
  const [dismissedSession, setDismissedSession] = useState<Record<number, boolean>>({});

  const hasAnnouncedRef = useRef<Record<string, boolean>>({});

  const routines = useMemo(() => resp?.data ?? [], [resp?.data]);

  // Check schedules every 3 seconds
  useEffect(() => {
    const checkSchedule = () => {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const nowTimestamp = Date.now();
      const todayDateStr = now.toDateString();

      for (const item of routines) {
        if (!item.is_active) continue;
        if (wasCompletedToday(item.last_completed_at)) continue;
        if (dismissedSession[item.id]) continue;

        // Check snooze
        if (snoozedUntil[item.id] && nowTimestamp < snoozedUntil[item.id]) {
          continue;
        }

        const itemMinutes = parseTimeToMinutes(item.time);
        // Due if current time is within [itemMinutes, itemMinutes + 45] (due now or passed recently today)
        const isTimeDue = nowMinutes >= itemMinutes && (nowMinutes - itemMinutes) <= 45;
        const isSnoozeExpired = !!(snoozedUntil[item.id] && nowTimestamp >= snoozedUntil[item.id]);

        if (isTimeDue || isSnoozeExpired) {
          const alertKey = `${item.id}-${todayDateStr}-${item.time}`;
          if (!hasAnnouncedRef.current[alertKey] || isSnoozeExpired) {
            hasAnnouncedRef.current[alertKey] = true;
            setActiveAlert(item);

            // Play audio chime
            audioAlert.resume();
            audioAlert.playChime();

            // Speak voice reminder aloud
            const speakText = item.category === "medication"
              ? `Hello ${patientName}. It is ${format12Hour(item.time)}. Time to take your medicine: ${item.title}. ${item.dosage ? item.dosage + '.' : ''} ${item.instructions ? item.instructions : ''}`
              : `Hello ${patientName}. It is ${format12Hour(item.time)}. Time for ${item.title}. ${item.instructions ? item.instructions : ''}`;

            setTimeout(() => {
              audioAlert.speak(speakText);
            }, 600);
          }
          break; // Show one modal at a time
        }
      }
    };

    checkSchedule();
    const timer = setInterval(checkSchedule, 3000);
    return () => clearInterval(timer);
  }, [routines, snoozedUntil, dismissedSession, patientName]);

  const handleComplete = async () => {
    if (!activeAlert) return;
    try {
      await completeRoutine({ patient_id: patientId, routine_id: activeAlert.id }).unwrap();
      audioAlert.speak("Great job! Marked as completed.");
      setActiveAlert(null);
    } catch (err) {
      console.error("Failed to mark routine complete:", err);
      setActiveAlert(null);
    }
  };

  const handleSnooze = () => {
    if (!activeAlert) return;
    const snoozeTime = Date.now() + 5 * 60 * 1000; // 5 minutes
    setSnoozedUntil((prev) => ({ ...prev, [activeAlert.id]: snoozeTime }));
    audioAlert.speak("Reminder snoozed for 5 minutes.");
    setActiveAlert(null);
  };

  const handleDismiss = () => {
    if (!activeAlert) return;
    setDismissedSession((prev) => ({ ...prev, [activeAlert.id]: true }));
    setActiveAlert(null);
  };

  const handleRepeatVoice = () => {
    if (!activeAlert) return;
    audioAlert.playChime();
    const speakText = activeAlert.category === "medication"
      ? `Time to take your medicine: ${activeAlert.title}. ${activeAlert.dosage ? activeAlert.dosage + '.' : ''} ${activeAlert.instructions ? activeAlert.instructions : ''}`
      : `Time for ${activeAlert.title}. ${activeAlert.instructions ? activeAlert.instructions : ''}`;
    setTimeout(() => {
      audioAlert.speak(speakText);
    }, 400);
  };

  if (!activeAlert) return null;

  const isMed = activeAlert.category === "medication";
  const isMeal = activeAlert.category === "meal";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-lg rounded-3xl border-2 border-primary/30 bg-card p-8 shadow-2xl text-center space-y-6">
        
        {/* Dismiss Button */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-2 rounded-full text-muted-foreground hover:bg-muted transition-colors"
          title="Dismiss for now"
        >
          <X className="size-5" />
        </button>

        {/* Animated Icon Circle */}
        <div className="flex justify-center">
          <div className={cn(
            "flex size-24 items-center justify-center rounded-full ring-8 shadow-xl animate-bounce",
            isMed
              ? "bg-purple-500/20 text-purple-600 ring-purple-500/10"
              : isMeal
              ? "bg-amber-500/20 text-amber-600 ring-amber-500/10"
              : "bg-emerald-500/20 text-emerald-600 ring-emerald-500/10"
          )}>
            {isMed ? (
              <Pill className="size-12" />
            ) : isMeal ? (
              <Utensils className="size-12" />
            ) : activeAlert.category === "activity" ? (
              <Activity className="size-12" />
            ) : (
              <Sparkles className="size-12" />
            )}
          </div>
        </div>

        {/* Title and Time */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-wide uppercase">
            <Clock className="size-3.5" />
            {format12Hour(activeAlert.time)} · {activeAlert.category}
          </div>

          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
            {activeAlert.title}
          </h2>

          {activeAlert.dosage && (
            <p className="text-lg font-bold text-primary">
              {activeAlert.dosage}
            </p>
          )}

          {activeAlert.instructions && (
            <div className="mx-auto max-w-md rounded-2xl bg-muted/60 p-4 border border-border/60 text-sm text-foreground leading-relaxed mt-2">
              <p className="font-semibold text-muted-foreground text-xs uppercase mb-1">Instructions</p>
              <p className="text-base">{activeAlert.instructions}</p>
            </div>
          )}
        </div>

        {/* Buttons for Patient / Caregiver */}
        <div className="space-y-3 pt-2">
          <Button
            size="lg"
            onClick={handleComplete}
            disabled={isCompleting}
            className="w-full h-16 text-lg font-bold rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg gap-2 cursor-pointer transition-transform active:scale-98"
          >
            <CheckCircle2 className="size-6" />
            {isMed ? "I Have Taken My Medicine" : "I Have Completed This"}
          </Button>

          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={handleRepeatVoice}
              className="h-12 text-sm font-semibold rounded-xl border-border gap-2"
            >
              <Volume2 className="size-4 text-primary" /> Hear Again
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={handleSnooze}
              className="h-12 text-sm font-semibold rounded-xl gap-2"
            >
              <Bell className="size-4 text-muted-foreground" /> Remind in 5m
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
