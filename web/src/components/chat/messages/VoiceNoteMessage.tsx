import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Message, VoiceNoteData } from "@/api/types";
import { API_BASE } from "@/lib/constants";

interface VoiceNoteMessageProps {
  message: Message;
}

function formatMmSs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Generate pseudo-random waveform bars seeded by messageId */
function generateBars(messageId: string, count: number): number[] {
  let hash = 0;
  for (let i = 0; i < messageId.length; i++) {
    hash = (hash * 31 + messageId.charCodeAt(i)) | 0;
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    hash = (hash * 16807 + 12345) | 0;
    const value = ((hash & 0x7fffffff) % 80) + 20;
    bars.push(value);
  }
  return bars;
}

export function VoiceNoteMessage({ message }: VoiceNoteMessageProps) {
  const { t } = useTranslation("chat");
  const attachment = message.attachments?.[0];
  const voiceData = message.structuredData as VoiceNoteData | undefined;
  const durationMs = voiceData?.durationMs ?? 0;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationMs / 1000);
  // Tagged with the downloadPath it happened for, rather than a bare
  // boolean, so a later fetch attempt doesn't inherit a previous one's
  // failure. Setting this from the effect body itself (`setError(false)` at
  // the top, to reset between attempts) trips react-hooks/set-state-in-effect
  // — confirmed by running the linter, not assumed — because it's a
  // synchronous write of a value already known during render, exactly the
  // shape the rule flags. Tagging sidesteps it: `hasError` below is a plain
  // derivation, so there is nothing to reset.
  const [error, setError] = useState<{ downloadPath: string | null; failed: boolean }>({
    downloadPath: null,
    failed: false,
  });
  const [dragging, setDragging] = useState(false);
  const waveformRef = useRef<HTMLDivElement>(null);

  const BAR_COUNT = 40;
  const bars = useMemo(() => generateBars(message.id, BAR_COUNT), [message.id]);

  const downloadPath = attachment
    ? `/human/conversations/${message.conversationId}/files/${attachment.id}/download`
    : null;

  const hasError = error.downloadPath === downloadPath && error.failed;

  // In flight for as long as there's a download to make and neither an
  // audio URL nor an error has landed yet — not its own state, so there's
  // nothing here to fall out of sync with audioUrl/error.
  const loading = !!downloadPath && !audioUrl && !hasError;

  // Load audio blob
  useEffect(() => {
    if (!downloadPath) return;
    let cancelled = false;

    const token = localStorage.getItem("token");
    fetch(`${API_BASE}${downloadPath}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Download failed: ${r.status}`);
        const contentType = r.headers.get("Content-Type") || "audio/wav";
        const buf = await r.arrayBuffer();
        return new Blob([buf], { type: contentType });
      })
      .then((blob) => {
        if (!cancelled) {
          setAudioUrl(URL.createObjectURL(blob));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("[VoiceNote] Failed to load audio:", err);
          setError({ downloadPath, failed: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [downloadPath]);

  // Cleanup blob URL
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // Set audio src when URL is ready and bind events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    audio.src = audioUrl;
    audio.load();

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    const onError = () => {
      console.error("[VoiceNote] Audio element error:", audio.error);
      setError({ downloadPath, failed: true });
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [audioUrl, downloadPath]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play()
        .then(() => setPlaying(true))
        .catch((err) => {
          console.error("[VoiceNote] Play failed:", err);
          setError({ downloadPath, failed: true });
        });
    }
  }, [playing, audioUrl, downloadPath]);

  const seekTo = useCallback(
    (clientX: number) => {
      const audio = audioRef.current;
      const waveform = waveformRef.current;
      if (!audio || !waveform || !duration) return;

      const rect = waveform.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      audio.currentTime = ratio * duration;
      setCurrentTime(audio.currentTime);
    },
    [duration],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setDragging(true);
      seekTo(e.clientX);
    },
    [seekTo],
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => seekTo(e.clientX);
    const handleMouseUp = () => setDragging(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, seekTo]);

  const progress = duration > 0 ? currentTime / duration : 0;
  const displayTime = playing || currentTime > 0
    ? formatMmSs(currentTime * 1000)
    : formatMmSs(durationMs || duration * 1000);

  if (!attachment) {
    return <p className="text-sm text-gray-400">{t("messages.voiceNote.unavailable")}</p>;
  }

  return (
    <div className="flex items-center gap-3 min-w-[260px] max-w-[320px]">
      {/* Always-mounted hidden audio element */}
      <audio ref={audioRef} preload="none" style={{ display: "none" }} />

      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        disabled={loading || !audioUrl || hasError}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
      >
        {loading ? (
          <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : playing ? (
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg className="h-5 w-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Waveform + duration */}
      <div className="flex-1 min-w-0">
        <div
          ref={waveformRef}
          className="flex items-center gap-[2px] h-8 cursor-pointer select-none"
          onMouseDown={handleMouseDown}
        >
          {bars.map((height, i) => {
            const barProgress = i / BAR_COUNT;
            const isActive = barProgress < progress;
            return (
              <div
                key={i}
                className="flex-1 rounded-full transition-colors duration-150"
                style={{
                  height: `${height}%`,
                  backgroundColor: isActive
                    ? "rgb(16 185 129)"
                    : "rgb(75 85 99)",
                }}
              />
            );
          })}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">
          {hasError ? t("messages.voiceNote.error") : displayTime}
        </p>
      </div>
    </div>
  );
}
