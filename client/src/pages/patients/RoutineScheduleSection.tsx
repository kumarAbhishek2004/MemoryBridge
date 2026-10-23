import { useState } from "react";
import {
  Clock, Plus, Pill, Utensils, Activity, Sparkles,
  CheckCircle2, Trash2, AlertCircle, X, Bell,
  CalendarCheck, Volume2, Undo2,
} from "lucide-react";
import { audioAlert } from "@/utils/audioAlert";
import {
  useGetRoutinesQuery,
  useCreateRoutineMutation,
  useUpdateRoutineMutation,
  useDeleteRoutineMutation,
  useCompleteRoutineMutation,
} from "@/services";
import type { RoutineItem, RoutineCategory } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const CATEGORY_META: Record<
  RoutineCategory,
  { label: string; icon: typeof Pill; bg: string; text: string; ring: string }
> = {
  medication: {
    label: "Medication",
    icon: Pill,
    bg: "bg-purple-500/10",
    text: "text-purple-600 dark:text-purple-400",
    ring: "ring-purple-500/20",
  },
  meal: {
    label: "Meal / Diet",
    icon: Utensils,
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/20",
  },
  activity: {
    label: "Activity",
    icon: Activity,
    bg: "bg-blue-500/10",
    text: "text-blue-600 dark:text-blue-400",
    ring: "ring-blue-500/20",
  },
  general: {
    label: "Routine",
    icon: Sparkles,
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-500/20",
  },
};

