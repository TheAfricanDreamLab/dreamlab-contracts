import { describe, expect, it } from 'vitest';
import { BlockAuthoringSchema, BlockSchema, CourseAuthoringSchema, ItemContentSchema, PERMISSIONS } from '../src';

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

  it('adds the platform admin permissions', () => {
    expect(PERMISSIONS).toEqual(expect.arrayContaining(['platform.users.read', 'platform.users.manage', 'platform.catalog.manage']));
  });
});
