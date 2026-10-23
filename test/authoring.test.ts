import { describe, expect, it } from 'vitest';
import { apiV1Contract, CreateDraftSchema, draftIssues, permissionsForRole, SaveDraftSchema } from '../src';

const lesson = { key: 'welcome', type: 'lesson', title: 'Welcome', minutes: 5, payload: { steps: [{ id: 'hello', blocks: [{ id: 'intro', type: 'text', body: 'Hello.' }] }] } };
const course = {
  slug: 'my-course',
  title: 'My course',
  subtitle: 'A short one',
  description: 'What it is about.',
  provider: 'Kano Studio',
  level: 'beginner',
  creditHours: 1,
  outcomes: ['Do the thing'],
  skills: [],
  audience: 'Everyone',
  prerequisites: 'None',
  practicalOutput: null,
  cover: { from: '#123456', to: '#654321', symbol: 'M' },
};

describe('authoring', () => {
  it('starts a draft from an existing course or a new slug and title', () => {
    expect(CreateDraftSchema.safeParse({ courseSlug: 'problem-solving' }).success).toBe(true);
    expect(CreateDraftSchema.safeParse({ slug: 'my-course', title: 'My course' }).success).toBe(true);
    expect(CreateDraftSchema.safeParse({ slug: 'My Course', title: 'My course' }).success).toBe(false);
    expect(CreateDraftSchema.safeParse({ courseSlug: 'x-y-z', slug: 'a-b-c', title: 'Both' }).success).toBe(false);
  });

  it('saves any object with the revision it was based on', () => {
    expect(SaveDraftSchema.safeParse({ revision: 3, doc: { title: 'Half done' } }).success).toBe(true);
    expect(SaveDraftSchema.safeParse({ revision: -1, doc: {} }).success).toBe(false);
  });

  it('lists what stops a document being published, with readable paths', () => {
    expect(draftIssues(course)).toEqual([{ path: 'modules', message: 'Add at least one module with an item before publishing' }]);
    const withLesson = { ...course, modules: [{ key: 'start', title: 'Start', summary: 'First steps', items: [lesson] }] };
    expect(draftIssues(withLesson)).toEqual([]);
    const broken = { ...withLesson, modules: [{ ...withLesson.modules[0], items: [{ ...lesson, title: 42 }] }] };
    expect(draftIssues(broken)).toEqual([expect.objectContaining({ path: 'modules.0.items.0.title' })]);
  });

  it('lets org admins author and publish their organisation’s courses; authors only author', () => {
    expect(permissionsForRole('org_admin')).toEqual(expect.arrayContaining(['course.content.edit', 'course.publish']));
    expect(permissionsForRole('author')).toContain('course.content.edit');
    expect(permissionsForRole('author')).not.toContain('course.publish');
  });

  it('serves authoring under /v1/catalog', () => {
    expect(Object.values(apiV1Contract.authoring).every((r) => r.path.startsWith('/v1/catalog/authoring'))).toBe(true);
  });
});
