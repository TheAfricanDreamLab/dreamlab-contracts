import { z } from 'zod';
import { UuidSchema } from './common';
import { MEDIA_PATH_PATTERN, MediaPathSchema } from './media';

/*
 * Course content (ERD v0.1 §5): Course → Version → Module → Item. Lessons are short steps of
 * blocks; interactive blocks are checked by the server, so a learner's browser never receives the
 * answers. Each schema comes in two forms:
 *   - authoring (`*AuthoringSchema`): what an author writes, answers and feedback included;
 *   - delivery (`*Schema`): what a learner receives, with every answer stripped.
 */

/**
 * Course text, written in the editor and stored as a small, safe markup (never HTML):
 * paragraphs separated by blank lines; `## ` and `### ` headings; **bold**, *italic*, ++underline++,
 * `code` and [links](https://…) (https only); `- ` bullets and `1. ` numbered lines; `> ` quotes;
 * fenced code blocks; and tables (`| a | b |` rows, the second row `| --- | --- |`).
 * This schema checks only the length. The markup rules are enforced where the text is read: the
 * editor writes only this markup, and renderers build elements (never HTML) and link only https.
 */
export const RichTextSchema = z.string().min(1).max(12_000);

/** Stable within its item, e.g. `why-define`. Lets progress and answers survive re-ordering. */
export const BlockIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/, 'Lowercase letters, digits and hyphens');
const OptionIdSchema = BlockIdSchema;

// ---------- Teaching blocks (the same for authors and learners) ----------

export const CALLOUT_TONES = ['insight', 'tip', 'caution', 'story', 'context'] as const;

const TextBlock = z.object({ id: BlockIdSchema, type: z.literal('text'), body: RichTextSchema });
const CalloutBlock = z.object({
  id: BlockIdSchema,
  type: z.literal('callout'),
  /** insight: the big idea · tip · caution: a common trap · story: a real-life case · context: an African setting */
  tone: z.enum(CALLOUT_TONES),
  title: z.string().max(120).optional(),
  body: RichTextSchema,
});
const QuoteBlock = z.object({ id: BlockIdSchema, type: z.literal('quote'), text: z.string().max(600), attribution: z.string().max(160) });
const ExampleBlock = z.object({ id: BlockIdSchema, type: z.literal('example'), title: z.string().max(160), body: RichTextSchema });
const KeyTermsBlock = z.object({
  id: BlockIdSchema,
  type: z.literal('key_terms'),
  terms: z.array(z.object({ term: z.string().max(80), definition: z.string().max(400) })).min(1).max(12),
});
/** Think first, then tap to see. */
const RevealBlock = z.object({ id: BlockIdSchema, type: z.literal('reveal'), prompt: z.string().max(600), body: RichTextSchema });
/** A framework laid out as labelled steps, e.g. Define → Diagnose → Generate → Decide → Do. */
const FrameworkBlock = z.object({
  id: BlockIdSchema,
  type: z.literal('framework'),
  title: z.string().max(120),
  steps: z.array(z.object({ label: z.string().max(60), detail: z.string().max(400) })).min(2).max(10),
});

// ---------- Media ----------

/**
 * Hosts images may come from. Clients allow exactly these in their content security policy, so an
 * author cannot make learners' browsers load from anywhere else.
 */
export const MEDIA_IMAGE_HOSTS = ['images.unsplash.com', 'upload.wikimedia.org', 'i.ytimg.com'] as const;

export const MediaImageUrlSchema = z
  .string()
  .max(600)
  .refine((u) => {
    if (u.startsWith('/media/')) return MEDIA_PATH_PATTERN.test(u.slice('/media/'.length));
    try {
      const url = new URL(u);
      return url.protocol === 'https:' && (MEDIA_IMAGE_HOSTS as readonly string[]).includes(url.hostname);
    } catch {
      return false;
    }
  }, `Images must be uploaded, or https and hosted on ${MEDIA_IMAGE_HOSTS.join(', ')}`);

