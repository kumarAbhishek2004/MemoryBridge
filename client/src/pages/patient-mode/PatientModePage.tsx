import { useRef, useState, useCallback, useEffect } from "react";
import {
  Brain, Camera, CameraOff, ScanFace, Loader2, CheckCircle2,
  AlertCircle, UserX, UserCheck, Zap, Mic, Square, MessageSquare,
  Clock, ChevronDown, ChevronUp, RefreshCw, Activity, History, Send,
  Bell, Heart,
} from "lucide-react";
import { useAppSelector } from "@/store/hooks";
import { selectPatientSession } from "@/store/selectors";
import { useMatchFaceMutation, useGetConversationsForPersonQuery, useSuggestIdentityMutation, useRecordLocationMutation } from "@/services";
import type { MatchFaceData } from "@/types";
import { useTranscription } from "@/hooks/useTranscription";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
// ─── Helpers ──────────────────────────────────────────────────────────────────
function toUtc(iso: string) {
  return iso.endsWith("Z") ? iso : iso + "Z";
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(toUtc(iso)).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDate(iso: string) {
  return new Date(toUtc(iso)).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const RELATION_COLORS: Record<string, string> = {
  son:      "bg-blue-500/15 text-blue-700",
  daughter: "bg-pink-500/15 text-pink-700",
  wife:     "bg-rose-500/15 text-rose-700",
  husband:  "bg-orange-500/15 text-orange-700",
  doctor:   "bg-emerald-500/15 text-emerald-700",
  nurse:    "bg-teal-500/15 text-teal-700",
  friend:   "bg-violet-500/15 text-violet-700",
};
const relColor = (rel: string | null) =>
  RELATION_COLORS[(rel ?? "").toLowerCase()] ?? "bg-muted text-muted-foreground";

// ─── Suggest identity form (shown when face is not recognised) ───────────────
// ─── Suggest identity form (shown when face is not recognised) ───────────────
function SuggestIdentityForm({
  unknownPersonId,
  patientId,
  onRetry,
  onContinue,
}: {
  unknownPersonId: number;
  patientId: number;
  onRetry: () => void;
  onContinue: () => void;
}) {
  const [name, setName]         = useState("");
  const [relation, setRelation] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [listeningField, setListeningField] = useState<"name" | "relation" | null>(null);
  const [suggestIdentity, { isLoading }] = useSuggestIdentityMutation();

  useEffect(() => {
    if ("speechSynthesis" in window) {
      const msg = new SpeechSynthesisUtterance("I don't recognize this face. Please ask the visitor to tell their name and relation, or type it manually on the screen.");
      msg.rate = 0.9;
      msg.onstart = () => setIsSpeaking(true);
      msg.onend = () => setIsSpeaking(false);
      msg.onerror = () => setIsSpeaking(false);
      
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(msg);

      return () => window.speechSynthesis.cancel();
    }
  }, []);

  const handleVoiceInput = (e: React.MouseEvent, field: "name" | "relation") => {
    e.preventDefault();
    if (listeningField === field) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      window.speechSynthesis.cancel();
      setListeningField(field);
    };

    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      if (field === "name") setName(transcript);
      else setRelation(transcript);
      setListeningField(null);
    };

    recognition.onerror = () => setListeningField(null);
    recognition.onend = () => setListeningField(null);
    try { recognition.start(); } catch (err) { setListeningField(null); }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !relation.trim()) return;
    await suggestIdentity({ personId: unknownPersonId, suggestedName: name.trim(), suggestedRelation: relation.trim(), patientId }).unwrap();
    setSubmitted(true);
  };

  if (submitted) return (
    <div className="flex flex-col items-center gap-3 py-10 text-center px-4">
      <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
        <CheckCircle2 className="size-6 text-primary" />
      </div>
      <p className="font-semibold text-lg tracking-tight">Suggestion sent</p>
      <p className="text-sm text-muted-foreground">Caregiver will verify and add this person.</p>
      <div className="flex gap-2 mt-4 w-full justify-center">
        <Button onClick={onContinue} className="w-full max-w-[140px]"><MessageSquare className="size-4 mr-2" /> Start</Button>
        <Button onClick={onRetry} variant="outline" className="w-full max-w-[140px]"><ScanFace className="size-4 mr-2" /> Scan again</Button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-5 py-6 px-5">
      <div className="flex flex-col items-center gap-2 text-center relative">
        <div className="flex size-14 items-center justify-center rounded-full bg-muted border border-border">
          <UserX className="size-6 text-muted-foreground" />
        </div>
        {isSpeaking && (
          <div className="absolute top-0 right-1/4 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
             <Mic className="size-3" />
          </div>
        )}
        <p className="font-semibold text-lg tracking-tight">Not recognized</p>
        <p className="text-sm text-muted-foreground">Please tell us who they are.</p>
      </div>
      
      <div className="space-y-3">
        <div className="relative">
          <Input 
            value={name} onChange={(e) => setName(e.target.value)} 
            placeholder="Their name (e.g. Rahul)" 
            className="pr-10" 
          />
          <Button 
            variant="ghost" size="icon"
            onClick={(e) => handleVoiceInput(e, "name")} 
            className={cn("absolute right-1 top-1/2 -translate-y-1/2 size-8", listeningField === "name" && "text-primary bg-primary/10 hover:bg-primary/20")}
          >
            <Mic className="size-4" />
          </Button>
        </div>
        <div className="relative">
          <Input 
            value={relation} onChange={(e) => setRelation(e.target.value)} 
            placeholder="Relation (e.g. son, doctor)" 
            className="pr-10" 
          />
          <Button 
            variant="ghost" size="icon"
            onClick={(e) => handleVoiceInput(e, "relation")} 
            className={cn("absolute right-1 top-1/2 -translate-y-1/2 size-8", listeningField === "relation" && "text-primary bg-primary/10 hover:bg-primary/20")}
          >
            <Mic className="size-4" />
          </Button>
        </div>
      </div>
      
      <div className="flex flex-col gap-2 mt-2">
        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={isLoading || !name.trim() || !relation.trim()} className="flex-1">
            {isLoading ? <Loader2 className="size-4 animate-spin mr-2" /> : <Send className="size-4 mr-2" />}
            Send for verification
          </Button>
          <Button onClick={onRetry} variant="outline" size="icon"><RefreshCw className="size-4" /></Button>
        </div>
        <Button onClick={onContinue} variant="secondary" className="w-full text-muted-foreground hover:text-foreground">
          Skip & start conversation
        </Button>
      </div>
    </div>
  );
}

