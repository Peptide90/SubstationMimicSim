# Telemetry & privacy statement (draft)

This project is intended to be privacy-preserving. If telemetry and leaderboards are enabled, the plan is to collect **only aggregated, non-identifiable usage statistics** and **opt-in gameplay scores**.

## What would be collected (minimal scope)

- **Game mode counts**: total plays in solo and multiplayer.
- **Unique players**: derived from an anonymous client hash (randomly generated client ID, hashed before storage).
- **Active users**: concurrent sessions (no IP storage).
- **Region**: coarse country/region derived at ingest time, without storing IP addresses.
- **Leaderboard entries**: score, scenario, team name, and duration, with no personal identifiers.

## What would NOT be collected

- No names, emails, account IDs, or chat messages.
- No IP address storage.
- No hardware identifiers.

## Data retention & minimization

- Keep only the minimum retention window required for feature development (e.g., 90 days for session data, longer for aggregated rollups).
- Delete raw session rows after rollups are computed.
- Allow opt-out if telemetry becomes enabled by default.

## Related schema

The initial database schema for these features is defined in `ops/postgres/init.sql` and can be refined before implementation.
