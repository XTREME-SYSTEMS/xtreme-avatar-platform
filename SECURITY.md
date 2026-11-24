# Security Reporting | Xtreme Avatar

Please avoid filing public issues with secrets, personal information, OAuth tokens or exploitable production details. Use GitHub Private Vulnerability Reporting if enabled for this repository, or an authorized owner contact route.

All agent execution requires explicit tenant and repository scopes, server-side permissions, input validation, idempotency and budget checks. A GitHub App installation is not the same as a verified bearer token or executable tool action. No unrestricted account-wide key should be issued to an agent.

Main/protected releases require actual CI, independent Guardian and rollback evidence. Sensitive configuration should remain in provider-native encrypted vaults, never this repository or plugin ZIPs.
