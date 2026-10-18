#pragma once
#include <Arduino.h>

// ============================================================================
//  NetraVaani device firmware: build-time settings
//  Board: Upside Down Labs NPG Lite (ESP32-C6) on the Proto Playmate
// ============================================================================

#define NV_FW_VERSION "nv-1.1.1"

// ---- Pins: only parts that are physically ON the NPG Lite board ----
// Confirmed from Upside Down Labs' docs and official firmware:
//   GPIO 15 = the 6 on-board addressable RGB LEDs
//   GPIO 9  = on-board BOOT/USER button (read only)
// NOT used in this version (no external hardware is assumed):
//   GPIO 8 (VibZ buzzer pin) and GPIO 7 are never configured or driven.
#define PIN_BOOT_BTN 9
#define PIN_PIXELS 15
#define PIXEL_COUNT 6
#define PIXEL_BRIGHT 20

// ---- Feature switches (use these to isolate a crash: flash with one disabled) ----
#define NV_ENABLE_BLE 1        // Bluetooth commissioning + calibration stream
#define NV_ENABLE_WIFI 1       // Wi-Fi + backend communication
#define NV_ENABLE_ADC 1        // signal acquisition + gesture detection
#define NV_ONBOARD_PIXELS 1    // on-board RGB LEDs for status/alarm (0 = fully software-only)

// ---- Crash-loop protection ----
// After this many consecutive crash/watchdog/brownout resets the device boots
// in SAFE MODE: Bluetooth only (so it can still be found and reset), no ADC,
// no Wi-Fi. The cause is printed on serial and shown in the identity JSON.
// Safe mode is a failure state, not normal operation. 0 = disabled.
#define NV_SAFE_MODE_AFTER_CRASHES 3
#define NV_STABLE_UPTIME_MS 120000UL  // clears the crash counter

// ---- Task stacks (bytes) ----
#define STACK_ADC 8192
#define STACK_EVT 8192
#define STACK_NET 16384
#define STACK_UI 4096
#define STACK_DIAG 4096

// ---- Signal acquisition ----
#define SAMPLE_RATE_HZ 500  // per channel
#define NUM_BIO_CH 3        // CH1 EOG-H, CH2 EOG-V, CH3 EMG
#define CH_EOG_H 0
#define CH_EOG_V 1
#define CH_EMG 2
#define BLOCK_COUNT 10      // samples per BLE packet (Chords format)

// ---- Timing ----
#define HEARTBEAT_MS 30000          // normal heartbeat
#define HEARTBEAT_ALARM_MS 3000     // faster heartbeat while alarm sounds (to receive "silence")
#define CONFIG_POLL_MS 60000        // re-check configuration even without a hint
#define PROVISION_WINDOW_MS 300000  // BLE setup window after every restart / BOOT hold: 5 minutes
// A board that is not set up yet keeps the setup window open with no time limit.
#define HTTP_TIMEOUT_MS 6000
#define EVENT_QUEUE_LEN 16          // bounded offline queue (RAM)
#define EVENT_MAX_AGE_MS 1800000UL  // drop undelivered events older than 30 min
#define GESTURE_REFRACTORY_MS 1500  // ignore new gestures right after one fires

// ---- Safety ----
// 1 = gesture G01 (triple clench) always means REQUEST_HELP and raises the
// local alarm, whatever the remote configuration says. In this version the
// alarm is software-only: state, serial log, BLE notification, heartbeat
// flag and (if enabled) on-board RGB LEDs. No buzzer output.
#define NV_FORCE_UNIVERSAL_HELP 1

// ---- HTTPS ----
// Paste your backend's root CA certificate (PEM) here for production.
// Left empty = HTTPS without certificate verification (demo only!).
// Plain http:// URLs on a private network also work for the hackathon demo.
#define NV_ROOT_CA ""

// ---- Debug ----
#define NV_DEBUG_SERIAL 1  // logs on USB serial (USB CDC) at 115200 baud
#define NV_DIAG_EVERY_MS 30000  // periodic heap/stack report on serial
#define NV_DEBUG_SIGNAL 0  // 1 = print detector envelopes for tuning (Serial Plotter)
#if NV_DEBUG_SERIAL
#define NVLOG(...) Serial.printf(__VA_ARGS__)
#else
#define NVLOG(...)
#endif

// ---- BLE: Chords-compatible streaming service (UUIDs unchanged) ----
// Lets Chords Web / calibration screens view raw signals over Bluetooth.
#define CHORDS_SERVICE_UUID "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHORDS_DATA_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define CHORDS_CONTROL_UUID "0000ff01-0000-1000-8000-00805f9b34fb"
#define CHORDS_BATTERY_UUID "f633d0ec-46b4-43c1-a39f-1ca06d0602e1"

// ---- BLE: NetraVaani commissioning service ----
#define NV_SERVICE_UUID "a7c10001-5e4b-4d2a-9c1e-3f6e7a2b9d01"
#define NV_IDENTITY_UUID "a7c10002-5e4b-4d2a-9c1e-3f6e7a2b9d01"   // read
#define NV_PROVISION_UUID "a7c10003-5e4b-4d2a-9c1e-3f6e7a2b9d01"  // write (JSON commands)
#define NV_STATUS_UUID "a7c10004-5e4b-4d2a-9c1e-3f6e7a2b9d01"     // read + notify
