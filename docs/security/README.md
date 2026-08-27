# Security Baseline

- Browser code may receive only the TaskRingAI project URL and publishable key.
- Privileged server credentials and database passwords must never be committed or exposed to browser code.
- Local environment files are ignored by Git.
- `.env.example` contains placeholders only.
- Demo content must contain no private tasks, private URLs, or migrated Legacy data.
- CI checks tracked files for known credential patterns and prohibited legacy identifiers.
