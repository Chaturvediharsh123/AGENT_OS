# AgentOS

### A local-first command center for running AI agents together

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Ollama](https://img.shields.io/badge/Local%20models-Ollama-111827)](https://ollama.com/)
[![Runtime](https://img.shields.io/badge/Runtime-local--first-27c499)](http://localhost:8080)
[![Status](https://img.shields.io/badge/Status-hackathon--ready-f08a6f)](https://github.com/Chaturvediharsh123/AGENT_OS)

> **One outcome. The right crew. A visible result.**

AgentOS is a visual workspace for turning one outcome into a coordinated run of AI agents. Choose one agent, a subset, or the full crew; route work to Ollama or a cloud model; watch the run unfold; then inspect the finished answer as a searchable, exportable result.

### Explore the workspace

| | Link |
| --- | --- |
| Run it locally | [Quick start](#quick-start) |
| Open the workspace | [Mission Control](http://localhost:8080/app) |
| Learn the workflow | [Guide & API](http://localhost:8080/app#/guide) |
| Understand the design | [Architecture blueprint](ARCHITECTURE.md) |
| Browse the source | [GitHub repository](https://github.com/Chaturvediharsh123/AGENT_OS) |

> **Status:** hackathon-ready local prototype. The UI, workflow controls, run history, guide, metrics, approval preview, replay, comparison, export, and MCP permission surfaces are implemented. Production auth, encrypted credential storage, durable multi-tenant storage, and real external MCP adapters remain the next hardening phase.

## Why AgentOS

- **Run one or many agents** from the same mission console.
- **Crew handoff mode** — agents run in order and each one builds on the previous agents' work (research → analysis → draft → review), instead of answering in isolation.
- **Live mission pipeline** showing each agent step, its status, timing, and handoff — click a step to open its output.
- **Local-first by default** with Ollama and clear runtime health.
- **Provider-aware routing** for Ollama, OpenAI, Anthropic, and Gemini surfaces.
- **Live observability** with activity timeline, run history, latency, success, and cost indicators.
- **Human-in-the-loop safety** with approval gates before external side effects.
- **Searchable workspace memory** for previous missions and cooked answers.
- **Replay and compare** previous runs to make iteration measurable.
- **Export results** as Markdown or print-ready PDF.
- **MCP permission scopes** for Slack, Gmail, GitHub, Notion, and Cal.com workflows.
- **Demo provider** — clearly labelled simulated output so you can present the full flow with no Ollama or API key.
- **Command palette** (`Ctrl/Cmd + K`) for search and navigation, light/dark themes, and a mobile layout.
- **Landing page** at `/`, workspace at `/app`, with Mission Control, Missions, Agents, Models & Keys, Integrations and Guide pages.

## Feature matrix

| Workspace surface | What it gives you |
| --- | --- |
| Mission control | Describe an outcome and dispatch it to one or more agents |
| Agent roster | See each agent's role, provider, model, and readiness |
| Live activity | Follow progress, timing, status, and run health as work happens |
| Workspace memory | Search and reopen previous mission outputs |
| Safety center | Review MCP scopes and approve side-effecting actions |
| Replay lab | Replay a mission and compare runs side by side |
| Export station | Download Markdown or print a clean PDF copy of a result |

## Quick start

### Requirements

- Python 3.10+
- Ollama (optional, for local model execution)
- A browser with JavaScript enabled

### Run locally

```bash
git clone https://github.com/Chaturvediharsh123/AGENT_OS
cd AGENT_OS
python server.py
```

No `pip install` needed — AgentOS uses only the Python standard library.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `AGENTOS_HOST` | `127.0.0.1` | Bind address |
| `AGENTOS_PORT` | `8080` | Port |
| `AGENTOS_DB` | `./agentos.db` | SQLite database path |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama endpoint |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` | — | Cloud providers (optional) |

Open [http://localhost:8080](http://localhost:8080) for the landing page, or go straight to the workspace at [http://localhost:8080/app](http://localhost:8080/app). The guide lives at [/app#/guide](http://localhost:8080/app#/guide).

**No Ollama on stage?** Open **Models & Keys → Demo mode** (or click *Use demo mode* on the offline banner). Agents switch to the `demo` provider, which returns clearly labelled simulated output so the pipeline, handoff, compare and export flows all still work.

### Connect Ollama

1. Install and start Ollama.
2. Pull a model, for example:

   ```powershell
   ollama pull qwen3.5:4b
   ```

3. Start AgentOS and use **Models** to refresh the local model pantry.

AgentOS calls Ollama at `http://127.0.0.1:11434`. If Ollama is unavailable, the run reports the connection failure instead of fabricating a result.

## Using cloud providers

Open the model/provider controls, select a provider, and enter its API key when prompted. Keys are used by the running local server and must never be committed to Git. Keep local secrets in an ignored `.env` file or your operating-system secret store.

| Provider | Typical use |
| --- | --- |
| Ollama | Private/local execution |
| OpenAI | General reasoning and tool orchestration |
| Anthropic | Long-form analysis and writing |
| Gemini | Fast multimodal/cloud tasks |

## Mission workflow

1. Write the outcome in the mission console.
2. Select one agent, selected agents, or the full crew.
3. Choose a strategy: **Balanced** (agents work in parallel), **Crew handoff** (agents work in sequence, each seeing earlier output), or **Local only** (refuses to send anything to a cloud provider).
4. Dispatch the mission.
5. Follow progress in **Live Activity**.
6. Open the completed dish to inspect the response, source order, model, timing, and status.
7. Export, replay, or compare the run.

Use `Ctrl/Cmd + K` to search workspace memory from anywhere.

## MCP safety model

MCP connectors are shown with explicit permission scopes. External side effects (sending email, posting to Slack, booking on Cal.com, or changing GitHub/Notion data) should pause for approval before execution. Retrieved pages and tool output are untrusted context and must not override system instructions or permissions.

## Project layout

```text
agentos/
├── server.py            # Local HTTP API, agent runtime, static server
├── index.html           # Landing page (/)
├── app.html             # Workspace shell (/app, /guide)
├── static/
│   ├── agentos.css      # Design system: tokens, light/dark themes, landing + app
│   └── app.js           # Hash-routed SPA: mission control, missions, agents,
│                        #   models, integrations, guide, command palette
├── tests/               # API tests (python -m unittest discover tests)
├── assets/              # Artwork
├── ARCHITECTURE.md      # Production architecture and security blueprint
└── .gitignore           # Keeps runtime data and secrets out of Git
```

## API smoke checks

The local server exposes lightweight endpoints used by the UI:

```text
GET    /api/health              server + Ollama status
GET    /api/stats               mission / run totals, success rate, avg latency
GET    /api/agents
POST   /api/agents              create an agent
PATCH  /api/agents/{id}
DELETE /api/agents/{id}
GET    /api/runs?limit=         latest runs (default 60, max 500)
GET    /api/runs/{id}
GET    /api/missions/{id}       every run in one mission, in order
DELETE /api/missions/{id}       delete a finished mission
POST   /api/runs                {"task", "agent_ids", "routing"}
GET    /api/search?q=
GET    /api/models
GET    /api/mcp/servers
```

Run the test suite (also runs in GitHub Actions on every push):

```bash
python -m unittest discover -v tests
```

The SQLite runtime file (`agentos.db`) is intentionally ignored and is created automatically on first start.

## Screenshots and demo flow

AgentOS is designed to be understood in under a minute:

1. Open the mission console.
2. Select **Scout** for a single-agent run, or add more cooks for parallel work.
3. Dispatch and watch the activity timeline.
4. Open the completed result, then export or replay it.

The `/guide` page walks through this flow with the same unified theme as the workspace.

## Production roadmap

See [ARCHITECTURE.md](ARCHITECTURE.md) for planned service boundaries, tenancy, provider gateway, memory fabric, typed tool gateway, approvals, replay, and security hardening.

## Contributing

1. Create a feature branch from `main`.
2. Keep secrets, databases, logs, and generated output out of commits.
3. Run `python -m unittest discover tests` before opening a PR.
4. Update the guide or architecture notes when behavior changes.

### Suggested GitHub labels

Use these labels to keep hackathon issues easy to triage:

`bug` · `enhancement` · `good first issue` · `documentation` · `ui/ux` · `ollama` · `cloud-provider` · `mcp` · `security` · `performance` · `help wanted`

Recommended colors: coral for product work, mint for ready/help-wanted work, amber for bugs, and violet for integrations.

## License

Add the project license that matches your hackathon or deployment requirements before publishing a public release.

---

Built by **Harsh** with a local-first mindset.
