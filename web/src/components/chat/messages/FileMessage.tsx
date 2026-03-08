import { useState, useEffect } from "react";
import type { Message } from "@/api/types";
import { formatFileSize } from "@/lib/formatters";
import { API_BASE } from "@/lib/constants";

interface FileMessageProps {
  message: Message;
}

export function FileMessage({ message }: FileMessageProps) {
  const attachment = message.attachments?.[0];
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const downloadPath = attachment
    ? `/human/conversations/${message.conversationId}/files/${attachment.id}/download`
    : null;

  const isImage = attachment?.mimeType.startsWith("image/");

  // Auto-load image preview
  useEffect(() => {
    if (!isImage || !downloadPath) return;
    let cancelled = false;

    const token = localStorage.getItem("token");
    fetch(`${API_BASE}${downloadPath}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.blob())
      .then((blob) => {
        if (!cancelled) setBlobUrl(URL.createObjectURL(blob));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isImage, downloadPath]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const handleDownload = async () => {
    if (!downloadPath || downloading) return;
    setDownloading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}${downloadPath}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = attachment!.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    } finally {
      setDownloading(false);
    }
  };

  if (!attachment) return <p className="text-sm text-gray-400">File not available</p>;

  if (isImage) {
    return (
      <button onClick={handleDownload} className="block cursor-pointer space-y-1 text-left">
        {blobUrl ? (
          <img src={blobUrl} alt={attachment.fileName} className="max-h-64 rounded-lg" />
        ) : (
          <div className="flex h-48 w-64 items-center justify-center rounded-lg bg-surface-tertiary">
            <svg className="h-8 w-8 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
        <p className="text-xs text-gray-500">
          {attachment.fileName} ({formatFileSize(attachment.sizeBytes)})
        </p>
      </button>
    );
  }

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className="flex items-center gap-3 rounded-lg border border-surface-border p-3 hover:bg-surface-elevated disabled:opacity-50"
    >
      <svg className="h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
      <div className="text-left">
        <p className="text-sm font-medium text-gray-100">{attachment.fileName}</p>
        <p className="text-xs text-gray-400">
          {downloading ? "Downloading..." : formatFileSize(attachment.sizeBytes)}
        </p>
      </div>
    </button>
  );
}
