import { describe, expect, it } from 'vitest';
import {
  CalendarWeekSchema,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
  ProgramAuthoringSchema,
  SaveLearningGoalSchema,
  SendCheckInSchema,
  VideoManifestSchema,
  apiV1Contract,
} from '../src';

const goal = { why: 'I want my bakery to sell to three hotels by March.', studyDays: ['tue', 'sat'], minutesPerWeek: 120 };

describe('staying on track (LRN-9)', () => {
  it('accepts a goal and study plan in the learner’s own words', () => {
    expect(SaveLearningGoalSchema.safeParse({ ...goal, studyTime: '20:30', success: 'Three hotel orders' }).success).toBe(true);
  });

  it('refuses a goal that is too short, repeated days or too little time', () => {
    expect(SaveLearningGoalSchema.safeParse({ ...goal, why: 'to learn' }).success).toBe(false);
    expect(SaveLearningGoalSchema.safeParse({ ...goal, studyDays: ['tue', 'tue'] }).success).toBe(false);
    expect(SaveLearningGoalSchema.safeParse({ ...goal, studyDays: [] }).success).toBe(false);
    expect(SaveLearningGoalSchema.safeParse({ ...goal, minutesPerWeek: 10 }).success).toBe(false);
    expect(SaveLearningGoalSchema.safeParse({ ...goal, studyTime: '25:00' }).success).toBe(false);
  });

  it('sends a check-in to each person once, with a real message', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(SendCheckInSchema.safeParse({ userIds: [id], message: 'How is the week going?' }).success).toBe(true);
    expect(SendCheckInSchema.safeParse({ userIds: [id, id], message: 'How is the week going?' }).success).toBe(false);
    expect(SendCheckInSchema.safeParse({ userIds: [id], message: 'hi' }).success).toBe(false);
  });

  it('has a progress category people can switch off', () => {
    expect(NOTIFICATION_CATEGORIES).toContain('progress');
    expect(NOTIFICATION_CATEGORY_LABELS.progress).toMatch(/on track/);
  });

  it('treats calendar weeks as learning weeks unless they say catch-up', () => {
    const week = { weekNo: 4, startsOn: '2026-12-07', endsOn: '2026-12-13', phase: 'Design', focus: 'Catch up', majorOutput: '—' };
    expect(CalendarWeekSchema.parse(week).kind).toBe('learning');
    expect(CalendarWeekSchema.parse({ ...week, kind: 'catch_up' }).kind).toBe('catch_up');
  });

  it('keeps older programme files valid (no week kind) and accepts catch-up weeks', () => {
    const base = ProgramAuthoringSchema.shape.calendar.element;
    expect(base.parse({ weekNo: 1, phase: 'A', focus: 'B', majorOutput: 'C' }).kind).toBe('learning');
    expect(base.parse({ weekNo: 7, phase: 'A', focus: 'Catch up', majorOutput: '—', kind: 'catch_up' }).kind).toBe('catch_up');
  });

  it('keeps older video manifests valid and accepts sizes and an audio-only version', () => {
    const m = { id: '0f8fad5b-d9cb-469f-a165-70867728950e', durationS: 60, width: 1280, height: 720, hls: 'v1/master.m3u8', poster: 'p.jpg', thumbnail: 't.jpg', captions: [] };
    expect(VideoManifestSchema.safeParse(m).success).toBe(true);
    expect(VideoManifestSchema.safeParse({ ...m, renditions: [{ height: 360, bytes: 4_000_000 }], audio: { src: 'v1/audio.m4a', bytes: 500_000 } }).success).toBe(true);
  });

  it('serves the routes under the engagement router', () => {
    expect(apiV1Contract.engagement.cohortEngagement.path).toBe('/v1/learning/cohorts/:cohortId/engagement');
    expect(apiV1Contract.engagement.saveGoal.method).toBe('PUT');
  });
});