// ─── Recognition result card ───────────────────────────────────────────────────
function RecognitionCard({
  result,
  patientId,
  onRetry,
  onContinue,
}: {
  result: { success: boolean; data?: MatchFaceData };
  patientId: number;
  onRetry: () => void;
  onContinue: () => void;
}) {
  const d = result.data;
  const noFace = !d || ("error" in d && d.error === "no_face_detected");
  const isRec  = d && "recognised" in d && d.recognised;

  if (noFace) return (
    <div className="flex flex-col items-center gap-4 py-8 text-center px-4">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted border border-border">
        <AlertCircle className="size-6 text-muted-foreground" />
      </div>
      <div>
        <p className="font-semibold text-lg tracking-tight">No face detected</p>
        <p className="text-sm text-muted-foreground mt-1">Ensure good lighting and face clearly visible.</p>
      </div>
      <Button onClick={onRetry} className="mt-4 w-full max-w-[200px]">
        <RefreshCw className="size-4 mr-2" /> Try again
      </Button>
    </div>
  );

  if (isRec && "name" in d) return (
    <div className="flex flex-col items-center gap-5 py-8 text-center px-4">
      <div className="relative">
        {d.image_url ? (
          <img src={d.image_url} alt={d.name} className="size-20 rounded-full object-cover ring-1 ring-border shadow-sm" />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-full bg-muted border border-border shadow-sm">
            <UserCheck className="size-8 text-muted-foreground" />
          </div>
        )}
        <div className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <CheckCircle2 className="size-3.5" />
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">Recognized Identity</p>
        <p className="text-2xl font-bold tracking-tight">{d.name}</p>
        <Badge variant="secondary" className="mt-2 capitalize">{d.relation}</Badge>
      </div>
      <div className="w-full max-w-[200px] mt-2">
        <div className="flex justify-between text-xs text-muted-foreground mb-1.5 font-medium">
          <span>Confidence Match</span>
          <span className="text-foreground">{Math.round(d.similarity * 100)}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${Math.round(d.similarity * 100)}%` }} />
        </div>
      </div>
      <Button onClick={onRetry} variant="outline" className="mt-4 w-full max-w-[200px]">
        <ScanFace className="size-4 mr-2" /> Scan again
      </Button>
    </div>
  );

  const unknownPersonId = d && "unknown_face_id" in d ? d.unknown_face_id : null;
  if (unknownPersonId) {
    return <SuggestIdentityForm unknownPersonId={unknownPersonId} patientId={patientId} onRetry={onRetry} onContinue={onContinue} />;
  }

  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center px-4">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted border border-border">
        <UserX className="size-6 text-muted-foreground" />
      </div>
      <div>
        <p className="font-semibold text-lg tracking-tight">Not recognized</p>
        <p className="text-sm text-muted-foreground mt-1">This face hasn't been registered.</p>
      </div>
      <Button onClick={onRetry} variant="outline" className="mt-4 w-full max-w-[200px]">
        <RefreshCw className="size-4 mr-2" /> Try again
      </Button>
    </div>
  );
}


// ─── Visitor Notification Card ────────────────────────────────────────────────
function VisitorNotificationCard({
  name, relation, imageUrl, onDismiss,
}: {
  name: string; relation: string; imageUrl?: string; onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <Card className="w-full max-w-sm animate-in fade-in zoom-in-95 shadow-lg border-border">
        <CardHeader className="text-center pt-8">
          <div className="mx-auto relative mb-4">
            {imageUrl ? (
              <img src={imageUrl} alt={name} className="size-24 rounded-full object-cover ring-1 ring-border shadow-sm" />
            ) : (
              <div className="flex size-24 items-center justify-center rounded-full bg-muted border border-border shadow-sm">
                <Heart className="size-10 text-muted-foreground" />
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
              <Bell className="size-4" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">{name}</CardTitle>
          <CardDescription className="text-sm mt-1">Someone is here to visit you</CardDescription>
          <div className="mt-3">
            <Badge variant="secondary" className="capitalize text-sm font-medium px-3 py-1">{relation}</Badge>
          </div>
        </CardHeader>
        <CardFooter className="pb-6">
          <Button onClick={onDismiss} className="w-full h-11" size="lg">
            Great, thank you!
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// ─── Past conversations panel (shown after recognition) ────────────────────────
function PersonHistoryPanel({ personId, personName }: { personId: number; personName: string }) {
  const { data, isLoading } = useGetConversationsForPersonQuery(personId);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showAll, setShowAll]       = useState(false);
  const convs = data?.data?.conversations ?? [];

  if (isLoading) return (
    <div className="flex items-center justify-center py-4">
      <Loader2 className="size-4 animate-spin text-muted-foreground" />
      <span className="ml-2 text-sm text-muted-foreground">Loading history...</span>
    </div>
  );

  if (data?.data?.history_restricted) return (
    <Card className="bg-muted/50 border-dashed border-border shadow-none">
      <CardContent className="p-4 text-center">
        <p className="text-sm text-muted-foreground">History is restricted. Focusing on today's visit.</p>
      </CardContent>
    </Card>
  );

  if (convs.length === 0) return (
    <Card className="bg-muted/50 border-dashed border-border shadow-none">
      <CardContent className="p-4 text-center">
        <p className="text-sm text-muted-foreground">No previous conversations with {personName}.</p>
      </CardContent>
    </Card>
  );

  const latestWithSummary = convs.find((c) => c.summary);
  const olderConvs = showAll ? convs.slice(1) : [];

  return (
    <div className="space-y-3">
      {latestWithSummary && (
        <Card className="bg-primary/5 border-primary/20 shadow-sm">
          <CardHeader className="p-4 pb-2 border-b border-primary/10 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <Brain className="size-4 text-primary" />
              <CardTitle className="text-xs font-semibold uppercase tracking-tight text-primary">Last visit</CardTitle>
            </div>
            <span className="text-xs text-muted-foreground font-medium">{timeAgo(latestWithSummary.started_at)}</span>
          </CardHeader>
          <CardContent className="p-4 pt-3">
            <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">{latestWithSummary.summary}</p>
          </CardContent>
        </Card>
      )}

      {convs.length > 1 && (
        <>
          <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)} className="w-full text-muted-foreground">
            <History className="size-4 mr-2" />
            {showAll ? "Hide" : "Show"} {convs.length - 1} older conversation{convs.length - 1 !== 1 ? "s" : ""}
            {showAll ? <ChevronUp className="size-4 ml-auto" /> : <ChevronDown className="size-4 ml-auto" />}
          </Button>

          {showAll && olderConvs.map((conv) => {
            const isOpen = expandedId === conv.id;
            return (
              <Card key={conv.id} className="overflow-hidden shadow-sm">
                <Button variant="ghost" onClick={() => setExpandedId(isOpen ? null : conv.id)} className="w-full h-auto px-4 py-3 flex items-center justify-between rounded-none hover:bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Clock className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{formatDate(conv.started_at)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {conv.summary && <Badge variant="outline" className="text-[10px]">Summary</Badge>}
                    {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </div>
                </Button>
                {isOpen && (
                  <CardContent className="p-4 border-t border-border space-y-4 bg-muted/20">
                    {conv.summary && (
                      <div className="rounded-lg bg-background border border-border p-3">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">AI Summary</p>
                        <p className="text-sm leading-relaxed">{conv.summary}</p>
                      </div>
                    )}
                    {conv.transcripts.length > 0 && (
                      <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                        <p className="text-xs font-semibold text-muted-foreground">Transcript</p>
                        {conv.transcripts.map((t) => (
                          <div key={t.id} className="text-sm text-muted-foreground leading-relaxed border-l-2 border-border pl-3 py-1">
                            {t.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}

// ─── Face camera panel ─────────────────────────────────────────────────────────
function CameraPanel({
  patientId,
  onRecognised,
  onContinueAsUnknown,
}: {
  patientId: number;
  onRecognised: (personId: number | null, personName: string, isFamily: boolean, relation: string, imageUrl?: string) => void;
  onContinueAsUnknown: () => void;
}) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [camActive, setCamActive] = useState(false);
  const [camError,  setCamError]  = useState<string | null>(null);
  const [scanning,  setScanning]  = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [result,    setResult]    = useState<{ success: boolean; data?: MatchFaceData } | null>(null);

  const [matchFace] = useMatchFaceMutation();

  const startCam = useCallback(async () => {
    setCamError(null);
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      setCamActive(true);
    } catch {
      setCamError("Camera access denied. Please allow camera permissions.");
    }
  }, []);

  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamActive(false);
    setCountdown(null);
  }, []);

  useEffect(() => () => stopCam(), [stopCam]);

  const capture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current, c = canvasRef.current;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.92));
    if (!blob) return;

    setScanning(true);
    try {
      const res = await matchFace({ patientId, file: new File([blob], "cap.jpg", { type: "image/jpeg" }) }).unwrap();
      const r = res as { success: boolean; data?: MatchFaceData };
      setResult(r);
      if (r.data && "recognised" in r.data && r.data.recognised) {
        onRecognised(r.data.person_id, r.data.name, r.data.is_family, r.data.relation, r.data.image_url);
      } else {
        onRecognised(null, "", false, "");
      }
    } catch {
      setResult({ success: false, data: { recognised: false } });
      onRecognised(null, "", false, "");
    } finally {
      setScanning(false);
      setCountdown(null);
    }
  }, [patientId, matchFace, onRecognised]);

  const startCountdown = useCallback(() => {
    let c = 3;
    setCountdown(c);
    const iv = setInterval(() => {
      c--;
      if (c === 0) { clearInterval(iv); setCountdown(null); capture(); }
      else setCountdown(c);
    }, 1000);
  }, [capture]);

  return (
    <div className="flex flex-col h-full space-y-4">
      <Card className="flex-1 overflow-hidden relative min-h-[300px] flex flex-col items-center justify-center bg-black rounded-lg border-0 shadow-none">
        <video
          ref={videoRef}
          className={cn("h-full w-full object-cover transition-opacity", !camActive && "opacity-0")}
          playsInline muted
        />
        <canvas ref={canvasRef} className="hidden" />

        {!camActive && !result && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-full bg-white/10">
              <CameraOff className="size-6 text-white/50" />
            </div>
            <p className="text-sm font-medium text-white/40">Camera is off</p>
          </div>
        )}

        {camActive && !scanning && countdown === null && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative w-48 h-56">
              {(["tl","tr","bl","br"] as const).map((p) => (
                <div key={p} className={cn("absolute size-6 border-white/70",
                  p === "tl" && "top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-lg",
                  p === "tr" && "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-lg",
                  p === "bl" && "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-lg",
                  p === "br" && "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-lg",
                )} />
              ))}
            </div>
          </div>
        )}

        {camActive && (
          <div className="absolute top-4 left-4 flex items-center gap-2 rounded-md bg-black/60 backdrop-blur-md px-3 py-1.5 shadow-sm">
            <span className="size-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-semibold text-white tracking-widest uppercase">Live</span>
          </div>
        )}

        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex size-24 items-center justify-center rounded-full bg-black/60 backdrop-blur-md shadow-2xl">
              <span className="text-5xl font-bold text-white tabular-nums">{countdown}</span>
            </div>
          </div>
        )}

        {scanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm">
            <Loader2 className="size-10 text-white animate-spin" />
            <p className="text-sm font-semibold text-white tracking-wide uppercase">Analyzing Face...</p>
          </div>
        )}

        {result && (
          <div className="absolute inset-0 bg-background overflow-y-auto">
            <RecognitionCard result={result} patientId={patientId} onRetry={() => { setResult(null); }} onContinue={onContinueAsUnknown} />
          </div>
        )}
      </Card>

      <div className="space-y-3">
        {camError && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" /> {camError}
          </div>
        )}
        {!result && (
          <div className="flex gap-3">
            {!camActive ? (
              <Button onClick={startCam} className="flex-1 h-12 text-sm font-semibold">
                <Camera className="size-4 mr-2" /> Turn on camera
              </Button>
            ) : (
              <>
                <Button onClick={startCountdown} disabled={scanning || countdown !== null} className="flex-1 h-12 text-sm font-semibold">
                  {scanning ? <><Loader2 className="size-4 animate-spin mr-2" /> Scanning...</>
                    : countdown !== null ? <><Zap className="size-4 mr-2" /> {countdown}...</>
                    : <><ScanFace className="size-4 mr-2" /> Scan Face</>}
                </Button>
                <Button onClick={stopCam} disabled={scanning} variant="outline" size="icon" className="h-12 w-12">
                  <CameraOff className="size-4" />
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Live transcription panel ──────────────────────────────────────────────────
function TranscriptionPanel({
  patientId,
  patientName,
  personId,
  autoStart,
}: {
  patientId:   number;
  patientName: string;
  personId:    number | null;
  autoStart:   boolean;
}) {
  const { isRecording, transcripts, summary, error, startRecording, stopRecording } =
    useTranscription(patientId, patientName, personId, { autoStart });

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className={cn("rounded-xl overflow-hidden transition-all shadow-sm bg-card ring-1 ring-foreground/10", isRecording ? "border-primary ring-1 ring-primary/20" : "")}>
        <div className="p-4 pb-3 flex flex-row items-center justify-between border-b border-border/50">
          <div className="flex items-center gap-2 mb-0">
            <Brain className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold tracking-tight m-0">Live Summary</h3>
          </div>
          {isRecording && (
            <div className="flex items-center gap-2 mb-0">
               <span className="size-2 rounded-full bg-primary animate-pulse" />
               <span className="text-xs font-semibold text-primary">Processing</span>
            </div>
          )}
        </div>
        <div className="p-4 min-h-[80px]">
          {summary ? (
            <div className="text-sm leading-relaxed text-foreground whitespace-pre-line">{summary}</div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              {isRecording ? "Listening and generating summary..." : "Start recording to get an AI summary."}
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden shadow-sm bg-card ring-1 ring-foreground/10 rounded-xl">
        <div className="px-4 py-3 border-b border-border/50 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2 m-0 mt-0">
            <MessageSquare className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold tracking-tight m-0">Live Transcript</h3>
          </div>
          <div className="flex items-center gap-3 m-0 mt-0">
            {autoStart && !isRecording && !error && (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Starting...
              </span>
            )}
            <Button
              size="sm"
              variant={isRecording ? "destructive" : "default"}
              onClick={isRecording ? stopRecording : () => startRecording()}
              className="h-8 text-xs px-3 cursor-pointer"
            >
              {isRecording ? <><Square className="size-3 mr-2" fill="currentColor" /> Stop</> : <><Mic className="size-3 mr-2" fill="currentColor" /> Start</>}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[120px]">
          {transcripts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-8 text-center">
              <Activity className="size-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {isRecording ? "Listening..." : "Press Start to begin transcription."}
              </p>
            </div>
          ) : (
            transcripts.map((line) => (
              <div key={line.id} className="text-sm leading-relaxed border-l-2 border-primary/30 pl-3 py-1">
                {line.text}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {error && (
          <div className="p-4 pt-0">
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" /> {error}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Patient home page ─────────────────────────────────────────────────────────
export default function PatientModePage() {
  const session = useAppSelector(selectPatientSession);
  const [recognisedPersonId,   setRecognisedPersonId]   = useState<number | null>(null);
  const [recognisedPersonName, setRecognisedPersonName] = useState<string>("");
  const [allowUnknownConversation, setAllowUnknownConversation] = useState(false);
  const [visitorNotification,  setVisitorNotification]  = useState<{ name: string; relation: string; imageUrl?: string } | null>(null);
  const [recordLocation] = useRecordLocationMutation();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  useEffect(() => {
    if ("speechSynthesis" in window) {
      const msg = new SpeechSynthesisUtterance("First, perform face verification to start the conversation.");
      msg.rate = 0.9;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(msg);
      return () => window.speechSynthesis.cancel();
    }
  }, []);

  useEffect(() => {
    if (!session?.patientId) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        recordLocation({
          patient_id: session.patientId,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      (error) => console.error("Location tracking error: ", error),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [session?.patientId, recordLocation]);

  if (!session) return null;

  const handleRecognised = useCallback((pid: number | null, name: string, isFamily: boolean, relation: string, imageUrl?: string) => {
    setRecognisedPersonId(pid);
    setRecognisedPersonName(name);
    setAllowUnknownConversation(false);
    if (pid && isFamily && name) {
      setVisitorNotification({ name, relation, imageUrl });
    }
  }, []);

  const handleContinueAsUnknown = useCallback(() => {
    setAllowUnknownConversation(true);
  }, []);

  return (
    <div className="h-full flex flex-col bg-background text-foreground">
      {/* ── Top greeting bar ── */}
      <header className="px-8 py-5 border-b border-border bg-card shrink-0 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Brain className="size-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium mb-0.5">{greeting}</p>
            <h1 className="text-2xl font-bold tracking-tight leading-none">{session.patientName}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-secondary border border-border shadow-sm">
          <span className="size-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-secondary-foreground">System Active</span>
        </div>
      </header>

      {/* ── Visitor notification overlay ── */}
      {visitorNotification && (
        <VisitorNotificationCard
          name={visitorNotification.name}
          relation={visitorNotification.relation || "family"}
          imageUrl={visitorNotification.imageUrl}
          onDismiss={() => setVisitorNotification(null)}
        />
      )}

      {/* ── Main split layout ── */}
      <div className="flex-1 overflow-hidden p-6 lg:p-8">
        <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* ── LEFT: Conversation panel ── */}
          <section className="flex flex-col overflow-hidden gap-5 bg-card border border-border rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 shrink-0 border-b border-border pb-4">
              <MessageSquare className="size-5 text-primary" />
              <h2 className="text-lg font-bold tracking-tight">Active Conversation</h2>
            </div>

            {recognisedPersonId || allowUnknownConversation ? (
              <div className="flex-1 min-h-0 flex flex-col gap-6 overflow-y-auto pr-2">
                {recognisedPersonId && (
                  <div className="shrink-0">
                    <PersonHistoryPanel personId={recognisedPersonId} personName={recognisedPersonName} />
                  </div>
                )}
                <div className="flex-1 min-h-0 flex flex-col">
                  <TranscriptionPanel
                    patientId={session.patientId}
                    patientName={session.patientName}
                    personId={recognisedPersonId}
                    autoStart={true}
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center py-10">
                <div className="flex size-16 items-center justify-center rounded-full bg-muted border border-border shadow-sm">
                  <MessageSquare className="size-8 text-muted-foreground/50" />
                </div>
                <div>
                  <p className="text-lg font-semibold tracking-tight">Awaiting Recognition</p>
                  <p className="text-sm text-muted-foreground mt-2 max-w-[250px] mx-auto">Scan a face on the right to start recording the conversation context.</p>
                </div>
              </div>
            )}
          </section>

          {/* ── RIGHT: Face recognition camera ── */}
          <section className="flex flex-col overflow-hidden gap-5 bg-card border border-border rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 shrink-0 border-b border-border pb-4">
              <ScanFace className="size-5 text-primary" />
              <h2 className="text-lg font-bold tracking-tight">Identity Verification</h2>
            </div>
            <div className="flex-1 min-h-0">
              <CameraPanel
                patientId={session.patientId}
                onRecognised={handleRecognised}
                onContinueAsUnknown={handleContinueAsUnknown}
              />
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