export const YouTubeIdSchema = z.string().regex(/^[A-Za-z0-9_-]{11}$/, 'An 11-character YouTube video id');
export const VimeoIdSchema = z.string().regex(/^\d{6,12}$/, 'A Vimeo video number');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where a video comes from:
 *   - youtube / vimeo: played from youtube-nocookie.com or player.vimeo.com, only when tapped;
 *   - library: the organisation's video library (CAT-6), streamed in the quality the connection
 *     allows, with captions; `videoId` is the library video's id;
 *   - file: an MP4 uploaded straight into the course before the library existed; `videoId` is its
 *     media path. Still played, no longer offered for new videos.
 */
export const VIDEO_PROVIDERS = ['youtube', 'vimeo', 'library', 'file'] as const;
export const VideoProviderSchema = z.enum(VIDEO_PROVIDERS);
export type VideoProvider = z.infer<typeof VideoProviderSchema>;

/** A video learners watch in place. `videoProblem` checks the provider and id agree. */
export const VideoRefSchema = z.object({
  provider: VideoProviderSchema,
  videoId: z.union([YouTubeIdSchema, VimeoIdSchema, UuidSchema, MediaPathSchema]),
  title: z.string().min(1).max(200),
  /** Who made it: shown as the credit. */
  channel: z.string().min(1).max(120),
  durationS: z.number().int().min(1).max(36_000).optional(),
  startS: z.number().int().min(0).optional(),
  endS: z.number().int().min(1).optional(),
});
export type VideoRef = z.infer<typeof VideoRefSchema>;

/** Why a video reference is unusable, or null. */
export function videoProblem(v: Pick<VideoRef, 'provider' | 'videoId'>): string | null {
  switch (v.provider) {
    case 'youtube':
      return /^[A-Za-z0-9_-]{11}$/.test(v.videoId) ? null : 'Paste a YouTube link';
    case 'vimeo':
      return /^\d{6,12}$/.test(v.videoId) ? null : 'Paste a Vimeo link';
    case 'library':
      return UUID_PATTERN.test(v.videoId) ? null : 'Choose a video from the library';
    case 'file':
      return MEDIA_PATH_PATTERN.test(v.videoId) ? null : 'Upload the video file';
  }
}

/** Longest video, in seconds (10 hours). */
export const MAX_VIDEO_SECONDS = 36_000;

/** A named point in a video learners can jump to. */
export const VideoChapterSchema = z.object({ atS: z.number().int().min(0).max(MAX_VIDEO_SECONDS), title: z.string().trim().min(1).max(120) });
export type VideoChapter = z.infer<typeof VideoChapterSchema>;

/**
 * A question asked during a video: the video pauses at `atS` and shows the interactive block
 * `blockId` from the same step, checked by the server like any other. It no longer appears on its own
 * in the step.
 */
export const VideoPauseSchema = z.object({ atS: z.number().int().min(1).max(MAX_VIDEO_SECONDS), blockId: z.string() });
export type VideoPause = z.infer<typeof VideoPauseSchema>;

const VideoBlock = VideoRefSchema.extend({
  id: BlockIdSchema,
  type: z.literal('video'),
  /** What to watch for. */
  caption: z.string().max(600).optional(),
  chapters: z.array(VideoChapterSchema).max(50).optional(),
  pauses: z.array(VideoPauseSchema).max(20).optional(),
});
const ImageBlock = z.object({
  id: BlockIdSchema,
  type: z.literal('image'),
  url: MediaImageUrlSchema,
  alt: z.string().min(3).max(300),
  caption: z.string().max(600).optional(),
  /** Photographer and source, e.g. "Photo: Jane Doe / Unsplash". */
  credit: z.string().min(1).max(200),
});

