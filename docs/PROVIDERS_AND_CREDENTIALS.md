# Provider integration and credentials registry

Never create a universal all-access token, commit API keys or transfer browser cookies. Connect each provider using its existing vault and scoped OAuth/GitHub App grant. Use environment-specific secret references. Read-only discovery is not equivalent to authenticated write/execute.

| Provider | Existing authority | Scope and proof required |
| --- | --- | --- |
| GitHub | XTREME-SYSTEMS org / xps-admin | Repo installation, issue/PR/project write receipt, branch controls |
| Eve V3 | Existing XTREME-SYSTEMS/visual-x-eve-pilot | Explicitly admit this new repo, original workflow lease/Blob claim, cost cap, execution receipt |
| Vercel | Existing xtreme-ai-systems team | New project link only after deployment plan; preview SHA, build and runtime proof |
| Eden Core / Neon | Existing standalone owner/tenant memory service | Same brain across voice/video/chat, deny wrong-tenant memory reads |
| CloudBrowser | Existing authenticated Railway browser API | Server-side session, scoped site actions, screenshots, audit and consent; no browser-side key |
| Twilio | Existing voice/SMS/WhatsApp number services | Scoped endpoints, delivery/call SID and participant consent |
| Tavus | Existing authorized avatar service | Session readback, video/voice parity and correct memory tenant |
| Google Workspace | eden@visualx.dev (OAuth) | Gmail send receipt, Calendar event ID, Drive file ID, owner-verified scopes |
| Codex/OpenAI | Existing Eve-hosted OpenAI credential | Explicit per-run budget and sandbox approval; do NOT copy API key to this repo |

A plugin connection, capability catalog, or listed provider name is not proof of runtime capability. Do not grant a hosted worker access to ChatGPT host OAuth tokens. Store production/preview secrets only in authorized GitHub/Vercel/provider vaults, with rotation/revocation and audit.
