# dreamlab-contracts

Zod + ts-rest contracts shared by the Dream Lab OS API and clients. Published as `@dreamlab/contracts`.

This package is the seam between `dreamlab-api`, `dreamlab-web`, `dreamlab-mobile` and `dreamlab-site`. Every request and response the API serves is defined here first.

## Contents

| Module | What it defines |
| --- | --- |
| `common` | IDs, email / E.164 phone identifiers, passwords, pagination, the error shape |
| `permissions` | The permission catalog, scope types and the system roles that bundle permissions |
| `auth` | Registration, OTP, login, refresh, logout, password reset / change, org switching, sessions, JWKS, access-token claims |
| `directory` | Me, organisations, members, invitations, roles, org units and groups |
| `enterprise` | Email domains, single sign-on connections, SCIM, custom roles, security policy |
| `content` | Course content: lesson steps and blocks, interactive checks, quizzes, assignments, discussions — an authoring form with answers and a delivery form without |
| `catalog` | Course and programme catalog, syllabus outlines, catalog administration |
| `learning` | Enrolments, the course player, progress, checks, quiz attempts, assignment submissions, discussions, journal, learning stats |
| `cohorts` | Cohorts of a programme: dated calendar, class sessions on a weekly rhythm, joining, electives, attendance, my programme |
| `grading` | Faculty grading: queue, rubric levels 0–4, release and regrade, course final score |
| `authoring` | Course authoring in the browser: drafts, review, publishing, draft issues, course media uploads |
| `media` | Uploads: course images and videos (`/media/...` paths), assignment files, upload tickets and short-lived file links |
| `notifications` | Notifications per person, unread count, mark read, email preferences per category |
| `admissions` | Admission cycles and the ten-stage application pipeline: applicant stages and their answers, reviews scored on six dimensions (DBPI™ and DSI™), immutable AI-assisted evaluations, interviews, scholarships, decisions |
| `community` | Live classes (join tickets, recordings), mentor assignments and meetings, Dream Circles, a learner's community |
| `instructors` | Instructor profiles of an organisation and the staff of each course |
| `outcomes` | Dream Residency stages and reviews, the 12-month action plan, the Dream Score™ (dimensions, weights, evidence, growth), the graduation checklist, the Dream Portfolio and credentials |
| `assigned` | Assigned learning: courses an organisation assigns to people or groups, with due dates and progress |
| `platform` | Platform administration: overview, people search, suspend / reactivate |
| `index` | `apiV1Contract` (served under `/v1`), `contract` (everything the gateway serves) |

## Using it

Until an npm registry token exists, consumers pin a git tag:

```json
"@dreamlab/contracts": "github:TheAfricanDreamLab/dreamlab-contracts#v0.1.0"
```

pnpm builds the package on install through its `prepare` script. pnpm 10 consumers must allow that build, and must provide the peer dependencies `zod@^3.25` and `@ts-rest/core@^3.52`.

## Versioning

Consumers pin an exact version. Adding routes or optional fields is a minor release. Removing or renaming anything, or making a field required, is a major release, followed by one coordinated slice per consumer repo (contracts → api → web / mobile / site).

## Development

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Licence

Apache-2.0. Dream Score™, DBPI™ and DSI™ are marks of the African Dream Network and are not licensed by this repository.
