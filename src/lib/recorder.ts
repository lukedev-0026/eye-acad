import { useCallback, useEffect, useRef } from 'react';

export type Recording = { base64: string; mimeType: string; ms: number };

// Clips shorter than this are a slip of the finger, not a request.
const MIN_CLIP_MS = 350;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(blob);
  });
}

export const recordingSupported = () =>
  typeof navigator !== 'undefined' &&
  Boolean(navigator.mediaDevices?.getUserMedia) &&
  typeof MediaRecorder !== 'undefined';

// Press-and-hold recording. The microphone is opened on first use and kept for
// the life of the page, so later turns start at once.
export function useRecorder() {
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Array<Blob>>([]);
  const startedAt = useRef(0);

  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const start = useCallback(async () => {
    if (!stream.current) {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
    }
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) =>
      MediaRecorder.isTypeSupported(t),
    );
    chunks.current = [];
    const rec = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data);
    };
    rec.start();
    recorder.current = rec;
    startedAt.current = performance.now();
  }, []);

  // Resolves with null for a clip too short to mean anything.
  const stop = useCallback((): Promise<Recording | null> => {
    const rec = recorder.current;
    recorder.current = null;
    if (!rec || rec.state === 'inactive') return Promise.resolve(null);
    const ms = performance.now() - startedAt.current;
    return new Promise((resolve) => {
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
        if (ms < MIN_CLIP_MS || blob.size === 0) return resolve(null);
        blobToBase64(blob)
          .then((base64) => resolve({ base64, mimeType: blob.type, ms }))
          .catch(() => resolve(null));
      };
      rec.stop();
    });
  }, []);

  return { start, stop };
}
