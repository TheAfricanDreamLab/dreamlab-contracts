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
