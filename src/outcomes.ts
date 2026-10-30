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
} as const;

/*
 * Outcomes (Slice 3, Plan v1.1 §3): the Dream Residency workspace (CAP-1), the 12-month action plan,
 * the Dream Score™ (SCORE-1), the graduation checklist (GRAD-1), the Dream Portfolio (PORT-1) and
 * credentials (CRED-1). Two scores, never conflated: the Programme Score is academic and
 * credit-weighted (courses and residency stages); the Dream Score is a competency radar that informs
 * and gates nothing. Graduation gates on the ten requirements, each confirmed by faculty.
 */

const Text = (max: number) => z.string().trim().max(max);
const WebLink = z.string().trim().url().max(500).regex(/^https?:\/\//i, 'A link starting with https://');

// ---------- Dream Residency (CAP-1) ----------

export const RESIDENCY_STATUSES = ['not_started', 'draft', 'submitted', 'changes_requested', 'approved'] as const;
export const ResidencyStatusSchema = z.enum(RESIDENCY_STATUSES);
export type ResidencyStatus = z.infer<typeof ResidencyStatusSchema>;

export const ResidencyStageSchema = z.object({
  /** 1–7, the programme's capstone stage order. */
  position: z.number().int().min(1),
  name: z.string(),
  outputDocument: z.string(),
  creditHours: z.number(),
  summary: z.string(),
  status: ResidencyStatusSchema,
  /** The learner's output document: the text itself and links to evidence. */
  document: z.object({ text: z.string(), links: z.array(z.object({ label: z.string(), url: z.string() })) }),
  submittedAt: TimestampSchema.nullable(),
  /** Faculty review: a score once approved, feedback either way. */
  review: z
    .object({ decision: z.enum(['approved', 'changes_requested']), scorePct: z.number().min(0).max(100).nullable(), feedback: z.string(), reviewer: z.string(), reviewedAt: TimestampSchema })
    .nullable(),
});
export type ResidencyStage = z.infer<typeof ResidencyStageSchema>;

export const ResidencySchema = z.object({
  programEnrollmentId: UuidSchema,
  learner: z.object({ userId: UuidSchema, name: z.string() }),
  cohortName: z.string(),
  stages: z.array(ResidencyStageSchema),
  /** Credits from approved stages, of the residency's total. */
  creditsEarned: z.number(),
  creditsTotal: z.number(),
  /** What the caller may do: the learner edits; the cohort's faculty review. */
  can: z.object({ edit: z.boolean(), review: z.boolean() }),
});
export type Residency = z.infer<typeof ResidencySchema>;

export const SaveResidencyStageSchema = z.object({
  text: Text(30_000),
  links: z.array(z.object({ label: Text(120).min(1), url: WebLink })).max(10).default([]),
});

export const ReviewResidencyStageSchema = z
  .object({
    decision: z.enum(['approved', 'changes_requested']),
    scorePct: z.number().min(0).max(100).nullable().default(null),
    feedback: z.string().trim().min(10, 'Say why in a sentence or two').max(5000),
  })
  .refine((r) => r.decision !== 'approved' || r.scorePct !== null, { message: 'Approving a stage needs a score', path: ['scorePct'] });

/** One row per learner on the cohort's residency board. */
export const ResidencyBoardSchema = z.object({
  stages: z.array(z.object({ position: z.number().int(), name: z.string(), creditHours: z.number() })),
  learners: z.array(
    z.object({
      programEnrollmentId: UuidSchema,
      userId: UuidSchema,
      name: z.string(),
      statuses: z.array(ResidencyStatusSchema),
      creditsEarned: z.number(),
    }),
  ),
});

// ---------- 12-month action plan ----------

export const ACTION_PLAN_STATUSES = ['draft', 'submitted', 'changes_requested', 'approved'] as const;
export const ActionPlanStatusSchema = z.enum(ACTION_PLAN_STATUSES);

export const ActionPlanBodySchema = z.object({
  /** Where the venture or work will be in twelve months. */
  vision: Text(3000),
  milestones: z
    .array(z.object({ month: z.number().int().min(1).max(12), milestone: Text(300).min(3), measure: Text(300).min(3) }))
    .max(24),
  resources: Text(3000),
  risks: Text(3000),
});
export type ActionPlanBody = z.infer<typeof ActionPlanBodySchema>;

export const ActionPlanSchema = ActionPlanBodySchema.extend({
  status: ActionPlanStatusSchema,
  submittedAt: TimestampSchema.nullable(),
  review: z.object({ decision: z.enum(['approved', 'changes_requested']), feedback: z.string(), reviewer: z.string(), reviewedAt: TimestampSchema }).nullable(),
  can: z.object({ edit: z.boolean(), review: z.boolean() }),
});
export type ActionPlan = z.infer<typeof ActionPlanSchema>;

/** Submitting checks the full shape: a vision, at least three milestones, resources and risks. */
export const SubmittableActionPlanSchema = ActionPlanBodySchema.extend({
  vision: Text(3000).min(80, 'Describe where you will be in a year (at least 80 characters)'),
  milestones: ActionPlanBodySchema.shape.milestones.min(3, 'Plan at least three milestones'),
  resources: Text(3000).min(20, 'Say what you need'),
  risks: Text(3000).min(20, 'Name the biggest risks'),
});

export const ReviewActionPlanSchema = z.object({ decision: z.enum(['approved', 'changes_requested']), feedback: z.string().trim().min(10).max(5000) });

// ---------- Dream Score (SCORE-1) ----------

/** The ten default competency dimensions. Organisations change their weights, not their keys. */
export const DREAM_SCORE_DIMENSIONS = [
  'vision',
  'problem_solving',
  'character',
  'communication',
  'negotiation',
  'financial',
  'collaboration',
  'execution',
  'resilience',
  'digital',
] as const;
export const DreamScoreDimensionSchema = z.enum(DREAM_SCORE_DIMENSIONS);
export type DreamScoreDimension = z.infer<typeof DreamScoreDimensionSchema>;
export const DREAM_SCORE_DIMENSION_LABELS: Record<DreamScoreDimension, string> = {
  vision: 'Vision',
  problem_solving: 'Problem Solving',
  character: 'Character and Ethics',
  communication: 'Communication',
  negotiation: 'Negotiation and Influence',
  financial: 'Financial Intelligence',
  collaboration: 'Collaboration',
  execution: 'Execution',
  resilience: 'Resilience',
  digital: 'Digital Fluency',
};

/** Weights in percent, one per dimension, totalling 100. */
export const DreamScoreWeightsSchema = z
  .record(DreamScoreDimensionSchema, z.number().int().min(0).max(100))
  .refine((w) => DREAM_SCORE_DIMENSIONS.every((d) => typeof w[d] === 'number'), 'Weight every dimension')
  .refine((w) => Object.values(w).reduce((a, b) => a + (b ?? 0), 0) === 100, 'Weights must total 100%');
export type DreamScoreWeights = Record<DreamScoreDimension, number>;
export const DEFAULT_DREAM_SCORE_WEIGHTS: DreamScoreWeights = Object.fromEntries(DREAM_SCORE_DIMENSIONS.map((d) => [d, 10])) as DreamScoreWeights;

export const DREAM_SCORE_SOURCES = ['course_grade', 'residency_stage', 'mentor_meeting', 'attendance'] as const;
export const DreamScoreSourceSchema = z.enum(DREAM_SCORE_SOURCES);

/** One piece of evidence (append-only): what it was, which dimension it fed and its value (0–10). */
export const DreamScoreEventSchema = z.object({
  dimension: DreamScoreDimensionSchema,
  value: z.number().min(0).max(10),
  source: DreamScoreSourceSchema,
  /** "Negotiation graded 82%", "Solution Design approved at 86%". */
  label: z.string(),
  at: TimestampSchema,
});

export const DreamScoreSchema = z.object({
  programEnrollmentId: UuidSchema,
  /** Weighted mean of the dimensions that have evidence, 0–10 (one decimal); null before any evidence. */
  overall: z.number().min(0).max(10).nullable(),
  dimensions: z.array(
    z.object({ key: DreamScoreDimensionSchema, label: z.string(), weight: z.number().int(), score: z.number().min(0).max(10).nullable(), evidence: z.number().int() }),
  ),
  /** Weekly snapshots, oldest first: Learning (courses), Building (residency), Dream (overall). */
  growth: z.array(
    z.object({ weekNo: z.number().int(), learning: z.number().nullable(), building: z.number().nullable(), dream: z.number().nullable() }),
  ),
  /** The latest evidence, newest first: what moved the score. */
  recent: z.array(DreamScoreEventSchema),
});
export type DreamScore = z.infer<typeof DreamScoreSchema>;

// ---------- Graduation (GRAD-1) ----------

export const GraduationRequirementStatusSchema = z.object({
  key: z.string(),
  label: z.string(),
  /** What the platform can see for this requirement: "82 of 100 credits", "6 of 8 sections". */
  evidence: z.string(),
  /** The platform's own reading of the evidence; faculty decide. */
  evidenceMet: z.boolean(),
  confirmed: z.object({ by: z.string(), at: TimestampSchema, note: z.string() }).nullable(),
});

export const GraduationSchema = z.object({
  programEnrollmentId: UuidSchema,
  learner: z.object({ userId: UuidSchema, name: z.string() }),
  cohortName: z.string(),
  creditsEarned: z.number(),
  creditsTotal: z.number(),
  programmeScore: z.number().min(0).max(100).nullable(),
  requirements: z.array(GraduationRequirementStatusSchema),
  /** All requirements confirmed: the cohort's managers may graduate the learner. */
  eligible: z.boolean(),
  graduatedAt: TimestampSchema.nullable(),
  credentialCode: z.string().nullable(),
  can: z.object({ confirm: z.boolean(), graduate: z.boolean() }),
});
export type Graduation = z.infer<typeof GraduationSchema>;

export const GraduationBoardSchema = z.object({
  requirements: z.array(z.object({ key: z.string(), label: z.string() })),
  learners: z.array(
    z.object({
      programEnrollmentId: UuidSchema,
      userId: UuidSchema,
      name: z.string(),
      confirmed: z.number().int(),
      evidenceMet: z.number().int(),
      creditsEarned: z.number(),
      graduatedAt: TimestampSchema.nullable(),
    }),
  ),
});

export const ConfirmRequirementSchema = z.object({ confirmed: z.boolean(), note: z.string().trim().max(1000).default('') });

// ---------- Dream Portfolio (PORT-1) ----------

export const PORTFOLIO_SECTIONS = ['my_dream', 'life_architecture', 'course_artifacts', 'competencies', 'dream_residency', 'final_demonstration', 'dream_score', 'action_plan'] as const;
export const PortfolioSectionKeySchema = z.enum(PORTFOLIO_SECTIONS);
export const PORTFOLIO_SECTION_LABELS: Record<(typeof PORTFOLIO_SECTIONS)[number], string> = {
  my_dream: 'My Dream',
  life_architecture: 'Life Architecture',
  course_artifacts: 'Course Artifacts',
  competencies: 'Competencies',
  dream_residency: 'Dream Residency',
  final_demonstration: 'Final Demonstration',
  dream_score: 'Dream Score',
  action_plan: '12-Month Action Plan',
};

const PortfolioEntry = z.object({ title: z.string(), detail: z.string(), scorePct: z.number().nullable(), text: z.string().nullable(), links: z.array(z.object({ label: z.string(), url: z.string() })) });

/** Assembled from approved work only; a section is complete once it has what it needs. */
export const PortfolioSchema = z.object({
  learner: z.object({ name: z.string() }),
  programTitle: z.string(),
  cohortName: z.string(),
  hostOrgName: z.string(),
  programmeScore: z.number().nullable(),
  creditsEarned: z.number(),
  sections: z.array(z.object({ key: PortfolioSectionKeySchema, label: z.string(), complete: z.boolean(), entries: z.array(PortfolioEntry) })),
  dreamScore: DreamScoreSchema.omit({ recent: true, programEnrollmentId: true }),
  graduatedAt: TimestampSchema.nullable(),
  credentialCode: z.string().nullable(),
  /** The public link's token, for the owner only (null when not shared, and on the public view). */
  shareToken: z.string().nullable(),
});
export type Portfolio = z.infer<typeof PortfolioSchema>;

// ---------- Credentials (CRED-1) ----------

export const CREDENTIAL_KINDS = ['programme_graduation', 'course_completion'] as const;
export const CredentialKindSchema = z.enum(CREDENTIAL_KINDS);

/** What anyone can check at /verify/<code>. */
export const CredentialSchema = z.object({
  code: z.string(),
  kind: CredentialKindSchema,
  recipientName: z.string(),
  title: z.string(),
  issuerName: z.string(),
  issuedAt: TimestampSchema,
  /** Programme Score or course final score at issue, when there is one. */
  scorePct: z.number().nullable(),
  creditHours: z.number().nullable(),
  revoked: z.object({ at: TimestampSchema, reason: z.string() }).nullable(),
});
export type Credential = z.infer<typeof CredentialSchema>;

export const RevokeCredentialSchema = z.object({ reason: z.string().trim().min(5).max(500) });

// ---------- routes ----------

const Enrollment = z.object({ enrollmentId: UuidSchema });
const EnrollmentStage = z.object({ enrollmentId: UuidSchema, position: z.coerce.number().int().min(1).max(20) });
const Cohort = z.object({ cohortId: UuidSchema });
const Requirement = z.object({ enrollmentId: UuidSchema, key: z.string().regex(/^[a-z0-9_]{2,60}$/) });

export const outcomesContract = c.router(
  {
    // residency
    residency: {
      method: 'GET',
      path: '/learning/programs/enrollments/:enrollmentId/residency',
      pathParams: Enrollment,
      responses: { 200: ResidencySchema, ...errors },
      summary: 'A learner’s Dream Residency: the seven stages and their output documents (the learner, or the cohort’s faculty)',
    },
    saveResidencyStage: {
      method: 'PUT',
      path: '/learning/programs/enrollments/:enrollmentId/residency/:position',
      pathParams: EnrollmentStage,
      body: SaveResidencyStageSchema,
      responses: { 200: ResidencySchema, ...errors },
      summary: 'Save a stage’s output document as a draft (the learner)',
    },
    submitResidencyStage: {
      method: 'POST',
      path: '/learning/programs/enrollments/:enrollmentId/residency/:position/submit',
      pathParams: EnrollmentStage,
      body: c.noBody(),
      responses: { 200: ResidencySchema, ...errors },
      summary: 'Submit a stage for faculty review (the learner)',
    },
    reviewResidencyStage: {
      method: 'POST',
      path: '/learning/programs/enrollments/:enrollmentId/residency/:position/review',
      pathParams: EnrollmentStage,
      body: ReviewResidencyStageSchema,
      responses: { 200: ResidencySchema, ...errors },
      summary: 'Approve a submitted stage with a score, or ask for changes (the cohort’s faculty)',
    },
    residencyBoard: {
      method: 'GET',
      path: '/learning/cohorts/:cohortId/residency',
      pathParams: Cohort,
      responses: { 200: ResidencyBoardSchema, ...errors },
      summary: 'Every learner’s residency stages in a cohort (the cohort’s faculty)',
    },
    // action plan
    actionPlan: {
      method: 'GET',
      path: '/learning/programs/enrollments/:enrollmentId/action-plan',
      pathParams: Enrollment,
      responses: { 200: ActionPlanSchema, ...errors },
      summary: 'A learner’s 12-month action plan (the learner, or the cohort’s faculty)',
    },
    saveActionPlan: {
      method: 'PUT',
      path: '/learning/programs/enrollments/:enrollmentId/action-plan',
      pathParams: Enrollment,
      body: ActionPlanBodySchema,
      responses: { 200: ActionPlanSchema, ...errors },
      summary: 'Save the action plan as a draft (the learner)',
    },
    submitActionPlan: {
      method: 'POST',
      path: '/learning/programs/enrollments/:enrollmentId/action-plan/submit',
      pathParams: Enrollment,
      body: c.noBody(),
      responses: { 200: ActionPlanSchema, ...errors },
      summary: 'Submit the action plan for approval (the learner)',
    },
    reviewActionPlan: {
      method: 'POST',
      path: '/learning/programs/enrollments/:enrollmentId/action-plan/review',
      pathParams: Enrollment,
      body: ReviewActionPlanSchema,
      responses: { 200: ActionPlanSchema, ...errors },
      summary: 'Approve the action plan or ask for changes (the cohort’s faculty)',
    },
    // Dream Score
    dreamScore: {
      method: 'GET',
      path: '/learning/programs/enrollments/:enrollmentId/dream-score',
      pathParams: Enrollment,
      responses: { 200: DreamScoreSchema, ...errors },
      summary: 'A learner’s Dream Score: ten dimensions, weekly growth and what moved it (the learner, or the cohort’s staff)',
    },
    dreamScoreWeights: {
      method: 'GET',
      path: '/learning/dream-score/weights',
      responses: { 200: z.object({ weights: z.record(DreamScoreDimensionSchema, z.number().int()) }), ...errors },
      summary: 'The organisation’s Dream Score dimension weights (cohort.manage)',
    },
    setDreamScoreWeights: {
      method: 'PUT',
      path: '/learning/dream-score/weights',
      body: z.object({ weights: DreamScoreWeightsSchema }),
      responses: { 200: z.object({ weights: z.record(DreamScoreDimensionSchema, z.number().int()) }), ...errors },
      summary: 'Change the organisation’s Dream Score weights; they must total 100% (cohort.manage)',
    },
    // graduation
    graduation: {
      method: 'GET',
      path: '/learning/programs/enrollments/:enrollmentId/graduation',
      pathParams: Enrollment,
      responses: { 200: GraduationSchema, ...errors },
      summary: 'A learner’s graduation checklist: the ten requirements, their evidence and confirmations',
    },
    confirmRequirement: {
      method: 'PUT',
      path: '/learning/programs/enrollments/:enrollmentId/graduation/:key',
      pathParams: Requirement,
      body: ConfirmRequirementSchema,
      responses: { 200: GraduationSchema, ...errors },
      summary: 'Confirm (or withdraw the confirmation of) one requirement (the cohort’s faculty)',
    },
    graduate: {
      method: 'POST',
      path: '/learning/programs/enrollments/:enrollmentId/graduate',
      pathParams: Enrollment,
      body: c.noBody(),
      responses: { 200: GraduationSchema, ...errors },
      summary: 'Graduate a learner whose every requirement is confirmed, issuing their credential (cohort.manage)',
    },
    graduationBoard: {
      method: 'GET',
      path: '/learning/cohorts/:cohortId/graduation',
      pathParams: Cohort,
      responses: { 200: GraduationBoardSchema, ...errors },
      summary: 'Graduation progress of every learner in a cohort (the cohort’s faculty)',
    },
    // portfolio
    portfolio: {
      method: 'GET',
      path: '/learning/programs/enrollments/:enrollmentId/portfolio',
      pathParams: Enrollment,
      responses: { 200: PortfolioSchema, ...errors },
      summary: 'A learner’s Dream Portfolio: eight sections assembled from approved work (the learner, or the cohort’s staff)',
    },
    sharePortfolio: {
      method: 'POST',
      path: '/learning/programs/enrollments/:enrollmentId/portfolio/share',
      pathParams: Enrollment,
      body: z.object({ shared: z.boolean() }),
      responses: { 200: PortfolioSchema, ...errors },
      summary: 'Publish the portfolio at a link anyone can open, or stop publishing it (the learner)',
    },
    publicPortfolio: {
      method: 'GET',
      path: '/learning/portfolios/:token',
      pathParams: z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/) }),
      responses: { 200: PortfolioSchema, ...errors },
      summary: 'A published portfolio (public)',
    },
    // credentials
    myCredentials: {
      method: 'GET',
      path: '/learning/me/credentials',
      responses: { 200: z.object({ items: z.array(CredentialSchema) }), ...errors },
      summary: 'My credentials: programme graduations and course certificates',
    },
    verifyCredential: {
      method: 'GET',
      path: '/learning/credentials/:code',
      pathParams: z.object({ code: z.string().regex(/^[A-Z0-9-]{8,32}$/) }),
      responses: { 200: CredentialSchema, ...errors },
      summary: 'Check a credential by its code (public)',
    },
    revokeCredential: {
      method: 'POST',
      path: '/learning/credentials/:code/revoke',
      pathParams: z.object({ code: z.string().regex(/^[A-Z0-9-]{8,32}$/) }),
      body: RevokeCredentialSchema,
      responses: { 200: CredentialSchema, ...errors },
      summary: 'Revoke a credential the organisation issued, with the reason (cohort.manage)',
    },
  },
  { strictStatusCodes: true },
);
