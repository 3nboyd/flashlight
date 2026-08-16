/**
 * Pure FFmpeg argument builders for remuxing a recorded WebM (what Chromium's
 * MediaRecorder produces) into a delivery container. VP8/VP9 + Opus can't be
 * copied into MP4/MOV, so we transcode to H.264 + AAC. Kept pure so the arg
 * construction is unit-tested independently of actually running FFmpeg.
 */

export type RemuxQuality = 'high' | 'balanced' | 'small'

/** H.264 CRF per quality (lower = better/bigger). */
const CRF: Record<RemuxQuality, number> = { high: 18, balanced: 23, small: 28 }

/**
 * Args to transcode `input` into an MP4/MOV/M4A at `output` (container inferred
 * from the output extension). Works for A/V, video-only, or audio-only inputs -
 * a codec flag for an absent stream is simply ignored by FFmpeg.
 */
export function ffmpegRemuxArgs(input: string, output: string, quality: RemuxQuality): string[] {
  return [
    '-y',
    '-i',
    input,
    '-c:v',
    'libx264',
    '-crf',
    String(CRF[quality]),
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    // Put the moov atom up front so the file is seekable/streamable immediately.
    '-movflags',
    '+faststart',
    output
  ]
}
