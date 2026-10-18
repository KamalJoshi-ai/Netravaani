# NetraVaani device firmware nv-1.1.1

Upside Down Labs NPG Lite (ESP32-C6) on the Proto Playmate. **No external parts:**
no buzzer, no extra LEDs, no extra wires. The device samples and detects gestures on
the board and sends compact events over Wi-Fi to the backend. Bluetooth is for setup
and calibration only. See `CHANGES.md` for what changed from nv-1.0.0 and why
(including the reboot-loop root cause).

## Package contents

| Path | What it is |
|---|---|
| `NetraVaani-Device/` | Arduino sketch folder (open `NetraVaani-Device.ino`) |
| `NetraVaani-Device-nv-1.1.1-ESP32C6.merged.bin` | Prebuilt full flash image, flash at `0x0` |
| `NetraVaani-Device-nv-1.1.1.elf` | Symbols for decoding crash addresses (keep with the .bin) |
| `CHANGES.md`, `CHANGES-v1.0.0-to-v1.1.0.diff` | Explanation and the exact source patch |
| `test-tools/` | Mock backend, Bluetooth setup page, mock nurse dashboard |

SHA-256 of the prebuilt files: see `SHA256SUMS.txt`.
Check on macOS with `shasum -a 256 <file>`.

---

## Part A. Hardware

Use the board exactly as it is: NPG Lite plugged onto the Proto Playmate, LiPo on the
PicoBlade connector (check polarity, the board has no reverse-polarity protection),
electrodes on the Playmate electrode header. **If you soldered a buzzer circuit for
nv-1.0.0, you can leave it; this firmware never drives GPIO 8 or GPIO 7.**

Pins this firmware touches, all on the NPG Lite itself:

| Pin | Part | Use |
|---|---|---|
| GPIO 9 | BOOT/USER button | input: short press = silence alarm, hold 3 s = open setup window |
| GPIO 15 | 6 on-board RGB LEDs | status and alarm indication (`NV_ONBOARD_PIXELS 0` turns this off) |
| A0, A1, A2, A6 | BioAmp CH1–CH3, battery divider | ADC input, as in the official firmware |

## Part B. Build (reproducible)

Exact versions used for the prebuilt binary:

| Item | Version |
|---|---|
| Arduino-ESP32 core ("esp32 by Espressif Systems") | **3.2.0** |
| Adafruit NeoPixel | **1.15.5** |
| ArduinoJson | **7.4.2** |

### Option 1: Arduino IDE 2 (macOS, Windows, Linux)
1. Arduino IDE → Settings → Additional boards manager URLs:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
2. Boards Manager → **esp32 by Espressif Systems** → select version **3.2.0** → Install.
3. Library Manager → **Adafruit NeoPixel** 1.15.5 and **ArduinoJson** 7.4.2.
4. Open `NetraVaani-Device/NetraVaani-Device.ino`. The code is in the `nv_*` tabs;
   the `.ino` tab is intentionally only comments.
5. Tools menu, set exactly:

   | Setting | Value |
   |---|---|
   | Board | **ESP32C6 Dev Module** |
   | USB CDC On Boot | **Enabled** |
   | Partition Scheme | **Huge APP (3MB No OTA/1MB SPIFFS)** (the default is too small) |
   | CPU Frequency | 160 MHz (default) |
   | Flash Size | 4MB (32Mb) (default) |
   | Core Debug Level | None (default). Use **Error** while debugging to see stack errors |
   | Erase All Flash Before Sketch Upload | Disabled (Enabled wipes saved Wi-Fi/registration) |

6. Click **Verify**. Expected: `Sketch uses 1904007 bytes (60%)` with no warnings
   from `NetraVaani-Device` files. (Byte count may differ slightly on another OS.)

### Option 2: arduino-cli (command line)
```bash
# macOS: brew install arduino-cli
arduino-cli config init
arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core update-index
arduino-cli core install esp32:esp32@3.2.0
arduino-cli lib install "Adafruit NeoPixel@1.15.5" "ArduinoJson@7.4.2"
arduino-cli compile \
  --fqbn "esp32:esp32:esp32c6:CDCOnBoot=cdc,PartitionScheme=huge_app" \
  --warnings all --output-dir build NetraVaani-Device
# build/NetraVaani-Device.ino.merged.bin  and  build/NetraVaani-Device.ino.elf
```

## Part C. Flash

Connect the board by USB-C (LiPo may stay connected), switch the Playmate on.

**Arduino IDE:** Tools → Port → `/dev/cu.usbmodem…` (macOS) or `COMx` (Windows) → **Upload**.

**Prebuilt binary, browser:** Chrome → `https://upsidedownlabs.github.io/NPG-Lite-Flasher-Web/`
→ connect → flash your own binary → `NetraVaani-Device-nv-1.1.1-ESP32C6.merged.bin` at `0x0`.

