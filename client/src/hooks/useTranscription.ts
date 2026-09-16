/**
 * useTranscription.ts
 * ====================
 * Client-side Deepgram live transcription hook.
 *
 * Architecture:
 *   1. Browser opens a Deepgram WebSocket directly using VITE_DEEPGRAM_API_KEY
 *      via the native WebSocket API (no SDK dependency — works with any version).
 *   2. Each final transcript sentence is:
 *      a) shown instantly in the UI
 *      b) POST-ed to /transcription/transcript-line  (saves to DB in real time)
 *   3. On stop, the full transcript is POST-ed to /transcription/finish
 *      which calls Gemini, saves the summary, closes the conversation.
 *
 * autoStart:
 *   When true (set by PatientModePage when a face is recognised),
 *   the hook restarts automatically whenever personId changes.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  useStartConversationMutation,
  useSaveTranscriptLineMutation,
  useFinishConversationMutation,
} from "@/services";

const DEEPGRAM_API_KEY = (import.meta.env.VITE_DEEPGRAM_API_KEY as string) || "ab9c01f050ab0e5b8a5caad4d9e4e8e73ffe263c";
console.log("Deepgram API key loaded:", DEEPGRAM_API_KEY ? "yes" : "no");
// Deepgram real-time streaming WebSocket URL
const DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen";

export interface TranscriptLine {
  id:        number;
  text:      string;
  is_final:  boolean;
  timestamp: string;
}

export interface UseTranscriptionOptions {
  /**
   * If true, recording starts automatically whenever personId changes
   * to a non-null value (i.e. a face was just recognised).
   */
  autoStart?: boolean;
}

