# Netravaani Architecture

## Overview
Netravaani is an assistive communication system designed for patients with severe motor/speech limitations who cannot use conventional nurse-call buttons. The system enables bed-side assistive devices (e.g. ESP32-C6 based custom firmware) to send authenticated intent/care signals directly over Wi-Fi to a reliable backend, which records the events, manages audit logs, and pushes instant real-time alerts to nurse station dashboards via WebSockets (Socket.IO).

## Core System Components

```
+------------------------------------+
| NPG Lite Device (ESP32-C6)         |
| - Sensor recognition               |
| - Direct HTTPS / Wi-Fi dispatch    |
+-----------------+------------------+
                  |
                  | HTTPS POST /api/v1/devices/events
                  v
+------------------------------------+
| Netravaani Backend (Express/Node)  |
| - Device Authentication            |
| - Request Deduplication (Idempotent|
| - Prisma ORM + PostgreSQL          |
| - Socket.IO Broadcast Server       |
+--------+------------------+--------+
         |                  |
         | Socket.IO        | REST API (CRUD, Acknowledge, Resolve)
         v                  v
+------------------------------------+
| Nurse Station Web App (Next.js 15) |
| - Real-time Alert Board            |
| - Request Workflow Management      |
| - Device & Patient Assignment      |
+------------------------------------+
```

## Architectural Principles
1. **Decoupled Operation**: The web browser does NOT need to be open for hardware to function. Devices authenticate directly with the backend API.
2. **Idempotency & Retries**: Wireless hospital environments may experience packet loss or burst retries. All device event ingestion endpoints require an `eventId` or `idempotencyKey` to guarantee exactly-once processing for care requests.
3. **Audit Trail**: Every care request records state transitions (`PENDING` -> `ACKNOWLEDGED` -> `IN_PROGRESS` -> `RESOLVED`) with timestamping and actor records.
4. **Patient-Device Configuration Versioning**: Device configurations (such as sensitivity thresholds or gesture mappings) are versioned and track operational state (`PENDING`, `APPLIED`, `FAILED`).
