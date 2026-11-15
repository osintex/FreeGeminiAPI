# FreeGeminiAPI Security

FreeGeminiAPI is a purely local proxy designed to run exclusively on `127.0.0.1`.

## Local Credential Storage
- Session tokens and cookies are saved in `gemini-auth.json` inside your local directory.
- This file is strictly excluded in `.gitignore` to prevent accidental commits.
- The proxy binds only to localhost (`127.0.0.1`) by default, so it is never exposed to the local network or internet unless explicitly configured.
- No third-party telemetry, analytics, or external logging servers are used.

## Reporting Issues
If you discover a security issue or unexpected credential exposure, open an issue directly in this repository.
