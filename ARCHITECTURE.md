# AgentOS implementation blueprint

This delivered workspace is a polished, interaction-capable frontend prototype. It deliberately does not imply that credentials, tool execution, or model calls are operational. The production build should use the following architecture.

## Chosen stack and tradeoffs

- **Next.js / TypeScript / Tailwind / React Flow**: fast, type-safe product UI. React Flow supplies a proven accessible graph foundation rather than a bespoke canvas.
- **FastAPI / SQLAlchemy / PostgreSQL**: Python-native async API and durable relational tenancy model.
- **Redis + Qdrant**: Redis for ephemeral runtime state/rate limits; Qdrant for strictly metadata-filtered semantic retrieval. PostgreSQL remains source of truth for durable records.
- **LangGraph only in the runtime**: use it for checkpointed workflows, not as the overall application architecture. This limits framework coupling.

## Service boundaries

`web → API/BFF → auth context → agent service / workflow runtime / model gateway / memory fabric / tool gateway → providers`

The agent runtime accepts a provider-neutral `ModelProvider` interface (`generate`, `stream`, `count_tokens`, `health_check`). A routing policy selects a provider based on workspace policy, privacy mode, capability, cost and health. Agents own their memory namespace; changing a model never changes memory identity.

## Tenant and security model

Every API request derives `user_id` and memberships from the validated session; client-supplied tenant IDs are never authoritative. Workspace/project scope is applied in the service layer and reinforced with PostgreSQL RLS using `workspace_id` on all tenant tables. Encrypt provider credentials with a KMS envelope key; expose only a masked suffix. Redact secrets from structured logs and execution payloads.

External retrieval and tool output are tagged untrusted. They can become model context but cannot modify system instructions, permissions, or tool authorization. Tool calls are typed requests evaluated by a policy engine before a sandbox/API adapter executes them. High-risk actions pause with a durable approval record; the runtime cannot self-approve.

## Core data model

| Domain | Key tables |
|---|---|
| Identity | users, sessions, workspaces, workspace_members, projects |
| Agents | agents, agent_models, agent_tools, agent_permissions, agent_versions |
| Execution | tasks, executions, execution_events, approval_requests, agent_messages |
| Memory | memories, memory_metadata, memory_links, retrieval_events |
| Security | api_credentials, audit_logs, rate_limit_events |

All tenant tables include `workspace_id`; project-scoped data also includes `project_id`. Execution events are append-only and redact sensitive request fields, enabling replay from a selected checkpoint.

## Initial API surface

- `POST /v1/workspaces`, `GET /v1/workspaces/{id}/projects`
- `GET|POST /v1/projects/{id}/agents`; `PATCH|DELETE /v1/agents/{id}`
- `POST /v1/agents/{id}/model`, `GET /v1/agents/{id}/memory`
- `GET|PUT /v1/projects/{id}/workflow`; `POST /v1/workflows/{id}/runs`
- `GET /v1/executions/{id}`, `GET /v1/executions/{id}/events`, `POST /v1/executions/{id}/replay`
- `POST /v1/approval-requests/{id}/decision`
- `WS /v1/executions/{id}/stream`

## Delivery phases

1. Auth, tenancy, RLS, audit foundation.
2. Agent CRUD and versioned configuration.
3. Provider-neutral model gateway and encrypted credentials.
4. Single-agent streaming execution with durable events.
5. Isolated layered memory and retrieval policy.
6. React Flow workflow authoring and validation.
7. Concurrent graph execution and planner-created ephemeral agents.
8. Typed tool gateway, sandboxing and approvals.
9. Trace viewer, replay and metrics.
10. Model routing, evaluations, load/security hardening.

Each phase gates on unit/integration tests, API contract checks, migration tests, type/lint checks, and tenant-boundary tests. No live model provider or terminal adapter should ship before those gates are in place.
