import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { ErrorResponseSchema, TimestampSchema, UuidSchema } from './common';
import { MAX_VIDEO_SECONDS } from './content';

const c = initContract();

const errors = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
  409: ErrorResponseSchema,
} as const;

/*
 * The video library (CAT-6): an organisation's videos, uploaded once and used in any of its courses.
 *
 * Uploading: the browser sends the file straight to storage in blocks of VIDEO_UPLOAD_BLOCK_BYTES
 * (PUT `${url}&comp=block&blockid=${videoBlockId(n)}`), so a dropped connection loses one block, not
 * the file; `uploadStatus` says which blocks storage already has, so an upload can carry on later,
 * even from another page. `uploaded` then joins the blocks and queues the video for processing.
 *
 * Processing (on Dream Lab's own servers): the video is converted for streaming at 360p and, when the
 * original is large enough, 720p; a poster frame and thumbnail are taken and its length measured.
 * Learners' players pick the quality their connection allows.
 *
 * Learners read everything from public, cacheable files under /media/videos/<id>/:
 *   manifest.json (VideoManifestSchema), and the stream, poster and captions it points to.
 *
 * Who: course authors (course.content.edit) of the organisation; reviewers may read.
 */

export const VIDEO_STATUSES = ['uploading', 'queued', 'processing', 'ready', 'failed'] as const;
export const VideoStatusSchema = z.enum(VIDEO_STATUSES);
export type VideoStatus = z.infer<typeof VideoStatusSchema>;

export const LIBRARY_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/x-matroska'] as const;
export const MAX_LIBRARY_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
/** Each upload block (the last may be smaller). */
export const VIDEO_UPLOAD_BLOCK_BYTES = 8 * 1024 * 1024;
export const videoBlockCount = (size: number): number => Math.max(1, Math.ceil(size / VIDEO_UPLOAD_BLOCK_BYTES));
/** Storage block ids: the same length for every block, base64. */
export const videoBlockId = (n: number): string => {
  const raw = `blk-${String(n).padStart(6, '0')}`;
  return typeof btoa === 'function' ? btoa(raw) : Buffer.from(raw).toString('base64');
};

// ---------- captions ----------

/** BCP 47 language tags as authors use them: en, fr, sw, yo, ha, ig, pt-BR. */
export const CaptionLangSchema = z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, 'A language code such as en, fr or sw');
export const CAPTION_LANGUAGES: Record<string, string> = {
  en: 'English',
  fr: 'French',
  pt: 'Portuguese',
  ar: 'Arabic',
  sw: 'Swahili',
  yo: 'Yoruba',
  ha: 'Hausa',
  ig: 'Igbo',
  am: 'Amharic',
  zu: 'Zulu',
  af: 'Afrikaans',
  so: 'Somali',
};

export const CaptionCueSchema = z
  .object({
    startS: z.number().min(0).max(MAX_VIDEO_SECONDS),
    endS: z.number().min(0).max(MAX_VIDEO_SECONDS),
    text: z.string().trim().min(1).max(500),
  })
  .refine((c) => c.endS > c.startS, { message: 'Ends before it starts', path: ['endS'] });
export type CaptionCue = z.infer<typeof CaptionCueSchema>;

export const CaptionTrackSchema = z.object({
  lang: CaptionLangSchema,
  label: z.string(),
  /** upload: from a file · auto: made by speech recognition · edited: changed in the caption editor. */
  source: z.enum(['upload', 'auto', 'edited']),
  cues: z.number().int(),
  updatedAt: TimestampSchema,
});
export type CaptionTrack = z.infer<typeof CaptionTrackSchema>;

export const SaveCaptionsSchema = z
  .object({
    label: z.string().trim().min(1).max(60),
    cues: z.array(CaptionCueSchema).min(1).max(5000),
    /** True when the cues came from a file; false when edited in the editor. */
    fromFile: z.boolean().default(false),
  })
  .strict();

export const AutoCaptionsSchema = z
  .object({
    /** The language spoken; "auto" lets speech recognition decide. */
    lang: z.union([CaptionLangSchema, z.literal('auto')]).default('auto'),
  })
  .strict();

