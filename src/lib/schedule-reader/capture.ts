/**
 * Privacy View Capture — one frame, locally, then gone.
 *
 * Desktop: the browser Screen Capture API. The user turns on their PMS
 * privacy view, picks the PMS window, we grab a single frame, and the stream
 * is stopped immediately. The browser cannot minimize or control other apps
 * and we never pretend it can — the UX walks the user through the picker.
 *
 * Mobile fallback: local file selection (only when the office enables it).
 * The image is processed in memory exactly like a captured frame. Purple
 * Envelope cannot delete the original from the phone's gallery and the UI
 * says so plainly.
 *
 * Nothing here uploads anything, ever. The frame lives in a canvas in
 * memory until destroyCapture() wipes it.
 */
import { ScheduleReaderError, type CaptureFrame } from './types';

export function captureSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function'
  );
}

/** Grab exactly one frame from a user-selected window, stopping the stream immediately. */
export async function captureDisplayFrame(): Promise<CaptureFrame> {
  if (!captureSupported()) {
    throw new ScheduleReaderError('CAPTURE_UNSUPPORTED');
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 1 },
      audio: false,
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    throw new ScheduleReaderError(
      name === 'NotAllowedError' ? 'CAPTURE_PERMISSION_DENIED' : 'CAPTURE_FAILED',
      { reason: name || 'unknown' }
    );
  }

  const tracks = stream.getTracks();
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    // One paint is enough — some browsers need a tick for the first frame.
    await new Promise(resolve => requestAnimationFrame(resolve));

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || canvas.width === 0 || canvas.height === 0) {
      throw new ScheduleReaderError('CAPTURE_FAILED', { reason: 'empty_frame' });
    }
    ctx.drawImage(video, 0, 0);

    video.pause();
    video.srcObject = null;

    return {
      canvas,
      width: canvas.width,
      height: canvas.height,
      objectUrls: [],
      tracks,
    };
  } catch (err) {
    if (err instanceof ScheduleReaderError) throw err;
    throw new ScheduleReaderError('CAPTURE_FAILED', {
      reason: err instanceof Error ? err.name : 'unknown',
    });
  } finally {
    // The stream never outlives the single frame.
    for (const track of tracks) track.stop();
  }
}

/**
 * Mobile fallback: read a locally selected image into a canvas frame.
 * The file is read in memory; the original stays wherever the user keeps it
 * (we cannot and do not manage the device's gallery).
 */
export async function frameFromFile(file: File): Promise<CaptureFrame> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new ScheduleReaderError('CAPTURE_FAILED', { reason: 'unreadable_image' }));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || canvas.width === 0 || canvas.height === 0) {
      throw new ScheduleReaderError('CAPTURE_FAILED', { reason: 'empty_image' });
    }
    ctx.drawImage(img, 0, 0);

    return {
      canvas,
      width: canvas.width,
      height: canvas.height,
      objectUrls: [],
      tracks: [],
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