function format12Hour(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return time24;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

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

// ── Add/Edit Modal ────────────────────────────────────────────────────────────
function RoutineModal({
  patientId,
  initialData,
  onClose,
}: {
  patientId: number;
  initialData?: RoutineItem | null;
  onClose: () => void;
}) {
  const [createRoutine, { isLoading: isCreating }] = useCreateRoutineMutation();
  const [updateRoutine, { isLoading: isUpdating }] = useUpdateRoutineMutation();

  const [title, setTitle] = useState(initialData?.title ?? "");
  const [category, setCategory] = useState<RoutineCategory>(initialData?.category ?? "medication");
  const [time, setTime] = useState(initialData?.time ?? "08:00");
  const [dosage, setDosage] = useState(initialData?.dosage ?? "");
  const [instructions, setInstructions] = useState(initialData?.instructions ?? "");
  const [daysOfWeek, setDaysOfWeek] = useState(initialData?.days_of_week ?? "daily");
  const [error, setError] = useState("");

  const isSaving = isCreating || isUpdating;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Please provide a title");
      return;
    }
    if (!time) {
      setError("Please select a time");
      return;
    }

    try {
      if (initialData) {
        await updateRoutine({
          patient_id: patientId,
          routine_id: initialData.id,
          title: title.trim(),
          category,
          time,
          dosage: dosage.trim() || undefined,
          instructions: instructions.trim() || undefined,
          days_of_week: daysOfWeek,
        }).unwrap();
      } else {
        await createRoutine({
          patient_id: patientId,
          title: title.trim(),
          category,
          time,
          dosage: dosage.trim() || undefined,
          instructions: instructions.trim() || undefined,
          days_of_week: daysOfWeek,
          is_active: true,
        }).unwrap();
      }
      onClose();
    } catch (err: unknown) {
      const msg = (err as { data?: { message?: string } })?.data?.message;
      setError(msg || "Failed to save routine. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bell className="size-4" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">
                {initialData ? "Edit Routine / Medicine" : "Schedule Routine or Medication"}
              </h3>
              <p className="text-xs text-muted-foreground">
                Set a time for the patient to be reminded with sound and voice.
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="size-8" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Category <span className="text-destructive">*</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(["medication", "meal", "activity", "general"] as RoutineCategory[]).map((cat) => {
                const meta = CATEGORY_META[cat];
                const Icon = meta.icon;
                const isSelected = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-lg border text-xs font-medium transition-all",
                      isSelected
                        ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/30"
                        : "border-border hover:bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="size-4" />
                    <span className="capitalize">{cat === "general" ? "Routine" : cat}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              {category === "medication" ? "Medicine Name" : "Activity / Task Title"} <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              placeholder={category === "medication" ? "e.g. Donepezil (Aricept)" : category === "meal" ? "e.g. Nutritious Breakfast" : "e.g. Morning Garden Walk"}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Scheduled Time <span className="text-destructive">*</span>
              </label>
              <input
                type="time"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                {category === "medication" ? "Dosage" : "Frequency"}
              </label>
              <input
                type="text"
                placeholder={category === "medication" ? "e.g. 5mg (1 tablet)" : "e.g. Daily / 20 mins"}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                value={dosage}
                onChange={(e) => setDosage(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Instructions & Caregiver Notes
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Take with a glass of water after breakfast. Keep water handy."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Repeat Days
            </label>
            <select
              value={daysOfWeek}
              onChange={(e) => setDaysOfWeek(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="daily">Every Day (Daily)</option>
              <option value="mon,tue,wed,thu,fri">Weekdays (Mon - Fri)</option>
              <option value="sat,sun">Weekends (Sat - Sun)</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSaving}>
              {isSaving ? "Saving..." : initialData ? "Update Routine" : "Add Routine"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Routine Schedule Section Component ──────────────────────────────────
export function RoutineScheduleSection({ patientId }: { patientId: number }) {
  const { data: resp, isLoading } = useGetRoutinesQuery(patientId, { pollingInterval: 15000 });
  const [updateRoutine] = useUpdateRoutineMutation();
  const [deleteRoutine] = useDeleteRoutineMutation();
  const [completeRoutine] = useCompleteRoutineMutation();

  const [filter, setFilter] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RoutineItem | null>(null);

  const routines: RoutineItem[] = resp?.data ?? [];

  const filtered: RoutineItem[] = routines.filter((r: RoutineItem) => {
    if (filter === "all") return true;
    return r.category === filter;
  });

  const completedCount = routines.filter((r: RoutineItem) => wasCompletedToday(r.last_completed_at)).length;

  const handleToggleActive = async (routine: RoutineItem) => {
    await updateRoutine({
      patient_id: patientId,
      routine_id: routine.id,
      is_active: !routine.is_active,
    });
  };

  const handleDelete = async (routineId: number) => {
    if (window.confirm("Are you sure you want to remove this routine reminder?")) {
      await deleteRoutine({ patient_id: patientId, routine_id: routineId });
    }
  };

  const handleToggleComplete = async (routine: RoutineItem) => {
    await completeRoutine({ patient_id: patientId, routine_id: routine.id });
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="p-5 pb-3 border-b border-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CalendarCheck className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">
                Daily Routine & Medication Schedule
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automated audio chimes and voice alerts in Patient Mode at scheduled times.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs px-2.5 py-1 rounded-full bg-muted font-medium text-muted-foreground flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span>{completedCount} of {routines.length} completed today</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                audioAlert.resume();
                audioAlert.playChime();
                audioAlert.speak("Hello! This is a test alert for your scheduled medication.");
              }}
              className="gap-1.5 h-8 text-xs"
              title="Test audio chime and voice notification"
            >
              <Volume2 className="size-3.5 text-primary" /> Test Alert Sound
            </Button>
            <Button size="sm" onClick={() => { setEditingItem(null); setModalOpen(true); }} className="gap-1.5 h-8 text-xs">
              <Plus className="size-3.5" /> Add Routine
            </Button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 mt-3 pt-2">
          {["all", "medication", "meal", "activity", "general"].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={cn(
                "px-2.5 py-1 text-xs rounded-md transition-colors capitalize",
                filter === cat
                  ? "bg-foreground text-background font-medium"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              )}
            >
              {cat === "all" ? "All Schedules" : cat === "general" ? "Routines" : `${cat}s`}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-5">
        {isLoading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Loading schedules...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 rounded-xl border border-dashed border-border bg-muted/20 text-center">
            <Pill className="size-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm font-medium">No routine schedules yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Add medications, meal times, and daily habits. The patient interface will play audio alerts and speak aloud to remind them.
            </p>
            <Button size="sm" variant="outline" className="mt-4 text-xs gap-1" onClick={() => { setEditingItem(null); setModalOpen(true); }}>
              <Plus className="size-3" /> Add first schedule
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item: RoutineItem) => {
              const meta = CATEGORY_META[item.category] ?? CATEGORY_META.general;
              const Icon = meta.icon;
              const isDone = wasCompletedToday(item.last_completed_at);

              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border transition-all gap-3",
                    !item.is_active
                      ? "opacity-60 bg-muted/30 border-border"
                      : isDone
                      ? "bg-emerald-500/5 border-emerald-500/20"
                      : "bg-card border-border hover:border-foreground/20"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", meta.bg, meta.text)}>
                      <Icon className="size-5" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-foreground px-2 py-0.5 rounded-md bg-muted flex items-center gap-1">
                          <Clock className="size-3 text-muted-foreground" />
                          {format12Hour(item.time)}
                        </span>
                        <h4 className="text-sm font-semibold text-foreground">{item.title}</h4>
                        {item.dosage && (
                          <Badge variant="secondary" className="text-[11px] font-normal py-0">
                            {item.dosage}
                          </Badge>
                        )}
                        {!item.is_active && (
                          <Badge variant="muted" className="text-[10px]">Paused</Badge>
                        )}
                      </div>

                      {item.instructions && (
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {item.instructions}
                        </p>
                      )}

                      <div className="flex items-center gap-2 mt-1.5 text-[11px]">
                        {isDone ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                            <CheckCircle2 className="size-3" /> Completed today
                            {item.last_completed_at && ` (${toUtcDate(item.last_completed_at)?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`}
                          </span>
                        ) : (
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Clock className="size-3" /> Pending today
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                    <Button
                      size="sm"
                      variant={isDone ? "outline" : "default"}
                      onClick={() => handleToggleComplete(item)}
                      title={isDone ? "Click to undo completion" : "Click to mark as taken today"}
                      className={cn(
                        "h-8 text-xs px-2.5 transition-colors",
                        isDone ? "text-emerald-600 hover:text-destructive hover:border-destructive/30" : ""
                      )}
                    >
                      {isDone ? (
                        <><Undo2 className="size-3.5 mr-1" /> Done <span className="text-[10px] opacity-60 ml-1">(Undo)</span></>
                      ) : (
                        <><CheckCircle2 className="size-3.5 mr-1" /> Mark Taken</>
                      )}
                    </Button>

                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleToggleActive(item)}
                      title={item.is_active ? "Pause reminder" : "Resume reminder"}
                      className="size-8 text-muted-foreground hover:text-foreground"
                    >
                      <Bell className={cn("size-3.5", item.is_active ? "text-foreground" : "text-muted-foreground opacity-40")} />
                    </Button>

                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => { setEditingItem(item); setModalOpen(true); }}
                      className="size-8 text-muted-foreground hover:text-foreground"
                    >
                      <span className="text-xs font-mono">Edit</span>
                    </Button>

                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(item.id)}
                      className="size-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {modalOpen && (
        <RoutineModal
          patientId={patientId}
          initialData={editingItem}
          onClose={() => { setModalOpen(false); setEditingItem(null); }}
        />
      )}
    </Card>
  );
}
