import { useTranscription } from "@/hooks/useTranscription";
import { Mic, MessageSquare, Brain, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

interface LiveTranscriptionProps {
  patientId: number;
  patientName: string;
}

export function LiveTranscription({ patientId, patientName }: LiveTranscriptionProps) {
  const {
    isRecording,
    transcripts,
    summary,
    error,
    startRecording,
    stopRecording,
  } = useTranscription(patientId, patientName);

  const transcriptsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latestTranscript
  useEffect(() => {
    transcriptsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  return (
    <div className="space-y-4">
      {/* ── Summary Card ── */}
      <div className={cn(
        "rounded-2xl border border-border bg-card overflow-hidden transition-all duration-300",
        isRecording && "ring-2 ring-emerald-500/20 border-emerald-500/30"
      )}>
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Brain className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Live Summary</span>
          {isRecording && (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Processing
            </span>
          )}
        </div>
        
        <div className="p-5">
          {!summary && !isRecording ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center text-muted-foreground">
              <div className="size-10 rounded-full bg-muted flex items-center justify-center opacity-50">
                <Brain className="size-5" />
              </div>
              <p className="text-sm font-medium">No live summary yet</p>
              <p className="text-xs max-w-xs leading-relaxed">
                Connect your microphone and start talking to get AI-assisted memory cues.
              </p>
            </div>
          ) : (
            <div className="min-h-[80px] text-sm text-foreground leading-relaxed">
              {summary || (isRecording ? "Listening for memories..." : "Summary available here after the session.")}
            </div>
          )}
        </div>
      </div>

      {/* ── Transcription & Controls ── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="size-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Transcription</span>
          </div>
          
          <button 
            onClick={isRecording ? stopRecording : () => startRecording()}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shadow-sm",
              isRecording 
                ? "bg-rose-500 text-white hover:bg-rose-600" 
                : "bg-foreground text-background hover:opacity-90"
            )}
          >
            {isRecording ? (
              <><Square className="size-3" fill="currentColor" /> Stop</>
            ) : (
              <><Mic className="size-3" fill="currentColor" /> Start Live Mode</>
            )}
          </button>
        </div>

        <div className="p-4 bg-muted/20">
          <div className="h-48 overflow-y-auto space-y-3 custom-scrollbar pr-2">
            {transcripts.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-10">
                Ready to hear you...
              </p>
            ) : (
              transcripts.map((line) => (
                <div key={line.id} className={cn(
                  "text-sm animate-in fade-in slide-in-from-bottom-1 duration-300",
                  line.is_final ? "text-foreground" : "text-muted-foreground font-medium opacity-60 italic"
                )}>
                  {line.text}
                </div>
              ))
            )}
            <div ref={transcriptsEndRef} />
          </div>

          {error && (
            <div className="mt-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-[11px] text-destructive leading-relaxed font-medium">
              ⚠️ {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
