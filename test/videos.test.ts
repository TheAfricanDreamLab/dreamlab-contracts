import { describe, expect, it } from 'vitest';
import {
  AddCommentSchema,
  BlockAuthoringSchema,
  CourseMediaUploadRequestSchema,
  CreateVideoSchema,
  draftIssues,
  ItemAuthoringSchema,
  OutlineItemSchema,
  parseCaptions,
  SaveCaptionsSchema,
  toDeliveryBlock,
  toVtt,
  videoBlockCount,
  videoBlockId,
  videoProblem,
  vttTime,
} from '../src';

const LIB = '0193f0c2-6c3e-7c1a-9c43-1d2e3f4a5b6c';

describe('video providers (CAT-6)', () => {
  it('checks each provider’s id', () => {
    expect(videoProblem({ provider: 'youtube', videoId: 'H0_yKBitO8M' })).toBeNull();
    expect(videoProblem({ provider: 'vimeo', videoId: '76979871' })).toBeNull();
    expect(videoProblem({ provider: 'vimeo', videoId: 'H0_yKBitO8M' })).toBe('Paste a Vimeo link');
    expect(videoProblem({ provider: 'library', videoId: LIB })).toBeNull();
    expect(videoProblem({ provider: 'library', videoId: '76979871' })).toBe('Choose a video from the library');
  });

  it('accepts chapters and questions during a video, and delivers them unchanged', () => {
    const block = BlockAuthoringSchema.parse({
      id: 'intro-video',
      type: 'video',
      provider: 'library',
      videoId: LIB,
      title: 'Welcome',
      channel: 'Dream Lab',
      chapters: [{ atS: 0, title: 'Start' }],
      pauses: [{ atS: 30, blockId: 'check-1' }],
    });
    expect(toDeliveryBlock(block, 'seed')).toMatchObject({ chapters: [{ atS: 0, title: 'Start' }], pauses: [{ atS: 30, blockId: 'check-1' }] });
  });

  it('accepts a download block and offers file uploads for it', () => {
    const block = BlockAuthoringSchema.safeParse({
      id: 'worksheet',
      type: 'download',
      title: 'Worksheet',
      path: '0193f0c2-6c3e-7c1a-9c43-1d2e3f4a5b6c'.replace(/^/, 'courses/0193f0c2-6c3e-7c1a-9c43-1d2e3f4a5b6c/') + '/worksheet.pdf',
      fileName: 'worksheet.pdf',
      size: 1000,
      contentType: 'application/pdf',
    });
    expect(block.success).toBe(true);
    expect(CourseMediaUploadRequestSchema.safeParse({ kind: 'file', fileName: 'a.pdf', contentType: 'application/pdf', size: 10 }).success).toBe(true);
    expect(CourseMediaUploadRequestSchema.safeParse({ kind: 'file', fileName: 'a.mp4', contentType: 'video/mp4', size: 10 }).success).toBe(false);
    expect(CourseMediaUploadRequestSchema.safeParse({ kind: 'image', fileName: 'a.pdf', contentType: 'application/pdf', size: 10 }).success).toBe(false);
  });
});

const course = (blocks: unknown[]) => ({
  slug: 'video-course',
  title: 'Video course',
  subtitle: 's',
  description: 'd',
  provider: 'p',
  level: 'beginner',
  creditHours: 1,
  outcomes: ['o'],
  skills: [],
  audience: 'a',
  prerequisites: 'none',
  practicalOutput: null,
  cover: { from: '#000000', to: '#ffffff', symbol: 'V' },
  modules: [{ key: 'm1', title: 'M', summary: 's', items: [{ key: 'l1', type: 'lesson', title: 'L', minutes: 5, payload: { steps: [{ id: 's1', blocks }] } }] }],
});
const video = (extra: Record<string, unknown>) => ({ id: 'v', type: 'video', provider: 'library', videoId: LIB, title: 'T', channel: 'C', durationS: 120, ...extra });
const choice = { id: 'check-1', type: 'choice', prompt: 'Q', options: [{ id: 'a', text: 'A', correct: true }, { id: 'b', text: 'B', correct: false }], explanation: 'E' };

