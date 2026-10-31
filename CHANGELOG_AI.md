# CHANGELOG_AI.md
# NetraVaani – AI Implementation History

Purpose:
Maintain a concise record of completed development tasks, modified files, technical decisions, and pending work.

IMPORTANT:
Only record changes that have actually been implemented and verified.
Do not mark planned features as completed.

---

## 1. Current Project Status

Project: NetraVaani

Development status: Ongoing

Architecture:
- Frontend: Next.js
- Backend: Node.js + Express
- Database: MongoDB + Mongoose
- Hardware: ESP32 + NPG Lite
- Firmware: Arduino-based device firmware
- Real-time communication: Verify existing implementation

---

## 2. Existing Functional Areas

### Device Management
- Device registration.
- Device discovery.
- Hardware ID handling.
- NPG Lite device ID handling.
- Device-to-patient assignment.
- Device unassignment.
- Versioned device configuration.

### Patient Management
- Patient creation.
- Patient information management.
- Device assignment retrieval.

### Gesture Communication
- Forehead EOG signals.
- Wrist squeeze signals.
- Signal filtering.
- Gesture classification.
- Gesture-to-command mapping.
- Backend request processing.

### Nurse Dashboard
- Patient monitoring.
- Live Calls Ledger.
- Request notifications.
- Emergency notifications.
- Audio voice phrases.

Implementation status of individual features must be verified before making assumptions.

---

## 3. Implementation History

### Initial project context

Date: 2026-10-31

Recorded:
- NetraVaani architecture and business requirements.
- Existing hardware and software responsibilities.
- Device registration and assignment workflow.
- Gesture communication workflow.
- Mandatory YES/NO handshake requirements.
- Emergency handling requirements.
- Live Calls Ledger requirements.

Note: Recording requirements does not mean implementation is complete.

---

## 4. Feature Implementation Log

Use this format for every significant task.

### Feature: [Feature name]

Date: [Date]

Status: [Completed / Partial / Blocked]

#### Objective
[What was requested]

#### Changes implemented
- [Change 1]
- [Change 2]

#### Files modified
- [Actual file path]
- [Actual file path]

#### APIs / Models / Events changed
- [Actual names]

#### Technical decisions
- [Important decisions]

#### Tests
- [Tests executed]
- [Results]

#### Pending issues
- [Remaining work]

---

## 5. Current Pending Work

Only list genuinely pending tasks.

- [ ] Verify current mandatory handshake implementation.
- [ ] Verify YES/NO exclusion from Live Calls Ledger.
- [ ] Verify emergency handling during initialization.
- [ ] Verify device reconnection and handshake persistence.
- [ ] Verify duplicate gesture prevention.
- [ ] Verify real-time dashboard synchronization.

Update these checkboxes as implementation is verified.

---

## 6. Known Issues

Record:
- Actual bugs.
- Reproducible errors.
- Missing functionality.
- Technical debt.
- Unresolved integration problems.

Do not add speculative issues.

---

## 7. Important Architectural Decisions

Record decisions that future development must preserve.

Format:

### Decision: [Title]

- Context:
- Decision:
- Reason:
- Consequences:
- Related files:

---

## 8. Instructions for Future AI Sessions

Before implementing a new task:

1. Read the relevant project context.
2. Review the latest changelog entries.
3. Identify the specific feature being modified.
4. Inspect only affected files and dependencies.
5. Preserve previous implementation decisions.
6. Update this changelog after significant changes.

Do not repeat previous analysis.

Do not record an implementation as completed until it has been checked in the actual codebase and relevant tests have been executed.

Keep this file concise and chronological.