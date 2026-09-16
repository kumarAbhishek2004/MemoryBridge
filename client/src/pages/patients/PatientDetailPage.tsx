import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft, Plus, User2, Camera, Loader2, AlertCircle,
  Trash2, Pencil, CheckCircle2, UserCheck, UserX, ScanFace,
  MonitorSmartphone, ShieldCheck, ShieldX, Clock,
  Heart, MessageSquare, Brain, ChevronDown, ChevronUp, History,
} from "lucide-react";
import {
  useGetPatientQuery,
  useGetPersonsQuery,
  useDeletePersonMutation,
  useUpdatePersonMutation,
  useStoreKnownFaceMutation,
  useStartPatientSessionMutation,
  useGetConversationsQuery,
  useLazyGetFaceJobStatusQuery,
  useUpdatePatientMutation,
} from "@/services";
import type { Person } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { cn } from "@/lib/utils";
import { PatientTrackingMap } from "./PatientTrackingMap";

// ─── Schemas ──────────────────────────────────────────────────────────────────
const addFaceSchema = z.object({
  name:     z.string().min(2, "Name required"),
  relation: z.string().min(1, "Relation required"),
});
type AddFaceForm = z.infer<typeof addFaceSchema>;

const labelSchema = z.object({
  name:     z.string().min(2, "Name required"),
  relation: z.string().min(1, "Relation required"),
});
type LabelForm = z.infer<typeof labelSchema>;

