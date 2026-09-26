"""Run a private AgentOS instance, seed demo missions, and snapshot real app screens to shots.js."""
import json, os, subprocess, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
ROOT = HERE.parents[2]
PORT = 8090
BASE = f"http://127.0.0.1:{PORT}"
DB = HERE / "capture.db"
if DB.exists():
    DB.unlink()

env = {**os.environ, "AGENTOS_PORT": str(PORT), "AGENTOS_DB": str(DB), "OLLAMA_URL": "http://127.0.0.1:9"}
srv = subprocess.Popen([sys.executable, str(ROOT / "server.py")], env=env, cwd=ROOT)


def call(method, path, body=None):
    req = Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                  headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=30) as r:
        return json.loads(r.read() or b"null")


def wait_mission(mid):
    for _ in range(200):
        runs = call("GET", f"/api/missions/{mid}")
        if all(r["status"] in ("completed", "failed") for r in runs):
            return
        time.sleep(0.3)


try:
    for _ in range(50):
        try:
            call("GET", "/api/agents"); break
        except Exception:
            time.sleep(0.2)
    for a in call("GET", "/api/agents"):
        call("PATCH", f"/api/agents/{a['id']}", {"provider": "demo", "model": "simulated"})
    call("POST", "/api/agents", {"name": "Atlas", "role": "Planner", "provider": "ollama", "model": "qwen3.5:4b",
                                 "system_prompt": "Break the mission into concrete, ordered steps with owners and deadlines."})
    call("POST", "/api/agents", {"name": "Byte", "role": "Engineer", "provider": "anthropic", "model": "claude-sonnet-5",
                                 "system_prompt": "Propose working code and technical designs. Explain trade-offs briefly."})
    seeds = [
        ("Review our onboarding flow and propose three concrete fixes.", [3, 4], "Balanced"),
        ("Scan open-source AI agent frameworks and recommend one for a small team.", [1, 2, 4], "Crew handoff"),
        ("Write a 2-minute hackathon pitch for AgentOS, then critique and tighten it.", [3, 4], "Crew handoff"),
    ]
    for task, ids, routing in seeds:
        wait_mission(call("POST", "/api/runs", {"task": task, "agent_ids": ids, "routing": routing})["mission_id"])
    main = call("POST", "/api/runs", {"task": "Research the AI study-planner market, analyse the top 3 competitors, and draft a one-page launch brief.",
                                      "agent_ids": [1, 2, 3, 4], "routing": "Crew handoff"})["mission_id"]
    wait_mission(main)

    shots = {}
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome")
        pg = b.new_page(viewport={"width": 1600, "height": 1000})
        pg.goto(BASE + "/app")
        pg.evaluate("localStorage.setItem('agentos-picked','[1,2,3,4]');localStorage.setItem('agentos-routing','\"Crew handoff\"');localStorage.setItem('agentos-draft','\"\"')")

        def snap(name, route=None, settle=1.2, js=None):
            if route is not None:
                pg.goto(BASE + "/app" + route)
                pg.wait_for_load_state("networkidle")
            if js:
                pg.evaluate(js)
            time.sleep(settle)
            shots[name] = pg.evaluate("""() => {
              const c = document.body.cloneNode(true);
              c.querySelectorAll('script').forEach(s => s.remove());
              c.querySelector('#toasts').innerHTML = '';
              return c.innerHTML;
            }""")

        snap("dash", "#/", 2.5, "document.activeElement.blur()")
        snap("agents", "#/agents")
        snap("mission", f"#/mission/{main}")
        snap("compare", None, 0.6, "document.querySelector('[data-tab=\"compare\"]').click()")
        snap("final", None, 0.6, "document.querySelector('[data-tab=\"final\"]').click()")
        snap("models", "#/models", 3.5)
        pg.goto(BASE + "/app#/"); pg.wait_for_load_state("networkidle"); time.sleep(1.5)
        pg.keyboard.press("Control+k"); time.sleep(0.3)
        pg.keyboard.type("launch"); time.sleep(1.2)
        snap("palette", None, 0.2)
        b.close()
    (HERE / "shots.js").write_text("window.SHOTS = " + json.dumps(shots) + ";\nwindow.MAIN_MISSION = " + json.dumps(main) + ";\n", encoding="utf-8")
    print("captured", list(shots), main)
finally:
    srv.terminate()