describe('publishing checks for videos', () => {
  it('passes a video whose questions are in its step', () => {
    expect(draftIssues(course([video({ pauses: [{ atS: 30, blockId: 'check-1' }], chapters: [{ atS: 0, title: 'A' }, { atS: 60, title: 'B' }] }), choice]))).toEqual([]);
  });

  it('finds questions that are missing, repeated or after the end, and chapters out of order', () => {
    const issues = draftIssues(
      course([
        video({ pauses: [{ atS: 30, blockId: 'nope' }, { atS: 200, blockId: 'check-1' }], chapters: [{ atS: 60, title: 'B' }, { atS: 10, title: 'A' }] }),
        video({ id: 'v2', pauses: [{ atS: 10, blockId: 'check-1' }] }),
        choice,
      ]),
    ).map((i) => `${i.path}: ${i.message}`);
    expect(issues).toEqual([
      'modules.0.items.0.payload.steps.0.blocks.0.pauses.0.blockId: Choose a question from this step',
      'modules.0.items.0.payload.steps.0.blocks.0.pauses.1.atS: After the end of the video',
      'modules.0.items.0.payload.steps.0.blocks.0.chapters.1.atS: Chapters go in time order',
      'modules.0.items.0.payload.steps.0.blocks.1.pauses.0.blockId: This question is already asked during a video',
    ]);
  });
});

describe('free previews', () => {
  it('defaults items and outline entries to not previewable', () => {
    const item = ItemAuthoringSchema.parse({ key: 'l1', type: 'discussion', title: 'D', minutes: 5, payload: { prompt: 'P' } });
    expect(item.preview).toBe(false);
    expect(OutlineItemSchema.parse({ id: LIB, key: 'l1', type: 'lesson', title: 'L', minutes: 5, required: true }).preview).toBe(false);
  });
});

describe('captions', () => {
  it('reads WebVTT and SubRip, dropping styling', () => {
    const vtt = 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.500 align:start\n<v Ada>Hello <b>there</b></v>\n\n00:00:04.000 --> 00:00:05.000\nSecond';
    expect(parseCaptions(vtt)).toEqual([
      { startS: 1, endS: 3.5, text: 'Hello there' },
      { startS: 4, endS: 5, text: 'Second' },
    ]);
    const srt = '﻿1\r\n00:01:02,250 --> 00:01:04,000\r\nLine one\r\nLine two\r\n\r\n2\r\n00:01:05,000 --> 00:01:06,000\r\nNext\r\n';
    expect(parseCaptions(srt)).toEqual([
      { startS: 62.25, endS: 64, text: 'Line one\nLine two' },
      { startS: 65, endS: 66, text: 'Next' },
    ]);
    expect(() => parseCaptions('not captions')).toThrow(/No captions found/);
  });

  it('writes WebVTT that reads back the same, with markup escaped', () => {
    const cues = [{ startS: 3725.5, endS: 3727, text: 'a < b --> c & d' }];
    expect(vttTime(3725.5)).toBe('01:02:05.500');
    const vtt = toVtt(cues);
    expect(vtt).toContain('01:02:05.500 --> 01:02:07.000\na &lt; b --&gt; c &amp; d');
    expect(parseCaptions(vtt)).toEqual(cues);
  });

  it('refuses cues that end before they start', () => {
    expect(SaveCaptionsSchema.safeParse({ label: 'English', cues: [{ startS: 5, endS: 2, text: 'x' }] }).success).toBe(false);
  });
});

describe('library uploads', () => {
  it('splits a file into blocks with equal-length ids', () => {
    expect(videoBlockCount(1)).toBe(1);
    expect(videoBlockCount(8 * 1024 * 1024 + 1)).toBe(2);
    expect(videoBlockId(0)).toHaveLength(videoBlockId(123_456).length);
    expect(CreateVideoSchema.safeParse({ title: 'T', fileName: 'a.mov', contentType: 'video/quicktime', size: 3 * 1024 ** 3 }).success).toBe(false);
  });
});

describe('review comments', () => {
  it('anchors a comment to a block', () => {
    expect(AddCommentSchema.parse({ anchor: { moduleKey: 'm1', itemKey: 'l1', blockId: 'v', label: 'Video' }, body: ' Check this ' })).toEqual({
      anchor: { moduleKey: 'm1', itemKey: 'l1', blockId: 'v', label: 'Video' },
      body: 'Check this',
    });
  });
});
