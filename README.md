# AgentOS

### A local-first command center for running AI agents together

AgentOS is a visual workspace for turning one outcome into a coordinated run of AI agents. Choose one agent, a subset, or the full crew; route work to Ollama or a cloud model; watch the run unfold; then inspect the finished answer as a searchable, exportable result.

> **Status:** hackathon-ready local prototype. The UI, workflow controls, run history, guide, metrics, approval preview, replay, comparison, export, and MCP permission surfaces are implemented. Production auth, encrypted credential storage, durable multi-tenant storage, and real external MCP adapters remain the next hardening phase.

## Why AgentOS

- **Run one or many agents** from the same mission console.
- **Local-first by default** with Ollama and clear runtime health.
- **Provider-aware routing** for Ollama, OpenAI, Anthropic, and Gemini surfaces.
- **Live observability** with activity timeline, run history, latency, success, and cost indicators.
- **Human-in-the-loop safety** with approval gates before external side effects.
- **Searchable workspace memory** for previous missions and cooked answers.
- **Replay and compare** previous runs to make iteration measurable.
- **Export results** as Markdown or print-ready PDF.
- **MCP permission scopes** for Slack, Gmail, GitHub, Notion, and Cal.com workflows.
- **Animated command-center UI** plus a dedicated interactive guide at `/guide`.

## Quick start

### Requirements

- Python 3.10+
- Ollama (optional, for local model execution)
- A browser with JavaScript enabled

### Run locally

```powershell
cd outputs/agentos
python server.py
```

Open [http://localhost:8080](http://localhost:8080). Read the walkthrough at [http://localhost:8080/guide](http://localhost:8080/guide).

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
3. Choose a model strategy such as Balanced.
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
├── server.py            # Local HTTP API and static-file server
├── app.js               # Workspace interactions and mission runtime UI
├── new-index.html       # Main command-center shell
├── guide.html           # Animated product guide
├── *.css                # Layered visual theme and responsive layout
├── feature-pack.js      # Activity, metrics, approvals, exports, replay
├── assets/              # UI artwork
├── ARCHITECTURE.md      # Production architecture and security blueprint
└── .gitignore           # Keeps runtime data and secrets out of Git
```

## API smoke checks

The local server exposes lightweight endpoints used by the UI:

```text
GET /api/agents
GET /api/runs
GET /api/models
GET /api/mcp/servers
POST /api/run
```

The SQLite runtime file (`agentos.db`) is intentionally ignored and is created automatically on first start.

## Production roadmap

See [ARCHITECTURE.md](ARCHITECTURE.md) for planned service boundaries, tenancy, provider gateway, memory fabric, typed tool gateway, approvals, replay, and security hardening.

## Contributing

1. Create a feature branch from `main`.
2. Keep secrets, databases, logs, and generated output out of commits.
3. Test the local server and core API endpoints before opening a PR.
4. Update the guide or architecture notes when behavior changes.

## License

Add the project license that matches your hackathon or deployment requirements before publishing a public release.

---

Built by **Harsh** with a local-first mindset.
