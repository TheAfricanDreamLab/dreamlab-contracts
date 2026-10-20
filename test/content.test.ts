import { describe, expect, it } from 'vitest';
import { BlockAuthoringSchema, CoverSchema, BlockSchema, CourseAuthoringSchema, ItemContentSchema, PERMISSIONS, toDeliveryBlock } from '../src';

const choice = {
  id: 'pick-one',
  type: 'choice',
  prompt: 'Which is a problem statement?',
  options: [
    { id: 'a', text: 'We need an app', correct: false, feedback: 'That is a solution.' },
    { id: 'b', text: 'Traders lose a third of their tomatoes before market', correct: true },
  ],
  explanation: 'A problem statement describes the gap, not the fix.',
};

describe('content', () => {
  it('accepts authored blocks with answers', () => {
    expect(BlockAuthoringSchema.parse(choice)).toMatchObject({ multiple: false });
  });

  it('strips answers and feedback when parsed for delivery', () => {
    const delivered = BlockSchema.parse(BlockAuthoringSchema.parse(choice));
    const json = JSON.stringify(delivered);
    expect(json).not.toContain('correct');
    expect(json).not.toContain('feedback');
    expect(json).not.toContain('explanation');
  });

  it('strips scenario outcomes for delivery', () => {
    const scenario = BlockAuthoringSchema.parse({
      id: 'market',
      type: 'scenario',
      situation: 'Your cooperative’s sales fell.',
      prompt: 'What do you do first?',
      options: [
        { id: 'ask', text: 'Ask buyers why', outcome: 'You learn the price rose.', best: true },
        { id: 'cut', text: 'Cut prices', outcome: 'Margins vanish.' },
      ],
    });
    expect(JSON.stringify(BlockSchema.parse(scenario))).not.toContain('outcome');
  });

  it('delivers a quiz without answers', () => {
    const quiz = ItemContentSchema.parse({ type: 'quiz', intro: 'Check yourself', passPct: 70, maxAttempts: null, questions: [choice] });
    expect(JSON.stringify(quiz)).not.toContain('correct');
  });

  it('allows a coming-soon course without modules', () => {
    const course = CourseAuthoringSchema.parse({
      slug: 'critical-thinking',
      title: 'Critical Thinking',
      subtitle: 'Reason well',
      description: 'Soon.',
      provider: 'The African Dream Lab',
      level: 'beginner',
      creditHours: 5,
      outcomes: ['Spot weak arguments'],
      skills: [],
      audience: 'Everyone',
      prerequisites: 'None',
      practicalOutput: null,
      cover: { from: '#0A3D29', to: '#1F7A55', symbol: '◆' },
    });
    expect(course.modules).toBeUndefined();
  });

  it('shuffles order blocks for delivery, stably per seed, never in the correct order', () => {
    const order = BlockAuthoringSchema.parse({
      id: 'steps',
      type: 'order',
      prompt: 'Put the steps in order',
      items: [{ id: 'define', text: 'Define' }, { id: 'diagnose', text: 'Diagnose' }, { id: 'generate', text: 'Generate' }],
      explanation: 'Define first.',
    });
    const a = toDeliveryBlock(order, 'enrolment-1');
    expect(a).toEqual(toDeliveryBlock(order, 'enrolment-1'));
    expect(a.type === 'order' && a.items.map((i) => i.id)).not.toEqual(['define', 'diagnose', 'generate']);
    expect(JSON.stringify(a)).not.toContain('explanation');
  });

  it('splits match pairs for delivery and shuffles the right side', () => {
    const match = BlockAuthoringSchema.parse({
      id: 'terms',
      type: 'match',
      prompt: 'Match',
      pairs: [{ id: 'a', left: 'Symptom', right: 'What you see' }, { id: 'b', left: 'Cause', right: 'Why it happens' }],
      explanation: 'x',
    });
    const d = toDeliveryBlock(match, 'seed');
    expect(d.type).toBe('match');
    if (d.type !== 'match') return;
    expect(d.left.map((l) => l.id)).toEqual(['a', 'b']);
    expect(d.right.map((r) => r.id)).toEqual(['b', 'a']);
    expect(BlockSchema.parse(d)).toEqual(d);
  });

  it('accepts YouTube videos and images from the allowed hosts only', () => {
    expect(BlockAuthoringSchema.parse({ id: 'intro', type: 'video', provider: 'youtube', videoId: 'dQw4w9WgXcQ', title: 'Intro', channel: 'A channel' })).toMatchObject({ type: 'video' });
    expect(BlockSchema.safeParse({ id: 'v', type: 'video', provider: 'youtube', videoId: 'bad', title: 't', channel: 'c' }).success).toBe(false);
    const image = { id: 'market', type: 'image', alt: 'A market in Kano', credit: 'Photo: Unsplash' };
    expect(BlockSchema.safeParse({ ...image, url: 'https://images.unsplash.com/photo-1?w=1200' }).success).toBe(true);
    expect(BlockSchema.safeParse({ ...image, url: 'https://evil.example.com/x.jpg' }).success).toBe(false);
    expect(BlockSchema.safeParse({ ...image, url: 'http://images.unsplash.com/photo-1' }).success).toBe(false);
  });

  it('needs alt text and a credit for a cover photo', () => {
    const cover = { from: '#0A3D29', to: '#1F9D6B', symbol: '◆', imageUrl: 'https://images.unsplash.com/photo-1?w=1200' };
    expect(CoverSchema.safeParse(cover).success).toBe(false);
    expect(CoverSchema.safeParse({ ...cover, imageAlt: 'A busy market', imageCredit: 'Photo: Unsplash' }).success).toBe(true);
    expect(CoverSchema.safeParse({ from: '#0A3D29', to: '#1F9D6B', symbol: '◆' }).success).toBe(true);
  });

  it('adds the platform admin permissions', () => {
    expect(PERMISSIONS).toEqual(expect.arrayContaining(['platform.users.read', 'platform.users.manage', 'platform.catalog.manage']));
  });
});
