import { useRef, useState, useCallback, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Camera, CameraOff, ScanFace, Loader2, CheckCircle2,
  AlertCircle, UserX, ArrowLeft, RefreshCw, UserCheck, Zap,
} from "lucide-react";
import { useGetPatientQuery, useMatchFaceMutation } from "@/services";
import type { MatchFaceData } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Match result UI ──────────────────────────────────────────────────────────
function MatchResult({
  result,
  onRetry,
}: {
  result: { success: boolean; message: string; data?: MatchFaceData };
  onRetry: () => void;
}) {
  const data = result.data;

  // No face detected
  if (!data || ("error" in data && data.error === "no_face_detected")) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-6 py-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-amber-500/10">
          <AlertCircle className="size-7 text-amber-600" />
        </div>
        <div>
          <p className="font-semibold text-foreground">No face detected</p>
          <p className="text-sm text-muted-foreground mt-1">
            Make sure the face is clearly visible, well-lit, and centred in the frame.
          </p>
        </div>
        <Button size="sm" onClick={onRetry}>
          <RefreshCw className="size-4" /> Try again
        </Button>
      </div>
    );
  }

  // Recognised
  if ("recognised" in data && data.recognised) {
    const similarity = Math.round(data.similarity * 100);
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-6 py-8 text-center">
        <div className="relative">
          {data.image_url ? (
            <img src={data.image_url} alt={data.name} className="size-16 rounded-full object-cover ring-2 ring-emerald-500/20" />
          ) : (
            <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/10">
              <UserCheck className="size-8 text-emerald-600" />
            </div>
          )}
          <div className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-emerald-500">
            <CheckCircle2 className="size-3.5 text-white" />
          </div>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-emerald-600 mb-1">
            Recognised
          </p>
          <p className="text-2xl font-semibold text-foreground">{data.name}</p>
          <p className="text-sm text-muted-foreground capitalize mt-0.5">{data.relation}</p>
        </div>
        <div className="w-full max-w-[200px]">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Confidence</span>
            <span className="font-medium text-foreground">{similarity}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-700"
              style={{ width: `${similarity}%` }}
            />
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onRetry}>
          <ScanFace className="size-4" /> Scan again
        </Button>
      </div>
    );
  }

  // Unknown
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card px-6 py-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <UserX className="size-7 text-muted-foreground" />
      </div>
      <div>
        <p className="font-semibold text-foreground">Person not recognised</p>
        <p className="text-sm text-muted-foreground mt-1">
          This face has been saved as an unknown person. You can label them from the patient profile.
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw className="size-4" /> Try again
      </Button>
    </div>
  );
}