export function useTranscription(
  patientId:   number,
  patientName: string,
  personId?:   number | null,
  options?:    UseTranscriptionOptions,
) {
  const autoStart = options?.autoStart ?? false;

  const [isRecording,    setIsRecording]    = useState(false);
  const [transcripts,    setTranscripts]    = useState<TranscriptLine[]>([]);
  const [summary,        setSummary]        = useState<string>("");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [error,          setError]          = useState<string | null>(null);

  // Refs — survive re-renders without triggering effects
  const mediaRecorderRef   = useRef<MediaRecorder | null>(null);
  const streamRef          = useRef<MediaStream | null>(null);
  const wsRef              = useRef<WebSocket | null>(null);
  const conversationIdRef  = useRef<number | null>(null);
  const transcriptLinesRef = useRef<string[]>([]);
  const sessionTokenRef    = useRef<number>(0);
  const lineIdRef          = useRef(0);
  const activePersonIdRef  = useRef<number | null | undefined>(undefined);

  // RTK Query mutations
  const [startConversation]  = useStartConversationMutation();
  const [saveTranscriptLine] = useSaveTranscriptLineMutation();
  const [finishConversation] = useFinishConversationMutation();

  // ── Internal hardware stop (no state reset) ──────────────────────────────
  const _stopHardware = useCallback(() => {
    sessionTokenRef.current += 1;
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current        = null;
    mediaRecorderRef.current = null;

    try {
      if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) {
        wsRef.current.close();
      }
    } catch { /* ignore */ }
    wsRef.current = null;
  }, []);

  // ── Stop ─────────────────────────────────────────────────────────────────
  const stopRecording = useCallback(async () => {
    _stopHardware();
    setIsRecording(false);
    activePersonIdRef.current = undefined;

    const cid      = conversationIdRef.current;
    const fullText = transcriptLinesRef.current.join(" ");

    if (!cid || !fullText.trim()) return;

    try {
      const res = await finishConversation({
        conversation_id: cid,
        patient_name:    patientName,
        full_transcript: fullText,
      }).unwrap();
      setSummary(res.data?.summary ?? "");
    } catch (err) {
      console.error("Failed to finish conversation:", err);
    }
  }, [_stopHardware, finishConversation, patientName]);

  // ── Start ─────────────────────────────────────────────────────────────────
  const startRecording = useCallback(async (overridePersonId?: number | null) => {
    const token = ++sessionTokenRef.current;
    
    setError(null);
    setTranscripts([]);
    setSummary("");
    transcriptLinesRef.current = [];
    lineIdRef.current          = 0;
    conversationIdRef.current  = null;

    const resolvedPersonId =
      overridePersonId !== undefined ? overridePersonId : (personId ?? null);

    if (!DEEPGRAM_API_KEY) {
      setError("Deepgram API key missing. Please restart your frontend server (Ctrl+C then pnpm dev).");
      return;
    }

    try {
      // 1. Create conversation row in backend DB
      const convRes = await startConversation({
        patient_id:   patientId,
        patient_name: patientName,
        person_id:    resolvedPersonId,
      }).unwrap();

      if (sessionTokenRef.current !== token) return; // aborted

      const cid = convRes.data?.conversation_id;
      if (!cid) throw new Error("Backend did not return conversation_id");
      conversationIdRef.current = cid;
      setConversationId(cid);

      // 2. Microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1 },
      });
      
      if (sessionTokenRef.current !== token) {
        stream.getTracks().forEach(t => t.stop());
        return; // aborted
      }
      
      streamRef.current = stream;

      // 3. Build Deepgram WebSocket URL with query params
      const params = new URLSearchParams({
        model:           "nova-2",
        language:        "en-US",
        smart_format:    "true",
        interim_results: "false",
        endpointing:     "400",
      });
      const wsUrl = `${DEEPGRAM_WS_URL}?${params.toString()}`;

      // 4. Open native WebSocket to Deepgram
      const ws = new WebSocket(wsUrl, ["token", DEEPGRAM_API_KEY]);
      wsRef.current = ws;

      ws.onopen = () => {
        // Start MediaRecorder once WebSocket is open
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "";
        const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mediaRecorderRef.current = mr;

        mr.ondataavailable = (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            e.data.arrayBuffer().then((buf) => ws.send(buf));
          }
        };
        mr.start(250);  // 250ms chunks
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Deepgram sends different message types; we only care about Results
          if (data.type !== "Results") return;

          const sentence: string =
            data?.channel?.alternatives?.[0]?.transcript ?? "";
          if (!sentence.trim() || !data.is_final) return;

          // Show immediately in UI
          setTranscripts((prev) => [
            ...prev,
            {
              id:        ++lineIdRef.current,
              text:      sentence,
              is_final:  true,
              timestamp: new Date().toISOString(),
            },
          ]);

          // Buffer for summary on stop
          transcriptLinesRef.current.push(sentence);

          // Persist to backend (fire-and-forget but capture summary)
          const cidNow = conversationIdRef.current;
          if (cidNow) {
            saveTranscriptLine({ conversation_id: cidNow, text: sentence })
              .unwrap()
              .then((res: any) => {
                if (res.data?.summary) {
                  setSummary(res.data.summary);
                }
              })
              .catch((err) => console.error("Failed to save transcript line:", err));
          }
        } catch (parseErr) {
          console.warn("Failed to parse Deepgram message:", parseErr);
        }
      };

      ws.onerror = (ev) => {
        console.error("Deepgram WebSocket error:", ev);
        setError("Deepgram connection error. Check your API key and network.");
      };

      ws.onclose = (ev) => {
        console.log("Deepgram WebSocket closed:", ev.code, ev.reason);
      };

      activePersonIdRef.current = resolvedPersonId;
      setIsRecording(true);

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start recording.";
      setError(msg);
      setIsRecording(false);
      _stopHardware();
    }
  }, [patientId, patientName, personId, startConversation, saveTranscriptLine, _stopHardware]);

  // ── Auto-start / restart when personId changes ────────────────────────────
  useEffect(() => {
    if (!autoStart) return;
    if (personId === undefined) return;
    if (activePersonIdRef.current === personId && isRecording) return;

    let isActive = true;
    const restart = async () => {
      if (mediaRecorderRef.current || streamRef.current || wsRef.current) {
        _stopHardware();
        await new Promise((r) => setTimeout(r, 300)); // let WS close cleanly
      }
      if (isActive) {
        await startRecording(personId);
      }
    };
    restart();
    
    return () => {
      isActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, personId]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => { _stopHardware(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isRecording,
    transcripts,
    summary,
    conversationId,
    error,
    startRecording,
    stopRecording,
  };
}
