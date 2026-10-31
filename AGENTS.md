# AGENTS.md
# NetraVaani – Permanent AI Development Instructions

## 1. Project Identity

You are working on NetraVaani, an existing patient communication system that enables patients who cannot speak to communicate with nurses through eye and wrist/jaw gesture signals.

This is an ongoing production-oriented project. You are not starting a new project.

Your responsibility is to extend, maintain, debug, and improve the existing implementation without unnecessarily rediscovering or redesigning it.

## 2. Golden Rules

1. Never analyse the entire codebase for every new instruction.
2. Never repeat a completed architectural analysis without a specific reason.
3. Never scan unrelated folders.
4. Never rewrite working modules just to implement a small feature.
5. Never introduce duplicate services, APIs, models, or state-management systems.
6. Always reuse existing project patterns.
7. Preserve existing functionality unless explicitly asked to change it.
8. Prefer minimal, targeted changes.
9. Do not assume a feature is missing without checking its existing implementation.
10. Never silently change existing API contracts or database structures.

## 3. Context Management

Before starting a task:

- Read this file if it is not already available in context.
- Consult PROJECT_CONTEXT.md for architecture and important file locations.
- Consult CHANGELOG_AI.md for recent implementation changes.
- Use previous conversation context where relevant.
- Check Git changes before modifying files if Git is available.

Do not repeatedly read every context file in full if the relevant information is already available.

If a context file is outdated, verify only the relevant information against the source code.

## 4. Incremental Development Strategy

For every new task:

1. Understand the exact requested change.
2. Identify the affected feature/module.
3. Identify its direct dependencies.
4. Inspect only the relevant files.
5. Check existing implementations before making changes.
6. Implement the smallest correct solution.
7. Run targeted tests.
8. Update documentation and changelog where necessary.

Do not perform a complete codebase analysis unless:

- I explicitly request it.
- A major architectural change is required.
- A critical dependency cannot be understood locally.
- Existing context is demonstrably incorrect.

If more inspection is needed, explain why briefly.

## 5. Architecture Preservation

- Preserve existing frontend/backend separation.
- Preserve existing database and ORM conventions.
- Preserve existing authentication and authorization.
- Preserve existing real-time communication mechanisms.
- Preserve existing device communication protocols.
- Preserve existing API response formats.
- Preserve existing naming conventions and folder structure.

Do not introduce new libraries or architectural patterns without a technical reason.

Do not migrate frameworks, databases, module systems, or major dependencies unless explicitly requested or necessary and approved.

## 6. Code Quality

Write code that is:

- Maintainable.
- Modular.
- Type-safe wherever the existing stack supports it.
- Secure.
- Testable.
- Consistent with existing conventions.

Avoid:
- Unnecessary abstractions.
- Duplicate business logic.
- Overengineering.
- Hardcoded configuration and secrets.
- Large unrelated refactors.
- Swallowing errors.
- Unhandled asynchronous operations.
- Unnecessary database queries.

## 7. Reliability and Security

For relevant changes, consider:

- Input validation.
- Authentication and authorization.
- Database consistency.
- Race conditions.
- Duplicate requests.
- Idempotency.
- Network failures.
- Device disconnections.
- Reconnection and recovery.
- Logging and observability.
- Backward compatibility.

For patient safety-related features, do not silently remove existing emergency functionality or weaken validation.

## 8. Testing Strategy

Use targeted testing first.

- Run tests related to the modified module.
- Add tests for new business logic.
- Test important edge cases.
- Test failure scenarios where relevant.
- Run broader tests only when the change affects shared functionality.

Never claim tests passed unless they were actually executed.

## 9. Context File Maintenance

After completing a significant task:

- Update CHANGELOG_AI.md.
- Record modified files.
- Record new APIs, models, services, and events.
- Record important architectural decisions.
- Record known issues and pending work.

Update PROJECT_CONTEXT.md only when architecture, data flow, important file locations, or major technical decisions change.

Do not turn context files into enormous copies of the source code.

## 10. Git Safety

- Never discard existing user changes.
- Never run destructive Git commands without explicit permission.
- Never reset or overwrite unrelated work.
- Keep changes scoped to the requested task.
- Do not commit or push unless requested.

## 11. Communication Style

Before implementation, provide a short explanation of:

- What will change.
- Which modules are affected.
- Any important dependency or risk.

Do not produce a lengthy architectural report for a small task.

If the task is clear, proceed without unnecessary questions.

Ask only when a missing decision materially affects correctness.

## 12. Final Response Format

After implementation, report:

1. What changed.
2. Files modified.
3. Important implementation details.
4. Tests executed and results.
5. Remaining issues, if any.

Keep the response concise and technical.

## 13. Most Important Instruction

Treat every new instruction as an incremental task on top of the existing NetraVaani codebase.

Reuse established knowledge. Inspect only what is necessary. Do not start from zero.

## 14. Bedside Audio & Request Gating Invariants

1. **Single Problem In-Flight Gating**:
   - Do not permit secondary non-emergency commands (e.g. WATER, CALL_NURSE, ADJUSTMENT) to enter the dashboard when an unresolved request (`NEW`, `ACKNOWLEDGED`, `IN_PROGRESS`) is active for that bed/patient.
   - Emergency alerts (`EMERGENCY` / `alarm: true`) MUST always bypass gating as a non-negotiable patient safety invariant.

2. **Strict Dispatch Rejection Isolation**:
   - When a patient cancels or rejects dispatch confirmation at bedside, the request must be immediately deleted/purged from the database.
   - Unconfirmed or cancelled requests must never appear in `listCareRequests`, `filteredRequests`, or increment `openCallsCount` on the nurse dashboard.

3. **Minimalist Bedside Speaker Interface**:
   - Keep the bedside speaker screen clean, high-contrast, and uncluttered.
   - Avoid long instructional paragraphs, explanatory texts, or redundant technical telemetry on the patient view.
