import { describe, expect, it } from 'vitest';
import {
  CourseMediaUploadRequestSchema,
  MediaImageUrlSchema,
  NotificationPreferencesSchema,
  SubmissionFileUploadRequestSchema,
  VideoRefSchema,
  videoProblem,
} from '../src';

const org = '0b5c8a52-3f1e-4c2a-9d7e-1a2b3c4d5e6f';
const file = '7d9e0f11-2233-4455-8899-aabbccddeeff';

describe('course media', () => {
  it('accepts uploaded images under /media and the listed hosts only', () => {
    expect(MediaImageUrlSchema.safeParse(`/media/courses/${org}/${file}/cover.jpg`).success).toBe(true);
    expect(MediaImageUrlSchema.safeParse('https://images.unsplash.com/photo-1').success).toBe(true);
    expect(MediaImageUrlSchema.safeParse('/media/../secrets').success).toBe(false);
    expect(MediaImageUrlSchema.safeParse('https://evil.example/x.png').success).toBe(false);
  });

  it('takes YouTube ids or uploaded files, and checks the two agree', () => {
    const base = { title: 'Intro', channel: 'Dream Lab' };
    expect(VideoRefSchema.safeParse({ ...base, provider: 'youtube', videoId: 'dQw4w9WgXcQ' }).success).toBe(true);
    expect(VideoRefSchema.safeParse({ ...base, provider: 'file', videoId: `courses/${org}/${file}/intro.mp4` }).success).toBe(true);
    expect(videoProblem({ provider: 'file', videoId: 'dQw4w9WgXcQ' })).toMatch(/Upload/);
    expect(videoProblem({ provider: 'youtube', videoId: `courses/${org}/${file}/intro.mp4` })).toMatch(/YouTube/);
  });

  it('limits upload types and sizes', () => {
    expect(CourseMediaUploadRequestSchema.safeParse({ kind: 'image', fileName: 'a.png', contentType: 'image/png', size: 1000 }).success).toBe(true);
    expect(CourseMediaUploadRequestSchema.safeParse({ kind: 'image', fileName: 'a.mp4', contentType: 'video/mp4', size: 1000 }).success).toBe(false);
    expect(CourseMediaUploadRequestSchema.safeParse({ kind: 'image', fileName: 'a.png', contentType: 'image/png', size: 6 * 1024 * 1024 }).success).toBe(false);
    expect(SubmissionFileUploadRequestSchema.safeParse({ fileName: '../x.pdf', contentType: 'application/pdf', size: 10 }).success).toBe(false);
    expect(SubmissionFileUploadRequestSchema.safeParse({ fileName: 'x.exe', contentType: 'application/x-msdownload', size: 10 }).success).toBe(false);
  });
});

describe('notification preferences', () => {
  it('accepts known categories only', () => {
    expect(NotificationPreferencesSchema.safeParse({ email: { grades: true, sessions: false } }).success).toBe(true);
    expect(NotificationPreferencesSchema.safeParse({ email: { spam: true } }).success).toBe(false);
  });
});