**Prebuilt binary, esptool** (`pip3 install esptool`):
```bash
ls /dev/cu.usbmodem*                     # macOS: find the port
esptool.py --chip esp32c6 --port /dev/cu.usbmodem1101 --baud 460800 \
  write_flash 0x0 NetraVaani-Device-nv-1.1.1-ESP32C6.merged.bin
```
If the port is missing or flashing fails: hold **BOOT**, tap **RESET**, release BOOT, retry.
Flashing the merged image at `0x0` also clears saved settings and any old crash report.

## Part D. Bring-up acceptance checks (do these before anything else)

Open **Arduino IDE → Tools → Serial Monitor**, 115200 baud (it reconnects by itself
after resets, unlike `screen`). Press **RESET** on the board.

**Check 1: boots once and stays up.** Expected (values differ):
```
=== NetraVaani nv-1.1.1 booting ===
[diag] reset reason: EXTERNAL | consecutive abnormal resets: 0 | free heap: ...
[diag] no stored crash report
[boot] NPGLITE-XXXXXXXXXXXX | boot 1 | device (not registered) | config v0 | setup window open (BLE)
[ble] advertising as "NPG-Lite-3CH:XX:XX"
[adc] running: 500 Hz x 3 channels + battery
[boot] setup complete, free heap ...
[diag] up=30s heap=... minHeap=... stackFree(bytes): adc=... evt=... ui=... diag=... | wifi=down ...
```
Pass = the `=== ... booting ===` banner appears **once** and `[diag] up=30s`, `up=60s`,
`up=90s` follow, then `[diag] stable for 120 s, crash counter cleared`.

If you updated from nv-1.0.0 with the Arduino IDE (not the merged image), the first boot
may print `PREVIOUS CRASH: task 'loopTask' ...`. That is the old nv-1.0.0 crash being
reported once; it must not appear again on the next reset.

**Check 2: Bluetooth discovery.** Chrome → `chrome://bluetooth-internals/#devices` →
Start Scan. Pass = `NPG-Lite-3CH:XX:XX` appears in the list. (macOS: System Settings →
Privacy & Security → Bluetooth must allow Google Chrome.)

**Check 3: commissioning.** Run the mock backend and setup page (Part E). Pass = identity
JSON shows `"firmware":"nv-1.1.1"`, `"safeMode":false`, and after sending settings the
serial log shows `[setup] saved settings ...`, then `[wifi] connected, IP ...`.

**Do not treat the firmware as working until Checks 1–3 pass.**

### If it still reboots
1. Copy the whole Serial Monitor output, including the `Guru Meditation` / panic block
   and the `[diag] PREVIOUS CRASH` line printed after the reset.
2. Decode the addresses with the `.elf` that matches the flashed binary:
   ```bash
   ADDR2LINE=$(find ~/Library/Arduino15 -name riscv32-esp-elf-addr2line | head -1)
   $ADDR2LINE -pfiaC -e NetraVaani-Device-nv-1.1.1.elf 0x4200xxxx 0x4200yyyy
   ```
   (Windows: search `%LOCALAPPDATA%\Arduino15` for `riscv32-esp-elf-addr2line.exe`.)
3. Isolate the subsystem: in `nv_config.h` set one of `NV_ENABLE_WIFI`, `NV_ENABLE_ADC`,
   `NV_ENABLE_BLE`, `NV_ONBOARD_PIXELS` to `0`, rebuild, flash, repeat Check 1.
4. `reset reason: BROWNOUT` means the supply sagged: charge the LiPo, check its polarity,
   try another USB-C cable or port.
5. After 3 crashes in a row the board enters **SAFE MODE** (LED 0 blinks magenta,
   serial prints `!!! SAFE MODE`). Bluetooth still works so you can read identity or
   send `factory_reset`. Fix the cause, then power-cycle.

## Part E. Commission (register + Wi-Fi)

1. Install Node.js 18+ (`nodejs.org`, LTS). Then:
   ```bash
   cd test-tools
   node mock-backend.js
   ```
   Note the printed device URL, e.g. `http://172.20.10.2:4000`. Allow incoming
   connections if macOS asks. Laptop and board must share a **2.4 GHz** Wi-Fi
   (a phone hotspot works; on iPhone enable "Maximize Compatibility").
2. A board that is not set up accepts setup at any time. An already set-up board accepts new settings for 5 minutes after RESET.
3. Chrome → `http://localhost:4000/setup` → **Connect NPG Lite** → **Register device** →
   Wi-Fi name and password → **Send settings to device**.
4. LED 0: green = connected, amber = backend unreachable, purple = token rejected,
   red = no Wi-Fi.

## Part F. Gestures, calibration and end-to-end tests