/** A file learners download: a worksheet, slides, a template or a reading. */
const DownloadBlock = z.object({
  id: BlockIdSchema,
  type: z.literal('download'),
  title: z.string().trim().min(1).max(160),
  description: z.string().max(400).optional(),
  /** Where the uploaded file is, relative to /media. */
  path: MediaPathSchema,
  fileName: z.string().min(1).max(160),
  size: z.number().int().min(1),
  contentType: z.string().max(120),
});

const teachingBlocks = [TextBlock, CalloutBlock, QuoteBlock, ExampleBlock, KeyTermsBlock, RevealBlock, FrameworkBlock, VideoBlock, ImageBlock, DownloadBlock] as const;

// ---------- Interactive blocks: authoring form ----------

const ChoiceAuthoring = z.object({
  id: BlockIdSchema,
  type: z.literal('choice'),
  prompt: z.string().max(1000),
  /** More than one option may be correct; the learner must pick all of them. */
  multiple: z.boolean().default(false),
  options: z
    .array(z.object({ id: OptionIdSchema, text: z.string().max(400), correct: z.boolean(), feedback: z.string().max(600).optional() }))
    .min(2)
    .max(8),
  /** Shown once the learner gets it right or runs out of tries. */
  explanation: RichTextSchema,
});
const OrderAuthoring = z.object({
  id: BlockIdSchema,
  type: z.literal('order'),
  prompt: z.string().max(1000),
  /** In the correct order; learners receive them shuffled. */
  items: z.array(z.object({ id: OptionIdSchema, text: z.string().max(300) })).min(3).max(8),
  explanation: RichTextSchema,
});
const MatchAuthoring = z.object({
  id: BlockIdSchema,
  type: z.literal('match'),
  prompt: z.string().max(1000),
  pairs: z.array(z.object({ id: OptionIdSchema, left: z.string().max(200), right: z.string().max(300) })).min(2).max(8),
  explanation: RichTextSchema,
});
/** No right answer: after voting, learners see how everyone else answered. */
const PollAuthoring = z.object({
  id: BlockIdSchema,
  type: z.literal('poll'),
  prompt: z.string().max(1000),
  options: z.array(z.object({ id: OptionIdSchema, text: z.string().max(300) })).min(2).max(8),
  /** Shown after voting. */
  afterword: RichTextSchema.optional(),
});
/** Self-assessment on a 1–5 scale, with everyone's answers shown afterwards. */
const ScaleAuthoring = z.object({
  id: BlockIdSchema,
  type: z.literal('scale'),
  prompt: z.string().max(1000),
  minLabel: z.string().max(60),
  maxLabel: z.string().max(60),
  afterword: RichTextSchema.optional(),
});
/** Written into the learner's journal. */
const ReflectionAuthoring = z.object({
  id: BlockIdSchema,
  type: z.literal('reflection'),
  prompt: z.string().max(1000),
  guidance: z.string().max(600).optional(),
  minWords: z.number().int().min(0).max(500).default(20),
});
/** A real situation with choices; each choice reveals its likely outcome. One may be marked best. */
const ScenarioAuthoring = z.object({
  id: BlockIdSchema,
  type: z.literal('scenario'),
  situation: RichTextSchema,
  prompt: z.string().max(600),
  options: z.array(z.object({ id: OptionIdSchema, text: z.string().max(400), outcome: RichTextSchema, best: z.boolean().default(false) })).min(2).max(6),
});

export const InteractiveBlockAuthoringSchema = z.discriminatedUnion('type', [
  ChoiceAuthoring,
  OrderAuthoring,
  MatchAuthoring,
  PollAuthoring,
  ScaleAuthoring,
  ReflectionAuthoring,
  ScenarioAuthoring,
]);
export type InteractiveBlockAuthoring = z.infer<typeof InteractiveBlockAuthoringSchema>;

export const BlockAuthoringSchema = z.discriminatedUnion('type', [
  ...teachingBlocks,
  ChoiceAuthoring,
  OrderAuthoring,
  MatchAuthoring,
  PollAuthoring,
  ScaleAuthoring,
  ReflectionAuthoring,
  ScenarioAuthoring,
]);
export type BlockAuthoring = z.infer<typeof BlockAuthoringSchema>;

