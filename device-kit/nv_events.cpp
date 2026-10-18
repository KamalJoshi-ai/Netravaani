// Events task. Everything that allocates memory, writes flash, builds JSON or
// talks to Bluetooth/the network queue runs here, NOT in the 500 Hz ADC task
// or in Bluetooth stack callbacks. Those only post small messages.
#include <Arduino.h>
#include <ArduinoJson.h>
#include "freertos/queue.h"
#include "nv_config.h"
#include "nv_types.h"
#include "nv_state.h"
#include "nv_storage.h"
#include "nv_alarm.h"
#include "nv_ble.h"
#include "nv_detect.h"
#include "nv_net.h"
#include "nv_events.h"

enum NvMsgKind : uint8_t { MSG_GESTURE, MSG_QUALITY, MSG_SILENCE, MSG_ALARM, MSG_PROVISION };
struct NvMsg {
  NvMsgKind kind;
  uint8_t value;
  uint16_t len;
  char data[520];
};

static QueueHandle_t sQ = nullptr;
static volatile uint32_t sDropped = 0;

static void post(NvMsgKind k, uint8_t v, const uint8_t *data = nullptr, size_t len = 0) {
  if (!sQ) return;
  NvMsg m;
  m.kind = k;
  m.value = v;
  m.len = 0;
  if (data && len) {
    m.len = len < sizeof(m.data) - 1 ? len : sizeof(m.data) - 1;
    memcpy(m.data, data, m.len);
  }
  m.data[m.len] = 0;
  if (xQueueSend(sQ, &m, 0) != pdTRUE) sDropped = sDropped + 1;
}

// ---------- hooks called from other tasks (must stay tiny) ----------
void nvOnGesture(NvGesture g) {
#if NV_FORCE_UNIVERSAL_HELP
  if (g == G01) nvAlarmStart();  // raise the local alarm immediately, no queue in between
#endif
  post(MSG_GESTURE, g);
}
void nvOnSignalQualityChanged() { post(MSG_QUALITY, 0); }
void nvOnLocalSilence() { post(MSG_SILENCE, 0); }
void nvOnAlarmChanged(bool active) { post(MSG_ALARM, active ? 1 : 0); }
void nvPostProvisionCommand(const uint8_t *data, size_t len) { post(MSG_PROVISION, 0, data, len); }

// ---------- identity JSON (cached for Bluetooth reads) ----------
static String identityJson() {
  NvSettings s = nvGetSettings();
  NvConfig c = nvGetConfig();
  JsonDocument d;
  d["hardwareId"] = gHardwareId;
  d["firmware"] = NV_FW_VERSION;
  if (s.deviceId.length()) d["deviceId"] = s.deviceId;
  else d["deviceId"] = nullptr;
  d["provisioned"] = s.provisioned();
  d["provisionWindowOpen"] = nvProvisionOpen();
  d["wifi"] = gWifiUp ? "connected" : (s.ssid.length() ? "disconnected" : "not_set");
  d["backend"] = gBackendAuthError ? "auth_error" : (gBackendOk ? "ok" : "unreachable");
  d["configVersion"] = c.version;
  if (gBatteryPct <= 100) d["battery"] = gBatteryPct;
  JsonArray ch = d["channels"].to<JsonArray>();
  for (int i = 0; i < 3; i++) ch.add(gChannelOk[i] ? "ok" : "bad");
  d["alarmActive"] = nvAlarmActive();
  d["lastReset"] = gLastReset;
  d["safeMode"] = gSafeMode;
  String out;
  serializeJson(d, out);
  return out;
}

// ---------- handlers ----------
static void handleGesture(NvGesture g) {
  NvConfig c = nvGetConfig();
  const NvGestureMap &m = c.map[g];

  JsonDocument b;
  b["type"] = "gesture";
  b["gestureId"] = NV_GESTURE_CODES[g];
  b["name"] = NV_GESTURE_NAMES[g];
  b["mapped"] = m.enabled;
  if (m.enabled) b["action"] = m.action;
  String bs;
  serializeJson(b, bs);
  nvBleNotifyStatus(bs);
  NVLOG("[gesture] %s %s -> %s\n", NV_GESTURE_CODES[g], NV_GESTURE_NAMES[g], m.enabled ? m.action : "(not mapped)");

  if (!m.enabled) return;
  bool help = strcmp(m.action, "REQUEST_HELP") == 0 || strcmp(m.action, "EMERGENCY") == 0;
  if (help) nvAlarmStart();

  JsonDocument f;
  f["gestureId"] = NV_GESTURE_CODES[g];
  f["action"] = m.action;
  f["mode"] = m.mode;
  f["configVersion"] = c.version;
  nvQueueEvent("PATIENT_REQUEST", f);
}

static void handleQuality() {
  JsonDocument f;
  JsonObject ch = f["channels"].to<JsonObject>();
  ch["ch1"] = gChannelOk[0] ? "ok" : "bad";
  ch["ch2"] = gChannelOk[1] ? "ok" : "bad";
  ch["ch3"] = gChannelOk[2] ? "ok" : "bad";
  NVLOG("[signal] ch1=%s ch2=%s ch3=%s\n", gChannelOk[0] ? "ok" : "bad",
        gChannelOk[1] ? "ok" : "bad", gChannelOk[2] ? "ok" : "bad");
  nvQueueEvent("SIGNAL_QUALITY", f);
  JsonDocument b;
  b["type"] = "signal";
  b["channels"] = f["channels"];
  String bs;
  serializeJson(b, bs);
  nvBleNotifyStatus(bs);
}

