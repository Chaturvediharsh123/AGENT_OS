# AgentOS workspace prototype

Start the complete local application:

```powershell
python server.py
```

Then visit `http://localhost:8080`.

## Working interactions

- Select an agent in the left team list or workflow canvas to update its inspector.
- Run the workflow to see execution states and trace data advance.
- Use `Ctrl/Cmd + K` for the command palette.
- Switch the lower observability tabs.

## Intentional boundary

This MVP can run one agent, selected agents, or the full kitchen concurrently and calls Ollama directly at `http://127.0.0.1:11434`. The installed default is `qwen3.5:4b`; model pantry shows every model Ollama exposes. If Ollama is unavailable, each run explicitly fails with the local connection error; it does not invent a response. Cloud-provider credentials, authentication, approval-gated tools, PostgreSQL/RLS, and semantic memory remain planned production phases documented in `ARCHITECTURE.md`.
