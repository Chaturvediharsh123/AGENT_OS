"""API tests. Run with: python -m unittest discover tests"""
import json
import os
import sys
import tempfile
import threading
import time
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402


class ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        server.DB_PATH = Path(cls.tmp.name) / "test.db"
        server.OLLAMA_URL = "http://127.0.0.1:9"  # nothing listens here
        server.init_db()
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.tmp.cleanup()

    def call(self, method, path, body=None):
        req = Request(self.base + path, method=method,
                      data=json.dumps(body).encode() if body is not None else None,
                      headers={"Content-Type": "application/json"})
        try:
            with urlopen(req) as r:
                return r.status, json.loads(r.read() or b"null")
        except HTTPError as e:
            return e.code, json.loads(e.read() or b"null")

    def test_seed_agents(self):
        status, agents = self.call("GET", "/api/agents")
        self.assertEqual(status, 200)
        self.assertGreaterEqual(len(agents), 4)
        self.assertTrue(all(a["model"] == server.DEFAULT_MODEL for a in agents[:4]))

    def test_health(self):
        status, h = self.call("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertFalse(h["ollama"])

    def test_private_files_not_served(self):
        for path in ("/server.py", "/agentos.db", "/.gitignore", "/test.db"):
            with self.subTest(path=path):
                self.assertEqual(self.call("GET", path)[0], 404)

    def test_pages_served(self):
        for path in ("/", "/app", "/guide", "/static/agentos.css", "/static/app.js"):
            with urlopen(self.base + path) as r:
                self.assertEqual(r.status, 200)

    def test_static_content_types(self):
        for path, ctype in (("/static/app.js", "text/javascript"), ("/static/agentos.css", "text/css")):
            with urlopen(self.base + path) as r:
                self.assertEqual(r.headers["Content-Type"].split(";")[0], ctype)

    def test_agent_crud_and_validation(self):
        self.assertEqual(self.call("POST", "/api/agents", {"name": "x"})[0], 400)
        self.assertEqual(self.call("POST", "/api/agents", {"name": "A", "role": "R", "model": "m",
                                                            "system_prompt": "p", "provider": "nope"})[0], 400)
        status, created = self.call("POST", "/api/agents", {"name": "Tmp", "role": "Tester", "model": "m",
                                                             "system_prompt": "p", "provider": "openai"})
        self.assertEqual(status, 201)
        aid = created["id"]
        self.assertEqual(self.call("PATCH", f"/api/agents/{aid}", {"role": "QA"})[0], 200)
        self.assertEqual(self.call("DELETE", f"/api/agents/{aid}")[0], 200)
        self.assertEqual(self.call("DELETE", f"/api/agents/{aid}")[0], 404)

    def test_local_only_blocks_cloud_agents(self):
        _, created = self.call("POST", "/api/agents", {"name": "Cloudy", "role": "R", "model": "m",
                                                        "system_prompt": "p", "provider": "openai"})
        status, err = self.call("POST", "/api/runs", {"task": "hi", "routing": "Local only",
                                                       "agent_ids": [created["id"]]})
        self.assertEqual(status, 400)
        self.assertIn("Cloudy", err["detail"])
        self.call("DELETE", f"/api/agents/{created['id']}")

    def test_crew_run_fails_cleanly_without_ollama(self):
        status, res = self.call("POST", "/api/runs", {"task": "test mission", "routing": "Crew handoff",
                                                       "agent_ids": [1, 2]})
        self.assertEqual(status, 202)
        self.assertEqual(res["count"], 2)
        for _ in range(50):
            _, runs = self.call("GET", f"/api/missions/{res['mission_id']}")
            if all(r["status"] == "failed" for r in runs):
                break
            time.sleep(0.1)
        self.assertEqual([r["step"] for r in runs], [1, 2])
        self.assertTrue(all(r["status"] == "failed" and "ollama" in r["error"] for r in runs))

    def test_crew_prompt_includes_handoff(self):
        prompt = server.build_prompt("Plan a trip", [({"name": "Scout", "role": "Researcher"}, "Found 3 cities")])
        self.assertIn("Found 3 cities", prompt)
        self.assertIn("Scout (Researcher)", prompt)

    def test_credentials_never_returned(self):
        self.call("POST", "/api/credentials", {"provider": "openai", "key": "sk-test-1234567890"})
        _, creds = self.call("GET", "/api/credentials")
        self.assertIs(creds["openai"], True)
        self.assertNotIn("sk-test", json.dumps(creds))
        server.CREDENTIALS.clear()

    def test_stats(self):
        status, s = self.call("GET", "/api/stats")
        self.assertEqual(status, 200)
        for key in ("missions", "runs", "completed", "failed", "agents"):
            self.assertIn(key, s)

    def test_demo_provider_runs_and_mission_delete(self):
        orig, server.time.sleep = server.time.sleep, (lambda _s: None)
        try:
            _, created = self.call("POST", "/api/agents", {"name": "Demo", "role": "Writer", "model": "simulated",
                                                            "system_prompt": "p", "provider": "demo"})
            status, res = self.call("POST", "/api/runs", {"task": "demo mission", "routing": "Local only",
                                                           "agent_ids": [created["id"]]})
            self.assertEqual(status, 202)
            for _ in range(50):
                _, runs = self.call("GET", f"/api/missions/{res['mission_id']}")
                if runs[0]["status"] == "completed":
                    break
                time.sleep(0.05)
            self.assertEqual(runs[0]["status"], "completed")
            self.assertIn("Simulated output", runs[0]["result"])
            self.assertIn("demo mission", runs[0]["result"])
            self.assertEqual(self.call("DELETE", f"/api/missions/{res['mission_id']}")[0], 200)
            self.assertEqual(self.call("GET", f"/api/missions/{res['mission_id']}")[0], 404)
        finally:
            server.time.sleep = orig
            self.call("DELETE", f"/api/agents/{created['id']}")


if __name__ == "__main__":
    unittest.main()
