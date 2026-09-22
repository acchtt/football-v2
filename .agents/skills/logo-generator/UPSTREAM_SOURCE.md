# Logo Generator upstream

Vendored for the Football v2 website agent workspace from:

- Repository: https://github.com/op7418/logo-generator-skill
- Commit: bf4e9ac4d4428bda261afcfe981871ceb92d94e6
- Install target: Codex / agent skills (.agents/skills/logo-generator/)
- Installed: 2026-09-22
- Upstream README states MIT License.

Notes:
- The skill definition and local SVG/reference workflow work without secrets.
- High-end showcase image generation is optional and requires the Python dependencies in `requirements.txt` plus a user-provided `GEMINI_API_KEY`.
- Never commit a real `.env` or API key to this repository.