// ─── Add Known Face Modal ─────────────────────────────────────────────────────
function AddFaceModal({
  patientId,
  onClose,
}: {
  patientId: number;
  onClose: () => void;
}) {
  const [storeKnownFace, { isLoading: isStoring }] = useStoreKnownFaceMutation();
  const [getJobStatus] = useLazyGetFaceJobStatusQuery();
  const [isPolling, setIsPolling] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile]       = useState<File | null>(null);
  const [fileError, setFileError] = useState("");

  const { register, handleSubmit, formState: { errors } } = useForm<AddFaceForm>({
    resolver: zodResolver(addFaceSchema),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) { setFileError("Please upload an image file."); return; }
    setFileError("");
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const onSubmit = async (data: AddFaceForm) => {
    if (!file) { setFileError("Please select a photo."); return; }
    try {
      const result = await storeKnownFace({ patientId, name: data.name, relation: data.relation, file }).unwrap();
      const personId = result.data?.person_id;
      if (!personId) {
        onClose();
        return;
      }

      setIsPolling(true);
      
      // Poll every 2 seconds
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await getJobStatus(personId, false).unwrap();
          const state = statusRes.data?.status;
          
          if (state === "completed") {
            clearInterval(pollInterval);
            setIsPolling(false);
            onClose();
          } else if (state === "error") {
            clearInterval(pollInterval);
            setIsPolling(false);
            setFileError(statusRes.data?.error || "Failed to extract face embedding.");
          }
        } catch (pollErr) {
          clearInterval(pollInterval);
          setIsPolling(false);
          setFileError("Error checking job status.");
        }
      }, 2000);

    } catch (err: unknown) {
      const msg = (err as { data?: { message?: string } })?.data?.message;
      setFileError(msg ?? "Failed to register face. Ensure the photo shows a clear face.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">Register known person</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Upload a clear photo. The face will be encoded and stored.
          </p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-4 space-y-4">
          {/* Photo upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Photo <span className="text-destructive">*</span>
            </label>
            <label
              htmlFor="face-file"
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 transition-colors",
                preview ? "border-foreground/30" : "border-border hover:border-foreground/30"
              )}
            >
              {preview ? (
                <img
                  src={preview}
                  alt="Preview"
                  className="h-32 w-32 rounded-full object-cover ring-2 ring-border"
                />
              ) : (
                <>
                  <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                    <Camera className="size-5 text-muted-foreground" />
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Click to upload photo
                  </span>
                </>
              )}
              <input
                id="face-file"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleFile}
              />
            </label>
            {fileError && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="size-3.5 shrink-0" /> {fileError}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Full name" error={errors.name?.message} htmlFor="f-name" required>
              <Input id="f-name" placeholder="Rahul Singh" {...register("name")} />
            </FormField>
            <FormField label="Relation" error={errors.relation?.message} htmlFor="f-relation" required>
              <Input id="f-relation" placeholder="Son" {...register("relation")} />
            </FormField>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={isStoring || isPolling}>
              {(isStoring || isPolling) ? <><Loader2 className="animate-spin" /> Registering…</> : "Register face"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Label Unknown Modal ──────────────────────────────────────────────────────
function LabelUnknownModal({
  patientId,
  person,
  onClose,
}: {
  patientId: number;
  person: Person;
  onClose: () => void;
}) {
  const [updatePerson, { isLoading }] = useUpdatePersonMutation();
  const { register, handleSubmit, formState: { errors } } = useForm<LabelForm>({
    resolver: zodResolver(labelSchema),
    defaultValues: { name: person.name ?? "", relation: person.relation ?? "" },
  });

  const onSubmit = async (data: LabelForm) => {
    await updatePerson({
      patientId,
      personId: person.id,
      payload: { name: data.name, relation: data.relation, is_known: true },
    }).unwrap();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-card shadow-2xl">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">Label unknown person</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Mark this unknown face as a known person.
          </p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-4 space-y-3">
          {person.image_url ? (
            <div className="flex justify-center pb-2">
              <img 
                src={person.image_url} 
                alt="Unknown face" 
                className="size-24 rounded-full object-cover ring-2 ring-border shadow-sm" 
              />
            </div>
          ) : (
            <div className="flex justify-center pb-2">
              <div className="flex size-24 items-center justify-center rounded-full bg-amber-500/10 ring-2 ring-border shadow-sm">
                <UserX className="size-8 text-amber-600" />
              </div>
            </div>
          )}
          <FormField label="Full name" error={errors.name?.message} htmlFor="l-name" required>
            <Input id="l-name" placeholder="Rahul Singh" {...register("name")} />
          </FormField>
          <FormField label="Relation" error={errors.relation?.message} htmlFor="l-relation" required>
            <Input id="l-relation" placeholder="Son" {...register("relation")} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={isLoading}>
              {isLoading ? <><Loader2 className="animate-spin" /> Saving…</> : "Save"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Pending Verification Card ───────────────────────────────────────────────
function PendingVerificationCard({
  person,
  patientId,
}: {
  person: Person;
  patientId: number;
}) {
  const [updatePerson, { isLoading: approving }] = useUpdatePersonMutation();
  const [deletePerson, { isLoading: rejecting }] = useDeletePersonMutation();
  const [confirmReject, setConfirmReject] = useState(false);

  const handleApprove = async () => {
    await updatePerson({
      patientId,
      personId: person.id,
      payload: {
        name: person.suggested_name!,
        relation: person.suggested_relation!,
        is_known: true,
        pending_verification: false,
        suggested_name: null,
        suggested_relation: null,
      },
    }).unwrap();
  };

  const handleReject = async () => {
    if (!confirmReject) { setConfirmReject(true); return; }
    await deletePerson({ patientId, personId: person.id }).unwrap();
  };

  return (
    <div className="rounded-lg border border-amber-400/40 bg-amber-50/50 dark:bg-amber-500/5 px-4 py-3 flex items-center gap-3">
      {person.image_url ? (
        <img 
          src={person.image_url} 
          alt={person.suggested_name ?? "Unknown"} 
          className="size-9 shrink-0 rounded-full object-cover ring-1 ring-border" 
        />
      ) : (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
          <Clock className="size-4 text-amber-600" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {person.suggested_name}
          <span className="ml-2 text-xs font-normal text-muted-foreground capitalize">({person.suggested_relation})</span>
        </p>
        <p className="text-xs text-muted-foreground">Suggested by patient · awaiting your verification</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={handleApprove}
          disabled={approving || rejecting}
          className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-40"
        >
          {approving ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
          Approve
        </button>
        <button
          onClick={handleReject}
          disabled={approving || rejecting}
          className={cn(
            "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40",
            confirmReject
              ? "bg-red-500 text-white hover:bg-red-600"
              : "border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40"
          )}
        >
          {rejecting ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldX className="size-3.5" />}
          {confirmReject ? "Confirm" : "Reject"}
        </button>
      </div>
    </div>
  );
}

// ─── Family Email Modal ────────────────────────────────────────────────────────
function FamilyEmailModal({
  person,
  patientId,
  onClose,
}: {
  person: Person;
  patientId: number;
  onClose: () => void;
}) {
  const [updatePerson, { isLoading }] = useUpdatePersonMutation();
  const [email, setEmail] = useState(person.family_member_email ?? "");
  const [error, setError] = useState("");

  const validate = (val: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? "" : "Enter a valid email address";

  const handleSave = async () => {
    const err = validate(email);
    if (err) { setError(err); return; }
    await updatePerson({
      patientId,
      personId: person.id,
      payload: { is_family: true, family_member_email: email },
    }).unwrap();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-gradient-to-br from-rose-500/15 to-pink-500/10 px-6 pt-6 pb-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-rose-500/15">
              <Heart className="size-4 text-rose-600" />
            </div>
            <div>
              <p className="font-semibold text-sm">Mark as Family Member</p>
              <p className="text-xs text-muted-foreground">
                We'll email them whenever {person.name ?? "this person"} visits.
              </p>
            </div>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Family Member's Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              placeholder="rahul@gmail.com"
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 transition-colors"
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            A notification email will be sent to this address every time{" "}
            <strong>{person.name ?? "this person"}</strong> is recognised visiting the patient.
          </p>
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-border py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="flex-1 rounded-xl bg-rose-500 text-white py-2 text-sm font-semibold hover:bg-rose-600 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Heart className="size-4" />}
              Save & Notify
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Person Row ────────────────────────────────────────────────────────────────
function PersonRow({
  person,
  patientId,
}: {
  person: Person;
  patientId: number;
}) {
  const [deletePerson, { isLoading: deleting }] = useDeletePersonMutation();
  const [updatePerson, { isLoading: removing }] = useUpdatePersonMutation();
  const [showLabel, setShowLabel] = useState(false);
  const [showFamilyModal, setShowFamilyModal] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const handleDelete = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    await deletePerson({ patientId, personId: person.id }).unwrap();
  };

  const handleRemoveFamily = async () => {
    await updatePerson({
      patientId,
      personId: person.id,
      payload: { is_family: false, family_member_email: null },
    }).unwrap();
  };

  return (
    <>
      <div className="group flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-foreground/20">
        <div className="flex items-center gap-3 min-w-0">
          {person.image_url ? (
            <img
              src={person.image_url}
              alt={person.name ?? "Unknown person"}
              className="size-9 shrink-0 rounded-full object-cover ring-1 ring-border"
            />
          ) : (
            <div className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              person.is_known ? "bg-foreground/10" : "bg-amber-500/10"
            )}>
              {person.is_known
                ? <UserCheck className="size-4 text-foreground" />
                : <UserX className="size-4 text-amber-600" />
              }
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium truncate">
                {person.is_known
                  ? (person.name ?? "—")
                  : <span className="text-amber-600 italic">Unknown person</span>
                }
              </p>
              {person.is_family && (
                <span className="flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-600">
                  <Heart className="size-2.5" /> Family
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {person.relation && (
                <p className="text-xs text-muted-foreground capitalize">{person.relation}</p>
              )}
              {person.is_family && person.family_member_email && (
                <p className="text-xs text-muted-foreground/70 truncate max-w-[180px]">
                  ✉ {person.family_member_email}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {person.is_known && !person.is_family && (
            <button
              onClick={() => setShowFamilyModal(true)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-rose-600 transition-colors"
              title="Mark as family member"
            >
              <Heart className="size-3.5" /> Add Family
            </button>
          )}
          {person.is_known && person.is_family && (
            <button
              onClick={handleRemoveFamily}
              disabled={removing}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 transition-colors"
              title="Remove from family"
            >
              {removing ? <Loader2 className="size-3.5 animate-spin" /> : <Heart className="size-3.5" />}
              Family
            </button>
          )}
          {!person.is_known && (
            <button
              onClick={() => setShowLabel(true)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-amber-600 hover:bg-amber-500/10 transition-colors"
              title="Label this person"
            >
              <Pencil className="size-3.5" /> Label
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className={cn(
              "rounded-md p-1.5 transition-colors",
              confirmDel
                ? "bg-red-500/10 text-red-600 hover:bg-red-500/20"
                : "text-muted-foreground hover:bg-muted hover:text-destructive"
            )}
            title={confirmDel ? "Click again to confirm" : "Delete"}
          >
            {deleting
              ? <Loader2 className="size-4 animate-spin" />
              : <Trash2 className="size-4" />
            }
          </button>
        </div>
      </div>

      {showFamilyModal && (
        <FamilyEmailModal
          person={person}
          patientId={patientId}
          onClose={() => setShowFamilyModal(false)}
        />
      )}
      {showLabel && (
        <LabelUnknownModal
          patientId={patientId}
          person={person}
          onClose={() => setShowLabel(false)}
        />
      )}
    </>
  );
}


// ─── Conversations Section (caregiver view) ───────────────────────────────────
function toUtc(iso: string) { return iso.endsWith("Z") ? iso : iso + "Z"; }
function formatDate(iso: string) {
  return new Date(toUtc(iso)).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function ConversationsSection({ patientId }: { patientId: number }) {
  const { data, isLoading } = useGetConversationsQuery(patientId);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const conversations = data?.data ?? [];

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <History className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Conversation History</h2>
        <span className="ml-1 text-muted-foreground font-normal text-xs">({conversations.length})</span>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : conversations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
          <MessageSquare className="size-6 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No conversations recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map((conv) => {
            const isOpen = expandedId === conv.id;
            const person = conv.person;
            return (
              <div key={conv.id} className="rounded-lg border border-border bg-card overflow-hidden">
                <button
                  onClick={() => setExpandedId(isOpen ? null : conv.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {person?.name ? (
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground/10">
                        <span className="text-xs font-bold">{person.name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase()}</span>
                      </div>
                    ) : (
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                        <User2 className="size-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{person?.name ?? "Unknown person"}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(conv.started_at)} · {conv.transcripts.length} lines</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {conv.summary && <span className="text-[10px] font-medium bg-emerald-500/10 text-emerald-700 px-2 py-0.5 rounded-full">Summary</span>}
                    {isOpen ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-border space-y-3 pt-3">
                    {conv.summary && (
                      <div className="rounded-lg bg-foreground/5 border border-border p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                          <Brain className="size-3" /> AI Summary
                        </p>
                        <p className="text-sm leading-relaxed whitespace-pre-line">{conv.summary}</p>
                      </div>
                    )}
                    {conv.transcripts.length > 0 && (
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Transcript</p>
                        {conv.transcripts.map((t) => (
                          <p key={t.id} className="text-xs text-muted-foreground border-l-2 border-border pl-2 py-0.5">{t.text}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── Patient Detail Page ──────────────────────────────────────────────────────
export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const patientId = Number(id);
  const navigate = useNavigate();

  const { data: patientData, isLoading: loadingPatient } = useGetPatientQuery(patientId);
  const { data: personsData, isLoading: loadingPersons } = useGetPersonsQuery(patientId);
  const [showAddFace, setShowAddFace] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // ── Patient session ────────────────────────────────────────────────────────
  const [startPatientSession, { isLoading: startingSession }] =
    useStartPatientSessionMutation();
  const [updatePatient, { isLoading: updatingPatient }] = useUpdatePatientMutation();

  const handleSwitchToPatient = async () => {
    setSessionError(null);
    try {
      await startPatientSession(patientId).unwrap();
      // Listener in store.ts dispatches sessionOpened → Redux updated.
      // Navigate to the patient mode screen.
      navigate("/patient-mode");
    } catch (err: unknown) {
      const msg = (err as { data?: { message?: string } })?.data?.message;
      setSessionError(msg ?? "Failed to start patient session. Please try again.");
    }
  };

  const patient = patientData?.data;
  const persons  = personsData?.data ?? [];
  const pending  = persons.filter((p) => p.pending_verification);
  const known    = persons.filter((p) => p.is_known && !p.pending_verification);
  const unknown  = persons.filter((p) => !p.is_known && !p.pending_verification);

  if (loadingPatient) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <AlertCircle className="size-8 text-muted-foreground" />
        <p className="text-muted-foreground">Patient not found.</p>
        <Button variant="ghost" size="sm" onClick={() => navigate("/patients")}>
          <ArrowLeft className="size-4" /> Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/patients" className="hover:text-foreground transition-colors">Patients</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{patient.name}</span>
      </div>

      {/* Session error banner */}
      {sessionError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {sessionError}
        </div>
      )}

      {/* Patient header */}
      <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-full bg-foreground text-background">
            <User2 className="size-7" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{patient.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
              {patient.age && <span>{patient.age} years old</span>}
              {patient.diagnosis_level && (
                <span className="capitalize font-medium text-foreground">
                  {patient.diagnosis_level} dementia
                </span>
              )}
            </div>
            {patient.diagnosis_level === "moderate" && (
              <div className="mt-3 flex items-center gap-2 text-sm bg-muted/50 p-2 rounded-md border border-border">
                <input 
                  type="checkbox"
                  id="toggle-history"
                  className="size-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                  checked={patient.show_history_on_moderate}
                  disabled={updatingPatient}
                  onChange={async (e) => {
                    await updatePatient({ 
                      id: patient.id, 
                      payload: { show_history_on_moderate: e.target.checked }
                    });
                  }}
                />
                <label htmlFor="toggle-history" className="text-muted-foreground font-medium cursor-pointer select-none">
                  Show history in Patient Mode
                </label>
                {updatingPatient && <Loader2 className="size-3 animate-spin text-muted-foreground ml-1" />}
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
          {/* Primary: Switch to patient mode */}
          <Button
            size="sm"
            onClick={handleSwitchToPatient}
            disabled={startingSession}
            className="gap-1.5"
          >
            {startingSession
              ? <><Loader2 className="size-4 animate-spin" /> Starting…</>
              : <><MonitorSmartphone className="size-4" /> Switch to patient</>
            }
          </Button>

          {/* Secondary actions */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`/recognition/${patientId}`)}
          >
            <ScanFace className="size-4" /> Run recognition
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowAddFace(true)}>
            <Plus className="size-4" /> Add face
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-2xl font-semibold">{persons.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Total persons</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-2xl font-semibold text-emerald-600">{known.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Known faces</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-2xl font-semibold text-amber-600">{unknown.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Unknown faces</p>
        </div>
      </div>

      {loadingPersons ? (
        <div className="flex justify-center py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Pending verifications */}
          {pending.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-2">
                <Clock className="size-4 text-amber-500" /> Pending verification
                <span className="ml-1 text-muted-foreground font-normal">({pending.length})</span>
              </h2>
              <div className="grid gap-2">
                {pending.map((p) => (
                  <PendingVerificationCard key={p.id} person={p} patientId={patientId} />
                ))}
              </div>
            </section>
          )}

          {/* Known persons */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <UserCheck className="size-4 text-emerald-600" /> Known persons
                <span className="ml-1 text-muted-foreground font-normal">({known.length})</span>
              </h2>
            </div>
            {known.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
                <p className="text-sm text-muted-foreground">No known persons registered yet.</p>
                <button
                  onClick={() => setShowAddFace(true)}
                  className="mt-2 text-sm font-medium underline underline-offset-4 hover:opacity-70 transition-opacity"
                >
                  Add a face
                </button>
              </div>
            ) : (
              <div className="grid gap-2">
                {known.map((p) => (
                  <PersonRow key={p.id} person={p} patientId={patientId} />
                ))}
              </div>
            )}
          </section>

          {/* Unknown faces */}
          {unknown.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-2">
                <UserX className="size-4 text-amber-600" /> Unknown faces
                <span className="ml-1 text-muted-foreground font-normal">({unknown.length})</span>
              </h2>
              <div className="grid gap-2">
                {unknown.map((p) => (
                  <PersonRow key={p.id} person={p} patientId={patientId} />
                ))}
              </div>
            </section>
          )}

          {persons.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
              <CheckCircle2 className="size-8 text-muted-foreground" />
              <div>
                <p className="font-medium">No faces registered</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Register known people so the system can recognise them.
                </p>
              </div>
              <Button size="sm" onClick={() => setShowAddFace(true)}>
                <Plus className="size-4" /> Add first face
              </Button>
            </div>
          )}

          {/* Tracking Map Section */}
          <section>
            <PatientTrackingMap patientId={patientId} />
          </section>

          {/* Conversations Section */}
          <ConversationsSection patientId={patientId} />
        </div>
      )}

      {showAddFace && (
        <AddFaceModal patientId={patientId} onClose={() => setShowAddFace(false)} />
      )}
    </div>
  );
}