/** Block types the learner must answer before moving on. */
export const INTERACTIVE_BLOCK_TYPES = ['choice', 'order', 'match', 'poll', 'scale', 'reflection', 'scenario'] as const;
export type InteractiveBlockType = (typeof INTERACTIVE_BLOCK_TYPES)[number];
export const isInteractiveBlock = (b: { type: string }): boolean => (INTERACTIVE_BLOCK_TYPES as readonly string[]).includes(b.type);
/** Interactive blocks with a right answer. */
export const GRADED_BLOCK_TYPES = ['choice', 'order', 'match'] as const;

// ---------- Interactive blocks: delivery form (no answers) ----------

const ChoiceDelivery = ChoiceAuthoring.omit({ options: true, explanation: true }).extend({
  options: z.array(z.object({ id: OptionIdSchema, text: z.string() })),
});
const OrderDelivery = OrderAuthoring.omit({ explanation: true });
const MatchDelivery = z.object({
  id: BlockIdSchema,
  type: z.literal('match'),
  prompt: z.string(),
  left: z.array(z.object({ id: OptionIdSchema, text: z.string() })),
  right: z.array(z.object({ id: OptionIdSchema, text: z.string() })),
});
const PollDelivery = PollAuthoring.omit({ afterword: true });
const ScaleDelivery = ScaleAuthoring.omit({ afterword: true });
const ScenarioDelivery = ScenarioAuthoring.omit({ options: true }).extend({
  options: z.array(z.object({ id: OptionIdSchema, text: z.string() })),
});

export const BlockSchema = z.discriminatedUnion('type', [
  ...teachingBlocks,
  ChoiceDelivery,
  OrderDelivery,
  MatchDelivery,
  PollDelivery,
  ScaleDelivery,
  ReflectionAuthoring,
  ScenarioDelivery,
]);
export type Block = z.infer<typeof BlockSchema>;

// ---------- Learner answers and the server's verdict ----------

export const BlockResponseSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('choice'), optionIds: z.array(OptionIdSchema).min(1).max(8) }),
  z.object({ type: z.literal('order'), itemIds: z.array(OptionIdSchema).min(2).max(8) }),
  /** left option id → right option id */
  z.object({ type: z.literal('match'), matches: z.record(OptionIdSchema, OptionIdSchema) }),
  z.object({ type: z.literal('poll'), optionId: OptionIdSchema }),
  z.object({ type: z.literal('scale'), value: z.number().int().min(1).max(5) }),
  z.object({ type: z.literal('reflection'), text: z.string().trim().min(1).max(8000) }),
  z.object({ type: z.literal('scenario'), optionId: OptionIdSchema }),
]);
export type BlockResponse = z.infer<typeof BlockResponseSchema>;

export const BlockResultSchema = z.object({
  blockId: BlockIdSchema,
  /** null when the block has no right answer (poll, scale, reflection, scenario). */
  correct: z.boolean().nullable(),
  /** Feedback on what the learner chose. */
  feedback: z.string().nullable(),
  /** The full explanation, once correct or out of tries. */
  explanation: z.string().nullable(),
  /** The right answer, once correct or out of tries: option ids, the right order, or left → right. */
  solution: z
    .union([z.object({ optionIds: z.array(z.string()) }), z.object({ itemIds: z.array(z.string()) }), z.object({ matches: z.record(z.string(), z.string()) })])
    .nullable(),
  /** Scenario: what happens next, and whether this was the strongest choice. */
  outcome: z.object({ text: z.string(), best: z.boolean() }).nullable(),
  /** Poll and scale: how every learner answered (option id or "1".."5" → count). */
  distribution: z.record(z.string(), z.number().int()).nullable(),
  afterword: z.string().nullable(),
  attempts: z.number().int(),
  /** Further tries allowed before the solution is shown. */
  canRetry: z.boolean(),
});
export type BlockResult = z.infer<typeof BlockResultSchema>;

