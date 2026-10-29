import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { ErrorResponseSchema, TimestampSchema, UuidSchema } from './common';

const c = initContract();

const errors = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
  409: ErrorResponseSchema,
  503: ErrorResponseSchema,
} as const;

/*
 * Admissions (ADM-1, Plan v1.1 §8.1): a ten-stage pipeline per application. Applicants complete the
 * first six stages themselves; admissions staff run the last four. Every stage change is an
 * append-only transition with its actor. AI-assisted evaluations are immutable records that inform
 * reviewers; admission and scholarship decisions are always recorded human acts.
 */

export const ADMISSION_STAGES = [
  'eligibility',
  'application',
  'dream_application',
  'evidence',
  'assessment',
  'video',
  'interview',
  'scholarship',
  'committee',
  'decision',
] as const;
export const AdmissionStageSchema = z.enum(ADMISSION_STAGES);
export type AdmissionStage = z.infer<typeof AdmissionStageSchema>;

/** Stages the applicant completes, in order. */
export const APPLICANT_STAGES = ['eligibility', 'application', 'dream_application', 'evidence', 'assessment', 'video'] as const satisfies readonly AdmissionStage[];
export type ApplicantStage = (typeof APPLICANT_STAGES)[number];
/** Stages admissions staff run. */
export const STAFF_STAGES = ['interview', 'scholarship', 'committee', 'decision'] as const satisfies readonly AdmissionStage[];

export const ADMISSION_STAGE_LABELS: Record<AdmissionStage, string> = {
  eligibility: 'Eligibility',
  application: 'Application',
  dream_application: 'Dream Application',
  evidence: 'Evidence of Action',
  assessment: 'Builder Assessment',
  video: 'Video',
  interview: 'Interview',
  scholarship: 'Scholarship Review',
  committee: 'Committee',
  decision: 'Decision',
};

export const APPLICATION_STATUSES = ['in_progress', 'under_review', 'admitted', 'waitlisted', 'declined', 'withdrawn'] as const;
export const ApplicationStatusSchema = z.enum(APPLICATION_STATUSES);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

export const DECISION_OUTCOMES = ['admitted', 'waitlisted', 'declined'] as const;
export const DecisionOutcomeSchema = z.enum(DECISION_OUTCOMES);

/** The Builder Assessment's prompts, answered in writing. */
export const BUILDER_ASSESSMENT_PROMPTS = [
  { id: 'build', prompt: 'Describe something you built or started on your own initiative. What did you do first, and what happened?' },
  { id: 'setback', prompt: 'Tell us about a time something you were building failed or stalled. What did you change?' },
  { id: 'resource', prompt: 'With no money and one month, how would you test whether your idea solves a real problem?' },
  { id: 'people', prompt: 'Who have you persuaded to help you with something, and how?' },
  { id: 'learning', prompt: 'What is the most useful thing you taught yourself in the past year, and how did you learn it?' },
] as const;

