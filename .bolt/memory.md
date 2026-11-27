# Project memory

## Product intent & audience

- Project referred to as "3D Engineering Studio" (inferred from suggested commit message).
- Includes export functionality ("Export-Funktionen") and recent cleanup work ("Aufräumarbeiten").

## Brand personality & voice

- User communicates in German; responses should remain in German.
- Assistant tone: direct, helpful, practical; provides step-by-step terminal commands when unable to execute operations directly.

## Visual design & UX direction

- No specific design context inferred yet from this turn.

## Decisions, constraints & rationale

- Git is not initialized in the project (no `.git` folder, no remote configured).
- Assistant cannot run Git commands; user must execute them manually.
- Recommended push workflow: `git init` → `git add .` → commit → `git branch -M main` → add remote → `git push -u origin main`.
- Suggested using GitHub Personal Access Token instead of password for authentication.
- Recommended creating GitHub repo without README or .gitignore to avoid conflicts.

## Open questions & assumptions

- User's GitHub username and repository name are unknown — placeholders used in instructions.
- Exact project scope (what "3D Engineering Studio" entails) not yet established beyond export features and cleanup.
- No `.bolt/prompt` exists; this memory is seeded solely from inferred context.