| ID | Gesture | Channel | Mock `config.json` mapping |
|---|---|---|---|
| G01 | Triple jaw clench (3 short clenches within 3 s) | CH3 | REQUEST_HELP + local alarm (always on) |
| G02 | Double jaw clench | CH3 | REQUEST_WATER |
| G03 | Double blink (within 0.65 s) | CH2 | CALL_NURSE |
| G04 | Long jaw clench (1.5–4 s) | CH3 | not mapped |

Single clenches and single blinks are ignored on purpose. Electrode placement:
CH1 outer eye corners, CH2 above and below one eye, CH3 two pads on the jaw muscle,
REF behind the ear. **Unplug USB-C while electrodes are on a person.**

Calibration: the setup page counts every detected gesture. Do each gesture 20 times and
2 minutes of normal talking/chewing; record misses and false detections. Tune `tuning`
in `test-tools/config.json` and raise `version`; the board applies it within ~30 s.
For waveform-level tuning set `NV_DEBUG_SIGNAL 1` and use the Serial Plotter.

| Test | Expected |
|---|---|
| Double clench | REQUEST_WATER on the mock dashboard |
| Triple clench | Serial `[alarm] ACTIVE`, LEDs 1–4 flash red, REQUEST_HELP on dashboard |
| Dashboard **Acknowledge** | Alarm clears within ~3 s (`silenceAlarm` in heartbeat reply) |
| Short press BOOT while alarm is active | Alarm clears, `ALARM_SILENCED_LOCAL` event |
| Stop mock backend, clench twice, restart it, re-run setup page Register + Send | Queued event delivered once |
| Phone hotspot off, triple clench | Alarm still raised locally, event sent after reconnect |
| Pull off a jaw electrode | `SIGNAL_QUALITY` ch3 = bad, no clench events |
| Invalid `gestureId` in config.json | `CONFIG_FAILED`, previous config kept |

The local alarm is **software-only** in this version: no sound. It is visible on the
board's LEDs, in the serial log, over Bluetooth and on the backend.

---

## Interface contract (unchanged from nv-1.0.0, additive fields only)

### Bluetooth
Device name `NPG-Lite-3CH:XX:XX` (XX = last two MAC bytes).

NetraVaani service `a7c10001-5e4b-4d2a-9c1e-3f6e7a2b9d01`:

| Characteristic | UUID | Use |
|---|---|---|
| IDENTITY | `a7c10002-5e4b-4d2a-9c1e-3f6e7a2b9d01` | read JSON: `hardwareId`, `firmware`, `deviceId`, `provisioned`, `provisionWindowOpen`, `wifi`, `backend`, `configVersion`, `battery`, `channels`, `alarmActive`, `lastReset`, `safeMode` |
| PROVISION | `a7c10003-5e4b-4d2a-9c1e-3f6e7a2b9d01` | write JSON command |
| STATUS | `a7c10004-5e4b-4d2a-9c1e-3f6e7a2b9d01` | notify: `reply`, `gesture`, `signal`, `alarm` messages |

Commands (setup window required except `identity`): `provision`, `wifi`, `test_alarm`,
`close_window`, `factory_reset`, `reboot`, `identity`. Example:
```json
{"cmd":"provision","ssid":"Ward-WiFi","password":"...","api":"http://192.168.1.20:4000","deviceId":"NPG-001","token":"<device token>"}
```
Chords streaming service unchanged: service `4fafc201-1fb5-459e-8fcc-c5c9c331914b`,
control `0000ff01-0000-1000-8000-00805f9b34fb` (`START`/`STOP`), data
`beb5483e-36e1-4688-b7f5-ea07361b26a8` (70-byte packets, 10 × [counter, CH1, CH2, CH3 big-endian]),
battery `f633d0ec-46b4-43c1-a39f-1ca06d0602e1`.

### HTTP (device → backend), header `Authorization: Bearer <device token>`
- `POST /api/device-events`: `201` stored; `200`/`409` duplicate; `400`/`422` rejected
  permanently; anything else = retried later with the same `eventId`.
  `eventType`: `PATIENT_REQUEST`, `CONFIG_APPLIED`, `CONFIG_FAILED`, `SIGNAL_QUALITY`,
  `ALARM_SILENCED_LOCAL`.
- `POST /api/devices/{id}/heartbeat`: every 30 s (3 s while the alarm is active). Body adds
  `lastReset`, `freeHeap` in nv-1.1.0. Reply `{"desiredConfigVersion":N,"silenceAlarm":bool}`.
- `GET /api/devices/{id}/config`: blueprint configuration, or `404` if none.

## Known limitations
- No audible alarm in this version (software-only alarm).
- Not yet run on a physical board by the author of this build: Part D decides.
- Offline event queue is in RAM (16 events, 30 min); a reboot loses undelivered events.
- WPA2-Personal Wi-Fi only. HTTPS without `NV_ROOT_CA` does not verify certificates.
- Bluetooth setup is protected only by the physical setup window.
- Prototype assistive device, not a certified medical device.