const Text = (min: number, max: number) => z.string().trim().min(min, `At least ${min} characters`).max(max);
const WebLink = z.string().trim().url().max(500).regex(/^https?:\/\//i, 'A link starting with https://');

/** What the applicant writes at each of their stages. Drafts may be partial; submitting checks the full shape. */
export const StageAnswerSchemas = {
  eligibility: z.object({
    isAdult: z.literal(true, { errorMap: () => ({ message: 'Applicants must be 18 or older' }) }),
    country: Text(2, 80),
    educationLevel: z.enum(['secondary', 'diploma', 'undergraduate', 'graduate', 'other']),
    canCommitFullTime: z.literal(true, { errorMap: () => ({ message: 'The programme needs full-time commitment' }) }),
    hasDeviceAndInternet: z.literal(true, { errorMap: () => ({ message: 'You need a device and internet access to take part' }) }),
  }),
  application: z.object({
    city: Text(2, 80),
    occupation: Text(2, 120),
    motivation: Text(100, 2000),
    howHeard: Text(2, 200),
  }),
  dream_application: z.object({
    dream: Text(80, 3000),
    problem: Text(80, 3000),
    whoBenefits: Text(40, 2000),
    whyYou: Text(80, 3000),
  }),
  evidence: z.object({
    items: z
      .array(z.object({ title: Text(3, 160), description: Text(30, 1500), link: WebLink.nullable().default(null) }))
      .min(1, 'Add at least one piece of evidence')
      .max(5),
  }),
  assessment: z.object({
    answers: z.object(Object.fromEntries(BUILDER_ASSESSMENT_PROMPTS.map((p) => [p.id, Text(60, 2500)])) as Record<(typeof BUILDER_ASSESSMENT_PROMPTS)[number]['id'], ReturnType<typeof Text>>),
  }),
  video: z.object({
    url: WebLink,
    note: z.string().trim().max(500).default(''),
  }),
} as const satisfies Record<ApplicantStage, z.ZodTypeAny>;

/** Scoring dimensions, 1 (weak) to 5 (strong), shared by human reviews and AI evaluations. */
export const SCORING_DIMENSIONS = ['dream_clarity', 'problem_insight', 'evidence_of_action', 'builder_mindset', 'commitment', 'communication'] as const;
export const ScoringDimensionSchema = z.enum(SCORING_DIMENSIONS);
export const SCORING_DIMENSION_LABELS: Record<(typeof SCORING_DIMENSIONS)[number], string> = {
  dream_clarity: 'Clarity of the dream',
  problem_insight: 'Insight into the problem',
  evidence_of_action: 'Evidence of action',
  builder_mindset: 'Builder mindset',
  commitment: 'Commitment',
  communication: 'Communication',
};
export const DimensionScoresSchema = z.record(ScoringDimensionSchema, z.number().int().min(1).max(5));
export type DimensionScores = z.infer<typeof DimensionScoresSchema>;

/**
 * DBPI™ (Dream Builder Potential Index) and DSI™ (Dream Seriousness Index), 0–100: the mean of their
 * dimensions on the 1–5 scale, mapped to 0–100. Computed the same way for reviews and AI evaluations.
 */
export const DBPI_DIMENSIONS = ['problem_insight', 'evidence_of_action', 'builder_mindset'] as const;
export const DSI_DIMENSIONS = ['dream_clarity', 'commitment', 'communication'] as const;
export function compositeScores(scores: Partial<DimensionScores>): { dbpi: number | null; dsi: number | null } {
  const index = (dims: readonly string[]) => {
    const vals = dims.map((d) => scores[d as keyof DimensionScores]).filter((v): v is number => typeof v === 'number');
    return vals.length === dims.length ? Math.round(((vals.reduce((a, b) => a + b, 0) / vals.length - 1) / 4) * 100) : null;
  };
  return { dbpi: index(DBPI_DIMENSIONS), dsi: index(DSI_DIMENSIONS) };
}

export const AdmissionCycleStatusSchema = z.enum(['draft', 'open', 'closed']);
export const AdmissionCycleSchema = z.object({
  id: UuidSchema,
  orgId: UuidSchema,
  orgName: z.string(),
  name: z.string(),
  programSlug: z.string(),
  programTitle: z.string(),
  /** The cohort admitted applicants join; null until one is chosen. */
  cohortId: UuidSchema.nullable(),
  opensAt: TimestampSchema,
  closesAt: TimestampSchema,
  status: AdmissionCycleStatusSchema,
});
export type AdmissionCycle = z.infer<typeof AdmissionCycleSchema>;

export const CreateCycleSchema = z
  .object({
    name: Text(3, 120),
    programSlug: z.string().trim().min(3).max(80),
    cohortId: UuidSchema.nullable().default(null),
    opensAt: TimestampSchema,
    closesAt: TimestampSchema,
  })
  .refine((c) => Date.parse(c.closesAt) > Date.parse(c.opensAt), { message: 'The cycle must close after it opens', path: ['closesAt'] });
export const UpdateCycleSchema = z
  .object({
    name: Text(3, 120).optional(),
    cohortId: UuidSchema.nullable().optional(),
    opensAt: TimestampSchema.optional(),
    closesAt: TimestampSchema.optional(),
    status: AdmissionCycleStatusSchema.optional(),
  })
  .strict()
  .refine((c) => Object.keys(c).length > 0, 'Change at least one thing')
  .refine((c) => !c.opensAt || !c.closesAt || Date.parse(c.closesAt) > Date.parse(c.opensAt), { message: 'The cycle must close after it opens', path: ['closesAt'] });

export const StageTransitionSchema = z.object({
  from: AdmissionStageSchema.nullable(),
  to: AdmissionStageSchema,
  status: ApplicationStatusSchema,
  actor: z.object({ name: z.string(), isApplicant: z.boolean() }),
  note: z.string().nullable(),
  at: TimestampSchema,
});

export const ApplicationReviewSchema = z.object({
  id: UuidSchema,
  stage: AdmissionStageSchema,
  reviewer: z.string(),
  scores: DimensionScoresSchema,
  dbpi: z.number().nullable(),
  dsi: z.number().nullable(),
  recommendation: z.enum(['advance', 'hold', 'decline']),
  comment: z.string(),
  createdAt: TimestampSchema,
});
export type ApplicationReview = z.infer<typeof ApplicationReviewSchema>;

/** Immutable: what the model said, with the model and prompt version that said it. */
export const AiEvaluationSchema = z.object({
  id: UuidSchema,
  model: z.string(),
  promptVersion: z.string(),
  scores: DimensionScoresSchema,
  dbpi: z.number().nullable(),
  dsi: z.number().nullable(),
  rationale: z.string(),
  requestedBy: z.string(),
  createdAt: TimestampSchema,
});
export type AiEvaluation = z.infer<typeof AiEvaluationSchema>;

export const ApplicationSummarySchema = z.object({
  id: UuidSchema,
  cycle: AdmissionCycleSchema,
  stage: AdmissionStageSchema,
  status: ApplicationStatusSchema,
  applicant: z.object({ userId: UuidSchema, name: z.string() }),
  /** Latest review composites, for the pipeline board. */
  dbpi: z.number().nullable(),
  dsi: z.number().nullable(),
  updatedAt: TimestampSchema,
  createdAt: TimestampSchema,
});
export type ApplicationSummary = z.infer<typeof ApplicationSummarySchema>;

export const ApplicationSchema = ApplicationSummarySchema.extend({
  /** Answers per applicant stage (drafts included for the applicant). */
  answers: z.record(AdmissionStageSchema, z.record(z.unknown())),
  submitted: z.record(AdmissionStageSchema, TimestampSchema),
  transitions: z.array(StageTransitionSchema),
  /** Staff only (empty for the applicant). */
  reviews: z.array(ApplicationReviewSchema),
  aiEvaluations: z.array(AiEvaluationSchema),
  interview: z.object({ scheduledAt: TimestampSchema, interviewer: z.string().nullable(), notes: z.string() }).nullable(),
  scholarship: z.object({ percent: z.number().int().min(0).max(100), note: z.string(), decidedBy: z.string(), decidedAt: TimestampSchema }).nullable(),
  decision: z.object({ outcome: DecisionOutcomeSchema, note: z.string(), decidedBy: z.string(), decidedAt: TimestampSchema }).nullable(),
  /** What the caller may do now. */
  can: z.object({ edit: z.boolean(), review: z.boolean(), decide: z.boolean() }),
});
export type Application = z.infer<typeof ApplicationSchema>;

export const PipelineSchema = z.object({
  cycle: AdmissionCycleSchema,
  counts: z.record(AdmissionStageSchema, z.number().int()),
  statusCounts: z.record(ApplicationStatusSchema, z.number().int()),
  items: z.array(ApplicationSummarySchema),
});

export const ReviewRequestSchema = z.object({
  scores: DimensionScoresSchema.refine((s) => SCORING_DIMENSIONS.every((d) => typeof s[d] === 'number'), 'Score every dimension'),
  recommendation: z.enum(['advance', 'hold', 'decline']),
  comment: z.string().trim().min(10, 'Say why in a sentence or two').max(4000),
});
export const AdvanceRequestSchema = z.object({ note: z.string().trim().max(2000).nullable().default(null) });
export const InterviewRequestSchema = z.object({
  scheduledAt: TimestampSchema,
  interviewerUserId: UuidSchema.nullable().default(null),
  notes: z.string().trim().max(4000).default(''),
});
export const ScholarshipRequestSchema = z.object({ percent: z.number().int().min(0).max(100), note: z.string().trim().min(3).max(2000) });
export const DecisionRequestSchema = z.object({ outcome: DecisionOutcomeSchema, note: z.string().trim().min(3, 'Record the reason for the decision').max(2000) });

const AppParams = z.object({ applicationId: UuidSchema });
export const ApplicantStageSchema = z.enum(APPLICANT_STAGES);
const StageParams = z.object({ applicationId: UuidSchema, stage: ApplicantStageSchema });
const CycleParams = z.object({ cycleId: UuidSchema });

export const admissionsContract = c.router(
  {
    openCycles: {
      method: 'GET',
      path: '/admissions/cycles',
      query: z.object({ programSlug: z.string().max(80).optional() }),
      responses: { 200: z.object({ items: z.array(AdmissionCycleSchema) }), ...errors },
      summary: 'Admission cycles open for applications now (public)',
    },
    start: {
      method: 'POST',
      path: '/admissions/applications',
      body: z.object({ cycleId: UuidSchema }),
      responses: { 201: ApplicationSchema, ...errors },
      summary: 'Start (or resume) my application to a cycle',
    },
    mine: {
      method: 'GET',
      path: '/admissions/applications/mine',
      responses: { 200: z.object({ items: z.array(ApplicationSummarySchema) }), ...errors },
      summary: 'My applications',
    },
    get: {
      method: 'GET',
      path: '/admissions/applications/:applicationId',
      pathParams: AppParams,
      responses: { 200: ApplicationSchema, ...errors },
      summary: 'An application: the applicant’s own, or any in the organisation for admissions staff',
    },
    saveStage: {
      method: 'PUT',
      path: '/admissions/applications/:applicationId/stages/:stage',
      pathParams: StageParams,
      body: z.object({ answers: z.record(z.unknown()) }),
      responses: { 200: ApplicationSchema, ...errors },
      summary: 'Save a draft of the current stage’s answers (applicant)',
    },
    submitStage: {
      method: 'POST',
      path: '/admissions/applications/:applicationId/stages/:stage/submit',
      pathParams: StageParams,
      body: c.noBody(),
      responses: { 200: ApplicationSchema, ...errors },
      summary: 'Submit the current stage; the application moves to the next (applicant)',
    },
    withdraw: {
      method: 'POST',
      path: '/admissions/applications/:applicationId/withdraw',
      pathParams: AppParams,
      body: c.noBody(),
      responses: { 200: ApplicationSchema, ...errors },
      summary: 'Withdraw my application',
    },
    cycles: {
      method: 'GET',
      path: '/admissions/admin/cycles',
      responses: { 200: z.object({ items: z.array(AdmissionCycleSchema) }), ...errors },
      summary: 'The organisation’s admission cycles (admissions.manage or admissions.review)',
    },
    createCycle: {
      method: 'POST',
      path: '/admissions/admin/cycles',
      body: CreateCycleSchema,
      responses: { 201: AdmissionCycleSchema, ...errors },
      summary: 'Create an admission cycle for one of the organisation’s programmes (admissions.manage)',
    },
    updateCycle: {
      method: 'PATCH',
      path: '/admissions/admin/cycles/:cycleId',
      pathParams: CycleParams,
      body: UpdateCycleSchema,
      responses: { 200: AdmissionCycleSchema, ...errors },
      summary: 'Change a cycle: open or close it, dates, the cohort admitted applicants join (admissions.manage)',
    },
    pipeline: {
      method: 'GET',
      path: '/admissions/admin/cycles/:cycleId/pipeline',
      pathParams: CycleParams,
      query: z.object({ stage: AdmissionStageSchema.optional(), status: ApplicationStatusSchema.optional() }),
      responses: { 200: PipelineSchema, ...errors },
      summary: 'Applications in a cycle by stage, with counts (admissions.review)',
    },
    review: {
      method: 'POST',
      path: '/admissions/admin/applications/:applicationId/reviews',
      pathParams: AppParams,
      body: ReviewRequestSchema,
      responses: { 201: ApplicationSchema, ...errors },
      summary: 'Score the application on every dimension and recommend (admissions.review)',
    },
    aiEvaluate: {
      method: 'POST',
      path: '/admissions/admin/applications/:applicationId/ai-evaluations',
      pathParams: AppParams,
      body: c.noBody(),
      responses: { 201: ApplicationSchema, ...errors },
      summary: 'Ask the AI for an evaluation, stored immutably beside the human reviews (admissions.review)',
    },
    advance: {
      method: 'POST',
      path: '/admissions/admin/applications/:applicationId/advance',
      pathParams: AppParams,
      body: AdvanceRequestSchema,
      responses: { 200: ApplicationSchema, ...errors },
      summary: 'Move an application under review to its next stage (admissions.review)',
    },
    interview: {
      method: 'PUT',
      path: '/admissions/admin/applications/:applicationId/interview',
      pathParams: AppParams,
      body: InterviewRequestSchema,
      responses: { 200: ApplicationSchema, ...errors },
      summary: 'Schedule the interview and keep its notes (admissions.review)',
    },
    scholarship: {
      method: 'PUT',
      path: '/admissions/admin/applications/:applicationId/scholarship',
      pathParams: AppParams,
      body: ScholarshipRequestSchema,
      responses: { 200: ApplicationSchema, ...errors },
      summary: 'Record the scholarship award, 0–100% (admissions.decide)',
    },
    decide: {
      method: 'POST',
      path: '/admissions/admin/applications/:applicationId/decision',
      pathParams: AppParams,
      body: DecisionRequestSchema,
      responses: { 200: ApplicationSchema, ...errors },
      summary: 'Admit, waitlist or decline; admitted applicants join the cycle’s cohort (admissions.decide)',
    },
  },
  { strictStatusCodes: true },
);
