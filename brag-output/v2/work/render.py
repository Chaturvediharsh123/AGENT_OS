"""Render comp.html frame by frame with headless Chrome, pipe to ffmpeg."""
import subprocess, sys
from pathlib import Path
import imageio_ffmpeg
from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
FPS, DUR = 30, 60.0
mode = sys.argv[1] if len(sys.argv) > 1 else "stills"
A, Z = (int(sys.argv[2]), int(sys.argv[3])) if mode == "video" and len(sys.argv) > 3 else (0, int(30 * 60.0))

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome")
    pg = b.new_page(viewport={"width": 1920, "height": 1080})
    pg.goto((HERE / "comp.html").as_uri())
    pg.wait_for_load_state("networkidle")
    pg.evaluate("document.fonts.ready.then(() => boot())")
    if mode == "stills":
        out = HERE / "stills"; out.mkdir(exist_ok=True)
        for t in [float(x) for x in sys.argv[2:]]:
            pg.evaluate(f"render({t})")
            pg.screenshot(path=str(out / f"t{t:05.2f}.png"))
    else:
        ff = imageio_ffmpeg.get_ffmpeg_exe()
        proc = subprocess.Popen([ff, "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "png",
                                 "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-preset", "slow",
                                 str(HERE / f"seg_{A:05d}.mp4")], stdin=subprocess.PIPE)
        n = Z
        for i in range(A, Z):
            pg.evaluate(f"render({i / FPS})")
            proc.stdin.write(pg.screenshot(type="png"))
            if i % 60 == 0: print(f"frame {i}/{n}", flush=True)
        proc.stdin.close(); proc.wait()
    b.close()
