# NetraVaani firmware changes

## nv-1.1.1 (setup and Wi-Fi diagnostics)

| Change | Why |
|---|---|
| A board that is not set up keeps the Bluetooth setup window open with no time limit | Setup failed repeatedly because the 3-minute window had expired before "Send" |
| Every restart (RESET) opens the setup window for 5 minutes, also on a board that is already set up | Lets you correct a wrong Wi-Fi name without the BOOT button or re-flashing |
| Every setup command is logged on serial: received, accepted, or rejected with the reason | You can see in the Serial Monitor exactly why a "Send" failed |
| BOOT presses are logged (`[ui] BOOT pressed` / `released after N ms`) | Shows whether the button is being detected |
| Wi-Fi failures print the reason (`network not found`, `wrong password`, ...) and, after the first failure, a list of the 2.4 GHz networks the board can see, with your network marked | iPhone hotspot names often contain a curly apostrophe (’) that looks like ' but does not match |
| Auto-reconnect handled only by the firmware's Wi-Fi task | Removes the harmless but confusing `E (...) wifi:sta is connecting, return error` lines |

Exact patch: `CHANGES-v1.1.0-to-v1.1.1.diff`. BLE UUIDs, backend API, signal acquisition
and gesture detection are unchanged. Verified: builds with zero warnings; `setup()`
and `loop()` contain no self-calls (checked by disassembly). Not yet run on a board.

---

# nv-1.1.0: what changed and why

## 1. Reboot loop: root cause (confirmed)

The prebuilt `NetraVaani-Device-ESP32C6.merged.bin` shipped with nv-1.0.0 contains
a call to `setup()` as the first instruction of `setup()` itself. Disassembly of
that build:

```
420000b6 <setup()>:
  ...
  420000e2:  jal  420000b6 <_Z5setupv>     <- setup() calls itself
```

Every boot therefore recursed until the main task's stack overflowed, the
stack-protection check panicked, and the chip reset, forever. Nothing useful
reached the serial port because it happened before the first log line.

Why: the Arduino builder generates prototypes for functions defined in the
`.ino` file. The tool used to build that binary generated a malformed prototype
(`setup();` without a return type) and inserted it just after the opening brace
of `setup()`, turning it into a self-call. Building the same source in the
Arduino IDE would not have produced it, which is why it looked like a
board problem.

Fix: the `.ino` now contains no code. `setup()` and `loop()` are in
`nv_main.cpp`, so no prototypes are generated at all and the result no longer
depends on the build tool. The nv-1.1.0 binary was verified by disassembly:
`setup()` and `loop()` contain no self-calls, and the build has zero compiler
warnings with all warnings enabled.

(The earlier `NetraVaani-NPG-BLE` binary was checked the same way and does not
have this defect.)

## 2. Bluetooth discovery: root cause (confirmed)

nv-1.0.0 added the 128-bit Chords service UUID (18 bytes) to the advertisement.
The Arduino BLE library copies the advertisement into the scan response and then
adds the device name (20 bytes for `NPG-Lite-3CH:XX:XX`) and TX power (3 bytes):
41 bytes, over the 31-byte BLE limit. The stack rejects that scan response, so the
name is never broadcast and a browser filtering on the `NPG` name prefix finds
nothing. The error is only printed at Core Debug Level "Error" or higher.

Fix: advertising now matches the official NPG Lite firmware (no service UUIDs):
flags in the advertisement, name + TX power in the scan response = 23 bytes. The
result of starting advertising is printed on serial:
`[ble] advertising as "NPG-Lite-3CH:XX:XX"` or `ADVERTISING FAILED`.

## 3. Crash-risk reductions (preventive)

| Change | Reason |
|---|---|
| ADC task no longer builds JSON, writes flash, logs or touches the network queue. It posts a 1-byte message to a new events task (`nv_evt`) | In v1.0.0 a gesture or signal-quality change ran JSON building, a 548-byte event struct, `printf` and BLE calls inside the 500 Hz ADC task with a 6 KB stack |
| Bluetooth write callbacks only copy bytes into the events queue; parsing and flash writes run in `nv_evt`. Identity reads return a cached string | Keeps flash writes and JSON allocations out of the Bluetooth stack's task |
| Task stacks raised: ADC 8 KB, events 8 KB, network 16 KB (TLS), UI 4 KB | Headroom; actual free stack is printed every 30 s so it can be checked on the board |
| `Serial.setTxTimeoutMs(0)` | Logging never blocks a task when no USB host is reading |

