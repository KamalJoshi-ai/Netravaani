// Wi-Fi + HTTP(S) communication with the NetraVaani backend.
//
// Device-facing API (the backend team implements these):
//   POST {api}/api/device-events            event delivery (retried with the same eventId)
//   POST {api}/api/devices/{id}/heartbeat   status; reply may carry desiredConfigVersion / silenceAlarm
//   GET  {api}/api/devices/{id}/config      current desired configuration
// Every request carries:  Authorization: Bearer <device token>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <time.h>
#include "nv_config.h"
#include "nv_state.h"
#include "nv_storage.h"
#include "nv_net.h"
#include "nv_alarm.h"
#include "nv_ble.h"

static QueueHandle_t sQueue = nullptr;
static uint32_t sSeq = 0;
static NvSettings sNet;  // settings snapshot owned by the network task
static int32_t sLastFailedVersion = -1;
static bool sTimeStarted = false;

int nvQueuedCount() { return sQueue ? uxQueueMessagesWaiting(sQueue) : 0; }

static bool timeValid() { return time(nullptr) > 1700000000; }

static void isoNow(char *out, size_t n) {
  time_t t = time(nullptr);
  struct tm tmv;
  gmtime_r(&t, &tmv);
  strftime(out, n, "%Y-%m-%dT%H:%M:%SZ", &tmv);
}

bool nvQueueEvent(const char *eventType, JsonDocument &fields) {
  NvSettings s = nvGetSettings();
  if (!sQueue) {
    NVLOG("[net] network task not running (safe mode or Wi-Fi disabled), %s not queued\n", eventType);
    return false;
  }
  if (!s.provisioned()) {
    NVLOG("[net] not provisioned, event %s not queued\n", eventType);
    return false;
  }
  NvEvent ev;
  memset(&ev, 0, sizeof(ev));
  uint32_t seq = __atomic_add_fetch(&sSeq, 1, __ATOMIC_SEQ_CST);
  snprintf(ev.eventId, sizeof(ev.eventId), "%s-b%lu-s%lu", s.deviceId.c_str(),
           (unsigned long)gBootId, (unsigned long)seq);
  ev.createdMs = millis();

  JsonDocument d;
  d["eventId"] = ev.eventId;
  d["deviceId"] = s.deviceId;
  d["eventType"] = eventType;
  if (timeValid()) {
    char iso[24];
    isoNow(iso, sizeof(iso));
    d["occurredAt"] = iso;
  } else {
    d["occurredAt"] = nullptr;  // backend uses its receive time
  }
  d["uptimeMs"] = ev.createdMs;
  d["bootId"] = gBootId;
  d["seq"] = seq;
  d["firmware"] = NV_FW_VERSION;
  for (JsonPairConst kv : fields.as<JsonObjectConst>()) d[kv.key()] = kv.value();

  if (measureJson(d) >= sizeof(ev.body)) { NVLOG("[net] event too large\n"); return false; }
  serializeJson(d, ev.body, sizeof(ev.body));

  if (xQueueSend(sQueue, &ev, 0) != pdTRUE) {  // full: drop the oldest, keep the newest
    NvEvent old;
    xQueueReceive(sQueue, &old, 0);
    NVLOG("[net] queue full, dropped %s\n", old.eventId);
    xQueueSend(sQueue, &ev, 0);
  }
  NVLOG("[net] queued %s %s\n", ev.eventId, eventType);
  return true;
}

static int httpCall(const char *method, const String &path, const char *body, String &resp) {
  String url = sNet.apiBase + path;
  HTTPClient http;
  WiFiClient plain;
  WiFiClientSecure secure;
  bool ok;
  if (url.startsWith("https://")) {
    if (strlen(NV_ROOT_CA)) secure.setCACert(NV_ROOT_CA);
    else secure.setInsecure();  // demo only, see NV_ROOT_CA in nv_config.h
    ok = http.begin(secure, url);
  } else {
    ok = http.begin(plain, url);
  }
  if (!ok) return -1;
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + sNet.token);
  http.addHeader("X-Device-Id", sNet.deviceId);
  http.addHeader("X-Firmware", NV_FW_VERSION);
  int code = strcmp(method, "GET") == 0 ? http.GET() : http.POST((uint8_t *)body, strlen(body));
  if (code > 0) resp = http.getString();
  http.end();
  if (code == 401 || code == 403) gBackendAuthError = true;
  else if (code > 0) gBackendAuthError = false;
  gBackendOk = code >= 200 && code < 500 && code != 401 && code != 403;
  return code;
}

// ---------------- events ----------------
static uint32_t sNextSendAt = 0, sBackoff = 0;