static void handleAlarm(bool active) {
  NVLOG("[alarm] %s (software-only alarm: no buzzer in this build)\n", active ? "ACTIVE" : "cleared");
  nvBleNotifyStatus(String("{\"type\":\"alarm\",\"active\":") + (active ? "true" : "false") + "}");
}

static void handleSilence() {
  NVLOG("[alarm] silenced with BOOT button\n");
  JsonDocument f;
  f["reason"] = "BOOT_BUTTON";
  nvQueueEvent("ALARM_SILENCED_LOCAL", f);
}

// Provisioning commands (JSON). Changing settings requires the setup window,
// open for 3 minutes after boot when unprovisioned, or after holding BOOT 3 s.
static void handleProvision(const char *raw) {
  JsonDocument d;
  if (deserializeJson(d, raw)) { nvBleReply(false, "invalid JSON"); return; }
  String cmd = d["cmd"] | "";

  NVLOG("[setup] received command \"%s\"\n", cmd.c_str());
  if (cmd == "identity") { nvBleNotifyStatus(identityJson()); return; }
  if (!nvProvisionOpen()) {
    NVLOG("[setup] rejected: setup window closed (press RESET, or hold BOOT 3 s)\n");
    nvBleReply(false, "setup window closed: press RESET (or hold BOOT 3 s) and send again");
    return;
  }

  if (cmd == "provision" || cmd == "wifi") {
    NvSettings s = nvGetSettings();
    if (d["ssid"].is<const char *>()) s.ssid = d["ssid"].as<const char *>();
    if (d["password"].is<const char *>()) s.pass = d["password"].as<const char *>();
    if (cmd == "provision") {
      s.apiBase = d["api"] | "";
      s.deviceId = d["deviceId"] | "";
      s.token = d["token"] | "";
      s.apiBase.trim();
      while (s.apiBase.endsWith("/")) s.apiBase.remove(s.apiBase.length() - 1);
      if (!(s.apiBase.startsWith("http://") || s.apiBase.startsWith("https://"))) {
        NVLOG("[setup] rejected: backend URL must start with http:// or https://\n");
        nvBleReply(false, "api must start with http:// or https://");
        return;
      }
      if (s.deviceId.length() < 3 || s.deviceId.length() > 40 || s.token.length() < 16 || s.token.length() > 200) {
        NVLOG("[setup] rejected: deviceId/token missing or wrong length (click Register first)\n");
        nvBleReply(false, "deviceId or token missing: click Register device first");
        return;
      }
    }
    if (s.ssid.length() == 0 || s.ssid.length() > 32 || s.pass.length() > 64) {
      NVLOG("[setup] rejected: Wi-Fi name empty or too long\n");
      nvBleReply(false, "invalid Wi-Fi credentials");
      return;
    }
    nvSaveSettings(s);
    nvLock();
    gSettings = s;
    nvUnlock();
    gProvisioned = s.provisioned();
    gSettingsChanged = true;
    NVLOG("[setup] saved settings for %s, Wi-Fi \"%s\", backend %s\n", s.deviceId.c_str(), s.ssid.c_str(), s.apiBase.c_str());
#if NV_ENABLE_WIFI
    nvBleReply(true, gSafeMode ? "saved; SAFE MODE: Wi-Fi off until crash is fixed" : "saved, connecting to Wi-Fi");
#else
    nvBleReply(true, "saved; Wi-Fi disabled in this build (NV_ENABLE_WIFI 0)");
#endif
    return;
  }
  if (cmd == "test_alarm") { nvAlarmTest(); nvBleReply(true, "LED test (software alarm, no buzzer)"); return; }
  if (cmd == "close_window") { gProvisionUntil = 0; nvBleReply(true, "setup window closed"); return; }
  if (cmd == "reboot") { nvBleReply(true, "rebooting"); delay(300); ESP.restart(); }
  if (cmd == "factory_reset") {
    nvBleReply(true, "erasing settings, rebooting");
    nvFactoryReset();
    delay(500);
    ESP.restart();
  }
  nvBleReply(false, "unknown cmd");
}

static void eventsTask(void *) {
  NvMsg *m = (NvMsg *)malloc(sizeof(NvMsg));  // keep the 520-byte buffer off the stack
  uint32_t lastIdentity = 0, reportedDrops = 0;
  for (;;) {
    if (xQueueReceive(sQ, m, pdMS_TO_TICKS(250)) == pdTRUE) {
      switch (m->kind) {
        case MSG_GESTURE: handleGesture((NvGesture)m->value); break;
        case MSG_QUALITY: handleQuality(); break;
        case MSG_SILENCE: handleSilence(); break;
        case MSG_ALARM: handleAlarm(m->value); break;
        case MSG_PROVISION: handleProvision(m->data); break;
      }
    }
    if (millis() - lastIdentity >= 1000) {
      lastIdentity = millis();
      nvBleSetIdentity(identityJson());
    }
    if (sDropped != reportedDrops) {
      NVLOG("[evt] WARNING: %lu messages dropped (events queue full)\n", (unsigned long)(sDropped - reportedDrops));
      reportedDrops = sDropped;
    }
  }
}

void nvEventsBegin() {
  sQ = xQueueCreate(6, sizeof(NvMsg));
  nvBleSetIdentity(identityJson());
  xTaskCreatePinnedToCore(eventsTask, "nv_evt", STACK_EVT, nullptr, 3, &gTaskEvt, 0);
}