/** Wrong tries a graded block allows before it shows the solution. */
export const BLOCK_MAX_TRIES = 2;

// ---------- Items ----------

export const ITEM_TYPES = ['lesson', 'quiz', 'assignment', 'discussion'] as const;
export const ItemTypeSchema = z.enum(ITEM_TYPES);
export type ItemType = z.infer<typeof ItemTypeSchema>;

export const LessonStepAuthoringSchema = z.object({
  id: BlockIdSchema,
  title: z.string().max(120).optional(),
  blocks: z.array(BlockAuthoringSchema).min(1).max(12),
});
export const LessonStepSchema = LessonStepAuthoringSchema.extend({ blocks: z.array(BlockSchema) });

/** Graded quiz questions: the graded interactive block types. */
export const QuizQuestionAuthoringSchema = z.discriminatedUnion('type', [ChoiceAuthoring, OrderAuthoring, MatchAuthoring]);
export const QuizQuestionSchema = z.discriminatedUnion('type', [ChoiceDelivery, OrderDelivery, MatchDelivery]);

export const RubricCriterionSchema = z.object({
  id: BlockIdSchema,
  criterion: z.string().max(120),
  /** What "meets the standard" looks like. */
  description: z.string().max(600),
});

const LessonPayloadAuthoring = z.object({ steps: z.array(LessonStepAuthoringSchema).min(1).max(20) });
const QuizPayloadAuthoring = z.object({
  intro: RichTextSchema,
  passPct: z.number().int().min(1).max(100),
  /** null = unlimited. */
  maxAttempts: z.number().int().min(1).nullable(),
  questions: z.array(QuizQuestionAuthoringSchema).min(1).max(40),
});
const AssignmentPayload = z.object({
  brief: RichTextSchema,
  /** The named Practical Output this assignment produces, e.g. "Problem Definition Canvas". */
  practicalOutput: z.string().max(160).nullable(),
  steps: z.array(z.string().max(600)).min(1).max(12),
  rubric: z.array(RubricCriterionSchema).min(1).max(10),
  /** Optional structure the submission editor starts from. */
  template: z.string().max(6000).optional(),
  minWords: z.number().int().min(0).max(5000).default(150),
});
const DiscussionPayload = z.object({
  prompt: RichTextSchema,
  guidance: z.string().max(600).optional(),
  minWords: z.number().int().min(0).max(1000).default(40),
});

/**
 * Every item: `preview` lets people who haven't enrolled open it from the course page (CAT-6), to
 * decide whether to enrol. Their answers to questions in it are not checked or kept.
 */
const itemBase = {
  key: BlockIdSchema,
  title: z.string().max(160),
  required: z.boolean().default(true),
  /** Absent means no. */
  preview: z.boolean().optional(),
};
export const ItemAuthoringSchema = z.discriminatedUnion('type', [
  z.object({ ...itemBase, type: z.literal('lesson'), minutes: z.number().int().min(1).max(240), payload: LessonPayloadAuthoring }),
  z.object({ ...itemBase, type: z.literal('quiz'), minutes: z.number().int().min(1).max(240), gradeWeight: z.number().min(0).max(100).default(0), payload: QuizPayloadAuthoring }),
  z.object({ ...itemBase, type: z.literal('assignment'), minutes: z.number().int().min(1).max(600), gradeWeight: z.number().min(0).max(100).default(0), payload: AssignmentPayload }),
  z.object({ ...itemBase, type: z.literal('discussion'), minutes: z.number().int().min(1).max(240), payload: DiscussionPayload }),
]);
export type ItemAuthoring = z.infer<typeof ItemAuthoringSchema>;