// ─── Camera Scanner ───────────────────────────────────────────────────────────
function CameraScanner({
  patientId,
  onResult,
}: {
  patientId: number;
  onResult: (r: { success: boolean; message: string; data?: MatchFaceData }) => void;
}) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);

  const [camActive, setCamActive]   = useState(false);
  const [camError,  setCamError]    = useState<string | null>(null);
  const [scanning,  setScanning]    = useState(false);
  const [countdown, setCountdown]   = useState<number | null>(null);

  const [matchFace] = useMatchFaceMutation();

  // Start camera
  const startCamera = useCallback(async () => {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCamActive(true);
    } catch {
      setCamError("Camera access denied. Please allow camera permissions and try again.");
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamActive(false);
    setCountdown(null);
  }, []);

  useEffect(() => () => { stopCamera(); }, [stopCamera]);

  // Capture frame → blob → API
  const capture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", 0.92)
    );
    if (!blob) return;

    const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
    setScanning(true);
    try {
      const res = await matchFace({ patientId, file }).unwrap();
      onResult(res as { success: boolean; message: string; data?: MatchFaceData });
    } catch {
      onResult({
        success: false,
        message: "Recognition failed.",
        data: { recognised: false },
      });
    } finally {
      setScanning(false);
      setCountdown(null);
    }
  }, [patientId, matchFace, onResult]);

  // 3-2-1 countdown then capture
  const startCountdown = useCallback(() => {
    let c = 3;
    setCountdown(c);
    const interval = setInterval(() => {
      c--;
      if (c === 0) {
        clearInterval(interval);
        setCountdown(null);
        capture();
      } else {
        setCountdown(c);
      }
    }, 1000);
  }, [capture]);

  return (
    <div className="space-y-4">
      {/* Video viewport */}
      <div className="relative overflow-hidden rounded-xl bg-black aspect-video w-full">
        <video
          ref={videoRef}
          className={cn(
            "h-full w-full object-cover",
            !camActive && "opacity-0"
          )}
          playsInline
          muted
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Overlay when camera off */}
        {!camActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted/30">
            <CameraOff className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Camera not active</p>
          </div>
        )}

        {/* Scan frame overlay */}
        {camActive && !scanning && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative w-48 h-56">
              {/* Corner markers */}
              {["tl","tr","bl","br"].map((pos) => (
                <div
                  key={pos}
                  className={cn(
                    "absolute size-5 border-foreground/60",
                    pos === "tl" && "top-0 left-0 border-t-2 border-l-2 rounded-tl",
                    pos === "tr" && "top-0 right-0 border-t-2 border-r-2 rounded-tr",
                    pos === "bl" && "bottom-0 left-0 border-b-2 border-l-2 rounded-bl",
                    pos === "br" && "bottom-0 right-0 border-b-2 border-r-2 rounded-br",
                  )}
                />
              ))}
            </div>
          </div>
        )}

        {/* Countdown overlay */}
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex size-20 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
              <span className="text-5xl font-bold text-white tabular-nums animate-pulse">
                {countdown}
              </span>
            </div>
          </div>
        )}

        {/* Scanning overlay */}
        {scanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 backdrop-blur-sm">
            <Loader2 className="size-8 text-white animate-spin" />
            <p className="text-sm text-white/80">Analysing face…</p>
          </div>
        )}
      </div>

      {/* Error */}
      {camError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          {camError}
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2">
        {!camActive ? (
          <Button className="flex-1" onClick={startCamera}>
            <Camera className="size-4" /> Start camera
          </Button>
        ) : (
          <>
            <Button
              className="flex-1"
              onClick={startCountdown}
              disabled={scanning || countdown !== null}
            >
              {scanning ? (
                <><Loader2 className="animate-spin" /> Scanning…</>
              ) : countdown !== null ? (
                <><Zap className="size-4" /> Capturing in {countdown}…</>
              ) : (
                <><ScanFace className="size-4" /> Scan face</>
              )}
            </Button>
            <Button variant="outline" onClick={stopCamera} disabled={scanning}>
              <CameraOff className="size-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── File Upload Scanner ───────────────────────────────────────────────────────
function FileScanner({
  patientId,
  onResult,
}: {
  patientId: number;
  onResult: (r: { success: boolean; message: string; data?: MatchFaceData }) => void;
}) {
  const [matchFace, { isLoading }] = useMatchFaceMutation();
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile]       = useState<File | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleMatch = async () => {
    if (!file) return;
    const res = await matchFace({ patientId, file }).unwrap();
    onResult(res as { success: boolean; message: string; data?: MatchFaceData });
  };

  return (
    <div className="space-y-4">
      <label
        htmlFor="upload-file"
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors",
          preview ? "border-foreground/30" : "border-border hover:border-foreground/30"
        )}
      >
        {preview ? (
          <img src={preview} alt="Preview" className="h-40 rounded-lg object-cover" />
        ) : (
          <>
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Camera className="size-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">Click to upload a photo</p>
              <p className="text-xs text-muted-foreground mt-0.5">JPEG, PNG, WEBP</p>
            </div>
          </>
        )}
        <input
          id="upload-file"
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleFile}
        />
      </label>
      <Button
        className="w-full"
        disabled={!file || isLoading}
        onClick={handleMatch}
      >
        {isLoading
          ? <><Loader2 className="animate-spin" /> Matching…</>
          : <><ScanFace className="size-4" /> Match face</>
        }
      </Button>
    </div>
  );
}

// ─── Recognition Page ─────────────────────────────────────────────────────────
export default function RecognitionPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const pid = Number(patientId);
  const { data: patientData, isLoading } = useGetPatientQuery(pid);
  const patient = patientData?.data;

  const [mode, setMode] = useState<"camera" | "upload">("camera");
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    data?: MatchFaceData;
  } | null>(null);

  const handleResult = (r: typeof result) => setResult(r);
  const handleRetry  = () => setResult(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/patients" className="hover:text-foreground transition-colors">Patients</Link>
        <span>/</span>
        {patient && (
          <>
            <Link
              to={`/patients/${pid}`}
              className="hover:text-foreground transition-colors"
            >
              {patient.name}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-foreground font-medium">Recognition</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Face Recognition</h1>
          {patient && (
            <p className="text-sm text-muted-foreground mt-0.5">
              Identifying visitors for <span className="font-medium text-foreground">{patient.name}</span>
            </p>
          )}
        </div>
        <Link to={`/patients/${pid}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4" /> Back
          </Button>
        </Link>
      </div>

      {/* Mode tabs */}
      {!result && (
        <div className="flex rounded-lg border border-border bg-muted p-1 gap-1">
          {(["camera", "upload"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors",
                mode === m
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Camera className="size-3.5" />
              {m === "camera" ? "Live camera" : "Upload photo"}
            </button>
          ))}
        </div>
      )}

      {/* Scanner or result */}
      {result ? (
        <MatchResult result={result} onRetry={handleRetry} />
      ) : mode === "camera" ? (
        <CameraScanner patientId={pid} onResult={handleResult} />
      ) : (
        <FileScanner patientId={pid} onResult={handleResult} />
      )}

      {/* Instruction card */}
      {!result && (
        <div className="rounded-lg border border-border bg-card/50 px-4 py-3">
          <p className="text-xs font-medium text-foreground mb-1.5">Tips for best results</p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li className="flex gap-1.5"><span className="text-foreground">•</span> Ensure good, even lighting on the face</li>
            <li className="flex gap-1.5"><span className="text-foreground">•</span> Face should be centred and unobstructed</li>
            <li className="flex gap-1.5"><span className="text-foreground">•</span> Avoid extreme angles or motion blur</li>
          </ul>
        </div>
      )}
    </div>
  );
}