static void pumpQueue() {
  if ((int32_t)(millis() - sNextSendAt) < 0) return;
  NvEvent ev;
  if (xQueuePeek(sQueue, &ev, 0) != pdTRUE) return;
  if (millis() - ev.createdMs > EVENT_MAX_AGE_MS) {
    xQueueReceive(sQueue, &ev, 0);
    NVLOG("[net] dropped stale %s\n", ev.eventId);
    return;
  }
  String resp;
  int code = httpCall("POST", "/api/device-events", ev.body, resp);
  if (code == 200 || code == 201 || code == 409) {  // 409 = duplicate, already stored
    xQueueReceive(sQueue, &ev, 0);
    sBackoff = 0;
    NVLOG("[net] delivered %s (%d)\n", ev.eventId, code);
  } else if (code == 400 || code == 422) {  // rejected permanently, retrying will not help
    xQueueReceive(sQueue, &ev, 0);
    NVLOG("[net] backend rejected %s (%d): %s\n", ev.eventId, code, resp.c_str());
  } else {  // network error, timeout, 401/403, 5xx: retry later with the same eventId
    sBackoff = sBackoff ? min<uint32_t>(sBackoff * 2, 30000) : 1000;
    sNextSendAt = millis() + sBackoff + random(0, sBackoff / 4 + 1);
    NVLOG("[net] send failed (%d), retry in %lu ms\n", code, (unsigned long)sBackoff);
  }
}

// ---------------- heartbeat ----------------
static uint32_t sLastHeartbeat = 0;

static void heartbeat() {
  NvConfig c = nvGetConfig();
  JsonDocument d;
  d["deviceId"] = sNet.deviceId;
  d["firmware"] = NV_FW_VERSION;
  d["bootId"] = gBootId;
  d["uptimeMs"] = millis();
  d["configVersion"] = c.version;
  if (gBatteryPct <= 100) d["battery"] = gBatteryPct;
  d["rssi"] = WiFi.RSSI();
  d["alarmActive"] = nvAlarmActive();
  d["queued"] = nvQueuedCount();
  d["lastReset"] = gLastReset;
  d["freeHeap"] = ESP.getFreeHeap();
  JsonObject ch = d["channels"].to<JsonObject>();
  ch["ch1"] = gChannelOk[0] ? "ok" : "bad";
  ch["ch2"] = gChannelOk[1] ? "ok" : "bad";
  ch["ch3"] = gChannelOk[2] ? "ok" : "bad";
  char body[400];
  serializeJson(d, body, sizeof(body));

  String resp;
  int code = httpCall("POST", "/api/devices/" + sNet.deviceId + "/heartbeat", body, resp);
  if (code != 200) { NVLOG("[net] heartbeat failed (%d)\n", code); return; }
  JsonDocument r;
  if (deserializeJson(r, resp)) return;
  if (r["desiredConfigVersion"].is<int>()) gDesiredConfigVersion = r["desiredConfigVersion"].as<int>();
  if (r["silenceAlarm"] | false) {
    if (nvAlarmActive()) NVLOG("[net] nurse acknowledged, silencing alarm\n");
    nvAlarmStop();
  }
}

// ---------------- configuration ----------------
static uint32_t sLastConfigPoll = 0;

static void fetchConfig() {
  String resp;
  int code = httpCall("GET", "/api/devices/" + sNet.deviceId + "/config", "", resp);
  sLastConfigPoll = millis();
  if (code == 404) return;  // nothing configured yet
  if (code != 200) { NVLOG("[net] config fetch failed (%d)\n", code); return; }

  NvConfig current = nvGetConfig();
  NvConfig next;
  String err;
  if (!nvParseConfig(resp, next, err)) {
    JsonDocument peek;
    int badVersion = -1;
    if (!deserializeJson(peek, resp)) {
      JsonVariantConst root = peek.as<JsonVariantConst>();
      if (!peek["config"].isNull()) root = peek["config"].as<JsonVariantConst>();
      badVersion = root["version"] | -1;
    }
    if (badVersion != sLastFailedVersion) {  // report each bad version once
      sLastFailedVersion = badVersion;
      JsonDocument f;
      f["rejectedVersion"] = badVersion;
      f["appliedVersion"] = current.version;
      f["error"] = err;
      nvQueueEvent("CONFIG_FAILED", f);
    }
    NVLOG("[cfg] rejected: %s (keeping v%d)\n", err.c_str(), (int)current.version);
    return;
  }
  if (next.version == current.version) return;
  if (!nvSaveConfigJson(resp)) {
    JsonDocument f;
    f["rejectedVersion"] = next.version;
    f["appliedVersion"] = current.version;
    f["error"] = "storage failed";
    nvQueueEvent("CONFIG_FAILED", f);
    return;
  }
  nvSetConfig(next);
  NVLOG("[cfg] applied v%d\n", (int)next.version);
  JsonDocument f;
  f["appliedVersion"] = next.version;
  nvQueueEvent("CONFIG_APPLIED", f);
}

// ---------------- Wi-Fi ----------------
static uint32_t sWifiRetryAt = 0, sWifiBackoff = 5000;
static volatile uint8_t sLastDiscReason = 0;
static bool sScanned = false;

