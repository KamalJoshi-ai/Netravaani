/*
  NetraVaani device firmware nv-1.1.0
  Upside Down Labs NPG Lite (ESP32-C6) on the Proto Playmate. No external parts.

  What it does
    - Samples CH1 (EOG-H), CH2 (EOG-V), CH3 (EMG) at 500 Hz on the device
    - Detects gestures locally: G01 triple clench, G02 double clench,
      G03 double blink, G04 long clench
    - Maps gestures to actions using the versioned configuration from the backend
    - Sends compact JSON events over Wi-Fi (retries with the same eventId,
      bounded offline queue, heartbeat, config versioning)
    - Local alarm for universal help: software-only in this version
      (serial log, BLE notification, heartbeat flag, on-board RGB LEDs)
    - Bluetooth LE commissioning + Chords-compatible calibration stream
    - Boot diagnostics: reset reason, previous crash from the flash core dump,
      periodic heap/stack report, crash-loop safe mode

  Signal acquisition setup follows Upside Down Labs' open-source NPG Lite
  firmware (GPL-3.0); this firmware is released under GPL-3.0 as well.

  Build: see README "Build and flash". Board ESP32C6 Dev Module, Arduino-ESP32 3.2.0,
  USB CDC On Boot: Enabled, Partition Scheme: Huge APP (3MB No OTA/1MB SPIFFS).
*/

// This file intentionally contains no code. The firmware entry points
// setup() and loop() are in nv_main.cpp (see the note there).