const toSeconds = (t: string): number | null => {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(t.trim());
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]!.padEnd(3, '0')) / 1000;
};

/**
 * Cues from a WebVTT or SubRip (.srt) file. Styling tags are removed; cues that can't be read are
 * skipped. Throws when the text holds no cues at all.
 */
export function parseCaptions(text: string): CaptionCue[] {
  const cues: CaptionCue[] = [];
  const blocks = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const [from, rest] = lines[at]!.split('-->');
    const startS = toSeconds(from ?? '');
    const endS = toSeconds((rest ?? '').trim().split(/\s+/)[0] ?? '');
    const body = lines
      .slice(at + 1)
      .join('\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .trim();
    if (startS === null || endS === null || endS <= startS || !body) continue;
    cues.push({ startS: Math.round(startS * 1000) / 1000, endS: Math.round(endS * 1000) / 1000, text: body.slice(0, 500) });
  }
  if (!cues.length) throw new Error('No captions found: use a WebVTT (.vtt) or SubRip (.srt) file');
  return cues.sort((a, b) => a.startS - b.startS);
}

/** 3725.5 → "01:02:05.500" */
export function vttTime(s: number): string {
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}.${pad(ms % 1000, 3)}`;
}

/** A WebVTT file for players. Cue text is plain: markup characters are escaped. */
export function toVtt(cues: readonly CaptionCue[]): string {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/-->/g, '--&gt;');
  return `WEBVTT\n\n${cues.map((c, i) => `${i + 1}\n${vttTime(c.startS)} --> ${vttTime(c.endS)}\n${esc(c.text)}`).join('\n\n')}\n`;
}

// ---------- the library ----------

const Person = z.object({ userId: UuidSchema, name: z.string() }).nullable();

export const LibraryVideoSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  fileName: z.string(),
  size: z.number().int(),
  contentType: z.string(),
  status: VideoStatusSchema,
  /** While processing: how far it is, 0–100. */
  progress: z.number().int().min(0).max(100).nullable(),
  /** Why processing failed, in plain words. */
  error: z.string().nullable(),
  durationS: z.number().int().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  /** Stream heights available, e.g. [360, 720]. */
  renditions: z.array(z.number().int()),
  /** /media/videos/<id>/manifest.json once ready. */
  manifestUrl: z.string().nullable(),
  posterUrl: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  captions: z.array(CaptionTrackSchema),
  /** Captions being made by speech recognition. */
  captionJob: z.object({ status: z.enum(['queued', 'running', 'failed']), lang: z.string(), error: z.string().nullable() }).nullable(),
  /** Courses (drafts and published versions) that use it. */
  usedIn: z.array(z.object({ title: z.string(), slug: z.string() })),
  createdBy: Person,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type LibraryVideo = z.infer<typeof LibraryVideoSchema>;

/** Public, beside the stream: what a player needs. Paths are relative to /media/videos/<id>/. */
export const VideoManifestSchema = z.object({
  id: UuidSchema,
  durationS: z.number().int(),
  width: z.number().int(),
  height: z.number().int(),
  /** HLS master playlist. */
  hls: z.string(),
  poster: z.string(),
  thumbnail: z.string(),
  captions: z.array(z.object({ lang: z.string(), label: z.string(), src: z.string(), auto: z.boolean() })),
});
export type VideoManifest = z.infer<typeof VideoManifestSchema>;

export const CreateVideoSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    fileName: z.string().trim().min(1).max(200),
    contentType: z.enum(LIBRARY_VIDEO_TYPES),
    size: z.number().int().min(1).max(MAX_LIBRARY_VIDEO_BYTES, 'At most 2 GB'),
  })
  .strict();

export const VideoUploadLinkSchema = z.object({
  /** Storage URL with a short-lived write permission; add `&comp=block&blockid=…` per block. */
  url: z.string().url(),
  blockBytes: z.number().int(),
  blocks: z.number().int(),
  expiresAt: TimestampSchema,
});
export type VideoUploadLink = z.infer<typeof VideoUploadLinkSchema>;

export const CreatedVideoSchema = z.object({ video: LibraryVideoSchema, upload: VideoUploadLinkSchema });

export const VideoParams = z.object({ videoId: UuidSchema });
const CaptionParams = VideoParams.extend({ lang: CaptionLangSchema });

export const videosContract = c.router(
  {
    list: {
      method: 'GET',
      path: '/catalog/authoring/videos',
      query: z.object({ q: z.string().max(100).optional(), status: VideoStatusSchema.optional() }),
      responses: { 200: z.object({ items: z.array(LibraryVideoSchema) }), ...errors },
      summary: 'The organisation’s video library, newest first',
    },
    create: {
      method: 'POST',
      path: '/catalog/authoring/videos',
      body: CreateVideoSchema,
      responses: { 201: CreatedVideoSchema, ...errors },
      summary: 'Add a video: returns where to upload its blocks',
    },
    get: {
      method: 'GET',
      path: '/catalog/authoring/videos/:videoId',
      pathParams: VideoParams,
      responses: { 200: LibraryVideoSchema, ...errors },
      summary: 'One video, with its processing state and captions',
    },
    update: {
      method: 'PATCH',
      path: '/catalog/authoring/videos/:videoId',
      pathParams: VideoParams,
      body: z.object({ title: z.string().trim().min(1).max(200) }).strict(),
      responses: { 200: LibraryVideoSchema, ...errors },
      summary: 'Rename a video',
    },
    remove: {
      method: 'DELETE',
      path: '/catalog/authoring/videos/:videoId',
      pathParams: VideoParams,
      responses: { 204: c.noBody(), ...errors },
      summary: 'Delete a video and its files (409 while a course uses it)',
    },
    uploadLink: {
      method: 'POST',
      path: '/catalog/authoring/videos/:videoId/upload-link',
      pathParams: VideoParams,
      body: z.object({}).strict(),
      responses: { 200: VideoUploadLinkSchema, ...errors },
      summary: 'A fresh upload link for a video still uploading',
    },
    uploadStatus: {
      method: 'GET',
      path: '/catalog/authoring/videos/:videoId/upload-status',
      pathParams: VideoParams,
      responses: { 200: z.object({ received: z.array(z.number().int()), blocks: z.number().int() }), ...errors },
      summary: 'Which blocks storage already has, to carry on an interrupted upload',
    },
    uploaded: {
      method: 'POST',
      path: '/catalog/authoring/videos/:videoId/uploaded',
      pathParams: VideoParams,
      body: z.object({}).strict(),
      responses: { 200: LibraryVideoSchema, ...errors },
      summary: 'Every block is uploaded: join them and queue the video for processing',
    },
    retry: {
      method: 'POST',
      path: '/catalog/authoring/videos/:videoId/retry',
      pathParams: VideoParams,
      body: z.object({}).strict(),
      responses: { 200: LibraryVideoSchema, ...errors },
      summary: 'Process a video again after it failed',
    },
    captions: {
      method: 'GET',
      path: '/catalog/authoring/videos/:videoId/captions/:lang',
      pathParams: CaptionParams,
      responses: { 200: z.object({ lang: z.string(), label: z.string(), cues: z.array(CaptionCueSchema) }), ...errors },
      summary: 'One caption track’s cues, for the caption editor',
    },
    saveCaptions: {
      method: 'PUT',
      path: '/catalog/authoring/videos/:videoId/captions/:lang',
      pathParams: CaptionParams,
      body: SaveCaptionsSchema,
      responses: { 200: LibraryVideoSchema, ...errors },
      summary: 'Add or replace a caption track (from a file, or edited)',
    },
    removeCaptions: {
      method: 'DELETE',
      path: '/catalog/authoring/videos/:videoId/captions/:lang',
      pathParams: CaptionParams,
      responses: { 200: LibraryVideoSchema, ...errors },
      summary: 'Remove a caption track',
    },
    autoCaptions: {
      method: 'POST',
      path: '/catalog/authoring/videos/:videoId/captions-auto',
      pathParams: VideoParams,
      body: AutoCaptionsSchema,
      responses: { 200: LibraryVideoSchema, ...errors },
      summary: 'Make captions with speech recognition (they arrive in a few minutes; review them before publishing)',
    },
  },
  { strictStatusCodes: true },
);