// Logs WHY the connection failed (wrong password, network not found, ...)
static void onWifiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  if (event != ARDUINO_EVENT_WIFI_STA_DISCONNECTED) return;
  uint8_t r = info.wifi_sta_disconnected.reason;
  if (r == sLastDiscReason) return;  // do not repeat the same reason on every retry
  sLastDiscReason = r;
  NVLOG("[wifi] disconnected, reason %u: %s\n", r, WiFi.disconnectReasonName((wifi_err_reason_t)r));
  if (r == WIFI_REASON_NO_AP_FOUND)
    NVLOG("[wifi] -> network name not found. It must match exactly (capitals, spaces, apostrophes) and be 2.4 GHz.\n");
  else if (r == WIFI_REASON_AUTH_FAIL || r == WIFI_REASON_4WAY_HANDSHAKE_TIMEOUT || r == WIFI_REASON_HANDSHAKE_TIMEOUT)
    NVLOG("[wifi] -> wrong Wi-Fi password.\n");
}

// After the first failure, list the 2.4 GHz networks the board can actually see.
static void scanAndReport() {
  NVLOG("[wifi] scanning for networks...\n");
  int n = WiFi.scanNetworks(false, true);
  bool found = false;
  if (n <= 0) NVLOG("[wifi] no networks visible (hotspot off, or 5 GHz only?)\n");
  for (int i = 0; i < n && i < 15; i++) {
    String s = WiFi.SSID(i);
    bool match = s == sNet.ssid;
    found |= match;
    NVLOG("[wifi]   \"%s\"  ch %d  %d dBm%s\n", s.c_str(), (int)WiFi.channel(i), (int)WiFi.RSSI(i), match ? "  <- your network" : "");
  }
  if (n > 0 && !found)
    NVLOG("[wifi] \"%s\" is NOT in this list. Fix the name on the setup page (copy it exactly from above).\n", sNet.ssid.c_str());
  WiFi.scanDelete();
}

static bool ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!gWifiUp) NVLOG("[wifi] connected, IP %s\n", WiFi.localIP().toString().c_str());
    gWifiUp = true;
    sWifiBackoff = 5000;
    return true;
  }
  if (gWifiUp) NVLOG("[wifi] lost connection\n");
  gWifiUp = false;
  gBackendOk = false;
  if ((int32_t)(millis() - sWifiRetryAt) < 0) return false;
  NVLOG("[wifi] connecting to \"%s\"\n", sNet.ssid.c_str());
  WiFi.disconnect();
  vTaskDelay(pdMS_TO_TICKS(200));
  WiFi.begin(sNet.ssid.c_str(), sNet.pass.c_str());
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) vTaskDelay(pdMS_TO_TICKS(250));
  if (WiFi.status() == WL_CONNECTED) return ensureWifi();
  if (!sScanned) {
    sScanned = true;
    WiFi.disconnect();
    vTaskDelay(pdMS_TO_TICKS(200));
    scanAndReport();
  }
  sWifiRetryAt = millis() + sWifiBackoff;
  sWifiBackoff = min<uint32_t>(sWifiBackoff * 2, 60000);
  NVLOG("[wifi] failed, retry in %lu s\n", (unsigned long)(sWifiBackoff / 2000));
  return false;
}

static void netTask(void *) {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false);  // this task handles reconnects (avoids "sta is connecting" errors)
  WiFi.onEvent(onWifiEvent);
  sNet = nvGetSettings();
  for (;;) {
    if (gSettingsChanged) {
      gSettingsChanged = false;
      sNet = nvGetSettings();
      WiFi.disconnect();
      gWifiUp = false;
      sWifiRetryAt = 0;
      sWifiBackoff = 5000;
      sLastHeartbeat = 0;
      sLastConfigPoll = 0;
      sScanned = false;
      sLastDiscReason = 0;
      NVLOG("[net] new settings for %s\n", sNet.deviceId.c_str());
    }
    if (!sNet.provisioned()) { vTaskDelay(pdMS_TO_TICKS(500)); continue; }
    if (!ensureWifi()) { vTaskDelay(pdMS_TO_TICKS(500)); continue; }
    if (!sTimeStarted) {
      configTime(0, 0, "pool.ntp.org", "time.google.com");  // UTC
      sTimeStarted = true;
    }

    pumpQueue();

    uint32_t hbEvery = nvAlarmActive() ? HEARTBEAT_ALARM_MS : HEARTBEAT_MS;
    if (sLastHeartbeat == 0 || millis() - sLastHeartbeat >= hbEvery) {
      sLastHeartbeat = millis();
      heartbeat();
    }
    NvConfig c = nvGetConfig();
    bool newer = gDesiredConfigVersion > 0 && gDesiredConfigVersion != c.version &&
                 gDesiredConfigVersion != sLastFailedVersion;
    uint32_t sincePoll = millis() - sLastConfigPoll;
    if (sLastConfigPoll == 0 || (newer && sincePoll >= 5000) || sincePoll >= CONFIG_POLL_MS) fetchConfig();

    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

void nvNetBegin() {
  sQueue = xQueueCreate(EVENT_QUEUE_LEN, sizeof(NvEvent));
  xTaskCreatePinnedToCore(netTask, "nv_net", STACK_NET, nullptr, 3, &gTaskNet, 0);
}
