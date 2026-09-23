"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Mic, Video, Loader2, Play, Volume2, Square } from "lucide-react";

export default function TestAudioRecordingPage() {
  const [recording, setRecording] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);

  const startRecording = async () => {
    try {
      setTranscript(null);
      setAudioUrl(null);
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        const localUrl = URL.createObjectURL(audioBlob);
        setAudioUrl(localUrl);

        // Upload and transcribe
        setSubmitting(true);
        const formData = new FormData();
        formData.append("audio", audioBlob, "answer.webm");

        try {
          const response = await fetch("/api/test-audio", {
            method: "POST",
            body: formData,
          });
          const data = await response.json();
          if (data.error) {
            setTranscript(`Error: ${data.error}. ${data.details ?? ""}`);
          } else {
            setTranscript(data.text);
          }
        } catch (err: any) {
          setTranscript(`Upload failed: ${err.message}`);
        } finally {
          setSubmitting(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (err: any) {
      alert(`Microphone access denied or error occurred: ${err.message}`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      // Stop mic track
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      setRecording(false);
    }
  };

  const playVideo = () => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <Card className="w-full max-w-2xl bg-slate-900 border-slate-800 shadow-2xl overflow-hidden">
        <CardHeader className="border-b border-slate-800 pb-4">
          <CardTitle className="flex items-center gap-2 text-xl font-bold">
            <Mic className="h-6 w-6 text-indigo-400" />
            File-Based STT Prototype Demo
          </CardTitle>
          <p className="text-xs text-slate-400">
            Testing per-question local audio recording uploads versus WebSocket streaming.
          </p>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* AI Avatar Video Area */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-400 flex items-center gap-1.5">
              <Video className="h-4 w-4" /> AI Trainer Video
            </h3>
            <div className="relative aspect-video rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center group">
              <video
                ref={videoRef}
                src="/avatars/Zephyr.mp4"
                className="w-full h-full object-cover"
                playsInline
              />
              <button
                onClick={playVideo}
                className="absolute inset-0 m-auto h-16 w-16 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all group-hover:opacity-100 opacity-80"
              >
                <Play className="h-8 w-8 fill-current ml-1" />
              </button>
            </div>
          </div>

          {/* Audio Controls */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between border-t border-b border-slate-800 py-6">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-200">
                {recording ? "Recording your answer..." : "Ready to answer?"}
              </h4>
              <p className="text-xs text-slate-400">
                Click Unmute to record locally, then click Submit to send.
              </p>
            </div>

            <div className="flex gap-3">
              {!recording ? (
                <Button
                  onClick={startRecording}
                  disabled={submitting}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 font-bold flex gap-2"
                >
                  <Volume2 className="h-4 w-4" />
                  Unmute & Speak
                </Button>
              ) : (
                <Button
                  onClick={stopRecording}
                  className="bg-red-600 hover:bg-red-700 text-white px-6 font-bold flex gap-2 animate-pulse"
                >
                  <Square className="h-4 w-4 fill-current" />
                  Submit Answer
                </Button>
              )}
            </div>
          </div>

          {/* Recording Playback */}
          {audioUrl && (
            <div className="space-y-2 bg-slate-950 p-4 rounded-xl border border-slate-800">
              <h4 className="text-xs font-bold text-slate-400">Your Recorded Audio</h4>
              <audio src={audioUrl} controls className="w-full h-10 mt-1" />
            </div>
          )}

          {/* Output Box */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-indigo-400 tracking-wider uppercase">
              Transcribed Script Output
            </h4>
            <div className="min-h-24 w-full bg-slate-950 rounded-xl border border-slate-800 p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap flex items-center justify-center">
              {submitting ? (
                <div className="flex flex-col items-center gap-2 text-indigo-400">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-xs font-semibold animate-pulse">Uploading & Transcribing...</span>
                </div>
              ) : transcript ? (
                <span className="text-slate-200 w-full text-left">{transcript}</span>
              ) : (
                <span className="text-slate-600 italic">No answer submitted yet.</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