## 4. Hardware assumptions removed

- GPIO 8 (buzzer) and GPIO 7 are never configured or driven.
- The only pins used are on the NPG Lite itself: GPIO 9 (BOOT/USER button, input)
  and GPIO 15 (the six on-board RGB LEDs). The LEDs can be disabled with
  `NV_ONBOARD_PIXELS 0` for a completely output-free build.
- The local alarm logic is unchanged (G01 still raises it immediately, the
  backend can still silence it, BOOT still silences it locally), but it is
  software-only: serial log, BLE status notification `{"type":"alarm",...}`,
  `alarmActive` in heartbeat and identity, and on-board LEDs 1–4 flashing red.

## 5. Diagnostics added (errors are shown, never hidden)

- Every boot prints the reset reason (`POWERON`, `PANIC`, `TASK_WATCHDOG`,
  `BROWNOUT`, ...) and the number of consecutive abnormal resets.
- If the previous boot crashed, the saved core dump summary is printed: task
  name, PC, RA, MCAUSE, MTVAL, plus the exact `addr2line` command to decode it
  with the shipped `.elf`. The full ESP-IDF panic report still prints live as before.
- Every 30 s: uptime, free heap, minimum free heap, free stack per task,
  Wi-Fi/backend/alarm state.
- Crash-loop safe mode: after 3 consecutive crash/watchdog/brownout resets the
  board boots with Bluetooth only (no ADC, no Wi-Fi) so it can still be found,
  read and factory-reset. It prints `!!! SAFE MODE` and reports
  `"safeMode": true`. Safe mode is a failure state, not normal operation.
- Feature switches `NV_ENABLE_BLE`, `NV_ENABLE_WIFI`, `NV_ENABLE_ADC` to isolate a
  crash by disabling one subsystem at a time.

## 6. Compatibility

- BLE UUIDs: unchanged (Chords service and NetraVaani commissioning service).
- Backend API: unchanged endpoints and fields. Additive only: heartbeat gains
  `lastReset`, `freeHeap`; identity gains `alarmActive`, `lastReset`, `safeMode`;
  STATUS notifications gain `{"type":"alarm","active":...}`; new setup command
  `{"cmd":"reboot"}`. The mock backend and setup page work unchanged.
- Signal acquisition (500 Hz x 3 + battery, ADC continuous mode) and the gesture
  detectors (`nv_detect.cpp`) are unchanged.

## 7. File-by-file

| File | Change |
|---|---|
| `NetraVaani-Device.ino` | Now comments only |
| `nv_main.cpp` | New: `setup()`/`loop()`, boot order, feature switches, safe mode |
| `nv_diag.cpp/.h` | New: reset reason, core dump summary, crash counter, periodic report |
| `nv_events.cpp/.h` | Rewritten as the events task (gestures, signal, alarm, provisioning, identity cache) |
| `nv_alarm.cpp/.h` | Software-only alarm; GPIO 7/8 removed; BOOT button + optional on-board LEDs |
| `nv_ble.cpp/.h` | Advertising fix; callbacks only copy data; identity cache |
| `nv_config.h` | Version, pin comments, feature switches, stack sizes, safe-mode settings |
| `nv_state.cpp/.h` | Diagnostics state and task handles |
| `nv_signal.cpp` | Stack size constant, task handle, start log line |
| `nv_net.cpp` | Stack size, task handle, heartbeat `lastReset`/`freeHeap`, clearer log |

The complete line-by-line patch is in `CHANGES-v1.0.0-to-v1.1.0.diff`.

## 8. Not verified yet

This build compiles cleanly and the two defects above are confirmed and fixed in
the binary, but it has **not been run on a physical NPG Lite**. Treat it as
unverified until the bring-up checks in README Part D pass on your board.
