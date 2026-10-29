"""Bundle src/ into a single self-contained index.html (the 6-7 clip is embedded as base64)."""
import base64
from pathlib import Path

root = Path(__file__).parent
shell = (root / "src/shell.html").read_text()
game = (root / "src/game.js").read_text()
sfx = base64.b64encode((root / "src/six-seven.wav").read_bytes()).decode()

page = shell.replace("__SFX67__", sfx).replace("__GAME__", game)
head, body = page.split('<div class="wrap">', 1)
html = (
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    '<style>body{margin:0}</style>\n'
    + head + '</head>\n<body>\n<div class="wrap">' + body + '</body>\n</html>\n'
)
(root / "index.html").write_text(html)
print(f"wrote index.html ({len(html) // 1024} KB)")