/** What a learner receives for an item: answers stripped. */
export const ItemContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('lesson'), steps: z.array(LessonStepSchema) }),
  z.object({ type: z.literal('quiz'), intro: z.string(), passPct: z.number().int(), maxAttempts: z.number().int().nullable(), questions: z.array(QuizQuestionSchema) }),
  z.object({ type: z.literal('assignment') }).merge(AssignmentPayload),
  z.object({ type: z.literal('discussion') }).merge(DiscussionPayload),
]);
export type ItemContent = z.infer<typeof ItemContentSchema>;

export const ModuleAuthoringSchema = z.object({
  key: BlockIdSchema,
  title: z.string().max(160),
  summary: z.string().max(600),
  weekNo: z.number().int().min(1).max(60).nullable().default(null),
  items: z.array(ItemAuthoringSchema).min(1).max(30),
});

export const COURSE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const CourseLevelSchema = z.enum(COURSE_LEVELS);
export const COURSE_VISIBILITIES = ['public', 'org_private', 'unlisted'] as const;
export const CourseVisibilitySchema = z.enum(COURSE_VISIBILITIES);

/** Card artwork: two colours and a symbol, so courses look distinct without uploaded images. */
export const CoverSchema = z.object({
  from: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  to: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  symbol: z.string().max(4),
  /** Optional photo shown over the colours. */
  imageUrl: MediaImageUrlSchema.optional(),
  imageAlt: z.string().max(300).optional(),
  imageCredit: z.string().max(200).optional(),
}).superRefine((c, ctx) => {
  if (!c.imageUrl) return;
  // A photo needs words for people who can't see it, and its maker's credit.
  if (!c.imageAlt?.trim()) ctx.addIssue({ code: 'custom', path: ['imageAlt'], message: 'Describe the cover photo' });
  if (!c.imageCredit?.trim()) ctx.addIssue({ code: 'custom', path: ['imageCredit'], message: 'Credit the cover photo' });
});

export const InstructorSchema = z.object({
  name: z.string().max(120),
  title: z.string().max(160),
  bio: z.string().max(1200),
  /** Course staff (INSTR-1) carry a photo and their role on the course; course files usually do not. */
  photoUrl: MediaImageUrlSchema.nullable().optional(),
  role: z.enum(['lead', 'instructor', 'assistant']).optional(),
});

/**
 * A course as an author (or a seed) defines it. Without `modules` the course is listed as
 * "coming soon": its page shows the outline, and nobody can enrol yet.
 */
export const CourseAuthoringSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(80),
  title: z.string().max(160),
  subtitle: z.string().max(240),
  description: RichTextSchema,
  provider: z.string().max(120),
  level: CourseLevelSchema,
  language: z.string().max(12).default('en'),
  visibility: CourseVisibilitySchema.default('public'),
  creditHours: z.number().min(0).max(60),
  /** What learners will be able to do. */
  outcomes: z.array(z.string().max(240)).min(1).max(10),
  skills: z.array(z.string().max(60)).max(12),
  audience: z.string().max(600),
  prerequisites: z.string().max(600),
  /** The named Practical Output of the course (Dream Lab: Knowledge → Skill → Application → Artifact → Evidence). */
  practicalOutput: z.string().max(160).nullable(),
  cover: CoverSchema,
  /** A short introduction to the course, shown on its page and course home. */
  trailer: VideoRefSchema.optional(),
  instructors: z.array(InstructorSchema).max(6).default([]),
  modules: z.array(ModuleAuthoringSchema).max(20).optional(),
});
export type CourseAuthoring = z.infer<typeof CourseAuthoringSchema>;

// ---------- Authoring → delivery ----------

/** Deterministic PRNG from a string, so a learner sees the same shuffle every time they open an item. */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Shuffled copy that never equals the original order (when there are at least two elements). */
function shuffled<T extends { id: string }>(xs: readonly T[], seed: string): T[] {
  const random = seededRandom(seed);
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  if (a.length > 1 && a.every((x, i) => x.id === xs[i]!.id)) a.push(a.shift()!);
  return a;
}

