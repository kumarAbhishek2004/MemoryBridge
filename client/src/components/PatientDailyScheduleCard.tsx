import { useState } from "react";
import {
  CalendarCheck, Clock, CheckCircle2, ChevronDown, ChevronUp,
  Pill, Utensils, Activity, Sparkles, X,
} from "lucide-react";
import { useGetRoutinesQuery, useCompleteRoutineMutation } from "@/services";
import type { RoutineItem, RoutineCategory } from "@/types";
import { Card, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

function format12Hour(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return time24;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

const CATEGORY_ICONS: Record<RoutineCategory, typeof Pill> = {
  medication: Pill,
  meal: Utensils,
  activity: Activity,
  general: Sparkles,
};

/**
 * Clean Header Button that opens the daily schedule modal without cluttering the conversation screen.
 */
export function PatientDailyScheduleHeaderButton({ patientId }: { patientId: number }) {
  const { data: resp } = useGetRoutinesQuery(patientId, { pollingInterval: 15000 });
  const [completeRoutine] = useCompleteRoutineMutation();
  const [modalOpen, setModalOpen] = useState(false);

  const routines: RoutineItem[] = (resp?.data ?? []).filter((r: RoutineItem) => r.is_active);
  if (routines.length === 0) return null;

  const completedCount = routines.filter((r: RoutineItem) => wasCompletedToday(r.last_completed_at)).length;

  const handleComplete = async (routineId: number) => {
    await completeRoutine({ patient_id: patientId, routine_id: routineId });
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setModalOpen(true)}
        className="gap-2 h-9 px-3 border-border bg-card shadow-sm hover:bg-muted font-medium cursor-pointer"
        title="View today's medications and routine schedule"
      >
        <CalendarCheck className="size-4 text-emerald-600" />
        <span className="text-xs font-semibold hidden sm:inline">Today's Schedule & Meds</span>
        <span className="text-[11px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
          {completedCount}/{routines.length} Done
        </span>
      </Button>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 px-6 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-lg bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
                  <CalendarCheck className="size-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Today's Schedule & Medications</h3>
                  <p className="text-xs text-muted-foreground">
                    {completedCount} of {routines.length} tasks completed today
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-lg"
                onClick={() => setModalOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="p-6 overflow-y-auto space-y-2.5 flex-1">
              {routines.map((item: RoutineItem) => {
                const Icon = CATEGORY_ICONS[item.category] ?? Sparkles;
                const isDone = wasCompletedToday(item.last_completed_at);

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-xl border text-sm transition-all",
                      isDone
                        ? "bg-emerald-500/5 border-emerald-500/20 text-muted-foreground opacity-80"
                        : "bg-background border-border text-foreground hover:border-foreground/20"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg",
                        isDone ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
                      )}>
                        <Icon className="size-4" />
                      </div>
                      <div className="truncate">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs">{format12Hour(item.time)}</span>
                          <span className={cn("font-semibold text-sm truncate", isDone && "line-through")}>
                            {item.title}
                          </span>
                          {item.dosage && (
                            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-normal">
                              {item.dosage}
                            </Badge>
                          )}
                        </div>
                        {item.instructions && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{item.instructions}</p>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 ml-3">
                      <Button
                        size="sm"
                        variant={isDone ? "outline" : "default"}
                        onClick={() => handleComplete(item.id)}
                        className={cn(
                          "h-8 text-xs px-2.5 gap-1",
                          isDone && "text-emerald-600 hover:text-destructive hover:border-destructive/30"
                        )}
                      >
                        <CheckCircle2 className="size-3.5" />
                        {isDone ? "Done (Undo)" : "Mark Done"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 px-6 border-t border-border bg-muted/20 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setModalOpen(false)}>
                Close Schedule
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Standard inline card (kept for backwards compatibility)
 */
export function PatientDailyScheduleCard({ patientId }: { patientId: number }) {
  const { data: resp } = useGetRoutinesQuery(patientId, { pollingInterval: 20000 });
  const [completeRoutine] = useCompleteRoutineMutation();
  const [isExpanded, setIsExpanded] = useState(false);

  const routines: RoutineItem[] = (resp?.data ?? []).filter((r: RoutineItem) => r.is_active);
  if (routines.length === 0) return null;

  const completedCount = routines.filter((r: RoutineItem) => wasCompletedToday(r.last_completed_at)).length;

  const handleComplete = async (e: React.MouseEvent, routineId: number) => {
    e.stopPropagation();
    await completeRoutine({ patient_id: patientId, routine_id: routineId });
  };

  return (
    <Card className="overflow-hidden border-border bg-card shadow-sm transition-all">
      <Button
        variant="ghost"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full h-auto px-4 py-3 flex items-center justify-between rounded-none hover:bg-muted/50"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarCheck className="size-4" />
          </div>
          <CardTitle className="text-xs font-bold uppercase tracking-tight text-foreground">
            Today's Schedule & Medications
          </CardTitle>
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
            {completedCount}/{routines.length} Done
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isExpanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
        </div>
      </Button>

      {isExpanded && (
        <CardContent className="p-4 pt-2 border-t border-border space-y-2 bg-muted/20">
          {routines.map((item: RoutineItem) => {
            const Icon = CATEGORY_ICONS[item.category] ?? Sparkles;
            const isDone = wasCompletedToday(item.last_completed_at);

            return (
              <div
                key={item.id}
                className={cn(
                  "flex items-center justify-between p-2.5 rounded-lg border text-sm transition-all",
                  isDone
                    ? "bg-emerald-500/5 border-emerald-500/20 text-muted-foreground line-through opacity-75"
                    : "bg-background border-border text-foreground"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-md",
                    isDone ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
                  )}>
                    <Icon className="size-3.5" />
                  </div>
                  <div className="truncate">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs">{format12Hour(item.time)}</span>
                      <span className="font-medium text-sm truncate">{item.title}</span>
                      {item.dosage && (
                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-normal">
                          {item.dosage}
                        </Badge>
                      )}
                    </div>
                    {item.instructions && (
                      <p className="text-[11px] text-muted-foreground truncate">{item.instructions}</p>
                    )}
                  </div>
                </div>

                <div className="shrink-0 ml-2">
                  {isDone ? (
                    <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="size-4" /> Done
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => handleComplete(e, item.id)}
                      className="h-7 text-xs px-2 gap-1"
                    >
                      <Clock className="size-3" /> Mark Done
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