/**
 * The one way to turn authored content into what a learner receives: answers, feedback and
 * outcomes removed, `order` items shuffled, `match` pairs split with the right side shuffled.
 * `seed` (e.g. enrolment id) keeps the shuffle stable for one learner.
 */
export function toDeliveryBlock(block: BlockAuthoring, seed: string): Block {
  switch (block.type) {
    case 'order':
      return { id: block.id, type: 'order', prompt: block.prompt, items: shuffled(block.items, `${seed}:${block.id}`) };
    case 'match':
      return {
        id: block.id,
        type: 'match',
        prompt: block.prompt,
        left: block.pairs.map((p) => ({ id: p.id, text: p.left })),
        right: shuffled(block.pairs.map((p) => ({ id: p.id, text: p.right })), `${seed}:${block.id}`),
      };
    default:
      return BlockSchema.parse(block);
  }
}

export function toDeliveryContent(item: ItemAuthoring, seed: string): ItemContent {
  switch (item.type) {
    case 'lesson':
      return {
        type: 'lesson',
        steps: item.payload.steps.map((s) => ({ id: s.id, title: s.title, blocks: s.blocks.map((b) => toDeliveryBlock(b, seed)) })),
      };
    case 'quiz':
      return {
        type: 'quiz',
        intro: item.payload.intro,
        passPct: item.payload.passPct,
        maxAttempts: item.payload.maxAttempts,
        questions: item.payload.questions.map((q) => QuizQuestionSchema.parse(toDeliveryBlock(q, seed))),
      };
    case 'assignment':
      return { type: 'assignment', ...item.payload };
    case 'discussion':
      return { type: 'discussion', ...item.payload };
  }
}

/**
 * Problems in a lesson's videos that the schema alone can't see: questions during a video must be
 * interactive blocks of the same step, used once, inside the video; chapters in time order.
 * Paths are relative to the step's blocks (e.g. "2.pauses.0.blockId").
 */
export function videoStepProblems(blocks: readonly { id: string; type: string; [k: string]: unknown }[]): { path: string; message: string }[] {
  const out: { path: string; message: string }[] = [];
  const interactive = new Set(blocks.filter((b) => isInteractiveBlock(b)).map((b) => b.id));
  const used = new Set<string>();
  blocks.forEach((b, i) => {
    if (b.type !== 'video') return;
    const duration = typeof b.durationS === 'number' ? b.durationS : null;
    // Only the part that plays counts: from startS (or 0) to endS (or the end).
    const from = typeof b.startS === 'number' ? b.startS : 0;
    const to = typeof b.endS === 'number' ? b.endS : duration;
    const outside = (at: number) => at < from || (to !== null && at >= to);
    const pauses = Array.isArray(b.pauses) ? (b.pauses as VideoPause[]) : [];
    pauses.forEach((p, k) => {
      const at = `${i}.pauses.${k}`;
      if (!interactive.has(p.blockId)) out.push({ path: `${at}.blockId`, message: 'Choose a question from this step' });
      else if (used.has(p.blockId)) out.push({ path: `${at}.blockId`, message: 'This question is already asked during a video' });
      used.add(p.blockId);
      if (outside(p.atS)) out.push({ path: `${at}.atS`, message: p.atS < from ? 'Before the part of the video that plays' : 'After the end of the video' });
    });
    const chapters = Array.isArray(b.chapters) ? (b.chapters as VideoChapter[]) : [];
    chapters.forEach((c, k) => {
      const prev = chapters[k - 1];
      if (prev && c.atS <= prev.atS) out.push({ path: `${i}.chapters.${k}.atS`, message: 'Chapters go in time order' });
      if (outside(c.atS) && !(k === 0 && c.atS === 0)) out.push({ path: `${i}.chapters.${k}.atS`, message: c.atS < from ? 'Before the part of the video that plays' : 'After the end of the video' });
    });
  });
  return out;
}
