// Persistent storage in ESP32 NVS (survives reboot and power loss)
#include <Preferences.h>
#include <ArduinoJson.h>
#include "nv_config.h"
#include "nv_storage.h"
#include "nv_state.h"

static Preferences prefs;
static const char *NS = "nv";

void nvStorageBegin() {
  prefs.begin(NS, false);
  prefs.end();
}

NvSettings nvLoadSettings() {
  NvSettings s;
  nvLock();
  prefs.begin(NS, true);
  s.ssid = prefs.getString("ssid", "");
  s.pass = prefs.getString("pass", "");
  s.apiBase = prefs.getString("api", "");
  s.deviceId = prefs.getString("devid", "");
  s.token = prefs.getString("token", "");
  prefs.end();
  nvUnlock();
  return s;
}

void nvSaveSettings(const NvSettings &s) {
  nvLock();
  prefs.begin(NS, false);
  prefs.putString("ssid", s.ssid);
  prefs.putString("pass", s.pass);
  prefs.putString("api", s.apiBase);
  prefs.putString("devid", s.deviceId);
  prefs.putString("token", s.token);
  prefs.end();
  nvUnlock();
}

void nvFactoryReset() {
  nvLock();
  prefs.begin(NS, false);
  uint32_t boot = prefs.getUInt("boot", 0);  // keep boot counter so event IDs stay unique
  prefs.clear();
  prefs.putUInt("boot", boot);
  prefs.end();
  nvUnlock();
}

uint32_t nvNextBootId() {
  nvLock();
  prefs.begin(NS, false);
  uint32_t b = prefs.getUInt("boot", 0) + 1;
  prefs.putUInt("boot", b);
  prefs.end();
  nvUnlock();
  return b;
}

void nvDefaultConfig(NvConfig &c) {
  memset(&c, 0, sizeof(c));
  c.version = 0;
  c.map[G01].enabled = true;
  strlcpy(c.map[G01].action, "REQUEST_HELP", sizeof(c.map[G01].action));
  strlcpy(c.map[G01].mode, "universal", sizeof(c.map[G01].mode));
  c.emgMin = 60;
  c.emgFactor = 4;
  c.eogMin = 120;
  c.eogFactor = 5;
}

static int gestureIndex(const char *code) {
  for (int g = 1; g < G_MAX; g++)
    if (strcmp(code, NV_GESTURE_CODES[g]) == 0) return g;
  return -1;
}

static bool validAction(const char *a) {
  size_t n = strlen(a);
  if (n < 2 || n > 32) return false;
  for (size_t i = 0; i < n; i++) {
    char ch = a[i];
    if (!((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '_')) return false;
  }
  return true;
}

static bool readBounded(JsonVariantConst v, float lo, float hi, float &dst, const char *name, String &err) {
  if (v.isNull()) return true;
  if (!v.is<float>()) { err = String(name) + " must be a number"; return false; }
  float x = v.as<float>();
  if (x < lo || x > hi) { err = String(name) + " out of range"; return false; }
  dst = x;
  return true;
}

// Validates a configuration from the backend. Accepts either the config object
// itself or { "config": { ... } }. On any error the config is rejected whole.
bool nvParseConfig(const String &json, NvConfig &out, String &err) {
  JsonDocument doc;
  DeserializationError e = deserializeJson(doc, json);
  if (e) { err = String("invalid JSON: ") + e.c_str(); return false; }
  JsonVariantConst root = doc.as<JsonVariantConst>();
  if (!doc["config"].isNull()) root = doc["config"].as<JsonVariantConst>();

  if (!root["version"].is<int>()) { err = "missing integer version"; return false; }
  int version = root["version"].as<int>();
  if (version < 1) { err = "version must be >= 1"; return false; }

  NvConfig c;
  nvDefaultConfig(c);
  for (int g = 1; g < G_MAX; g++) c.map[g].enabled = false;
  c.version = version;

  JsonArrayConst arr = root["gestures"].as<JsonArrayConst>();
  if (arr.isNull()) { err = "missing gestures array"; return false; }
  if (arr.size() > 8) { err = "too many gestures"; return false; }
  for (JsonObjectConst g : arr) {
    const char *gid = g["gestureId"] | "";
    const char *act = g["action"] | "";
    const char *mode = g["mode"] | "custom";
    int idx = gestureIndex(gid);
    if (idx < 0) { err = String("unsupported gestureId ") + gid; return false; }
    if (!validAction(act)) { err = String("invalid action for ") + gid; return false; }
    if (g["enabled"].is<bool>() && !g["enabled"].as<bool>()) continue;
    c.map[idx].enabled = true;
    strlcpy(c.map[idx].action, act, sizeof(c.map[idx].action));
    strlcpy(c.map[idx].mode, mode, sizeof(c.map[idx].mode));
  }

  JsonVariantConst t = root["tuning"];
  if (!t.isNull()) {
    if (!readBounded(t["emgMin"], 20, 2000, c.emgMin, "emgMin", err)) return false;
    if (!readBounded(t["emgFactor"], 2, 20, c.emgFactor, "emgFactor", err)) return false;
    if (!readBounded(t["eogMin"], 20, 3000, c.eogMin, "eogMin", err)) return false;
    if (!readBounded(t["eogFactor"], 2, 20, c.eogFactor, "eogFactor", err)) return false;
  }

#if NV_FORCE_UNIVERSAL_HELP
  c.map[G01].enabled = true;
  strlcpy(c.map[G01].action, "REQUEST_HELP", sizeof(c.map[G01].action));
  strlcpy(c.map[G01].mode, "universal", sizeof(c.map[G01].mode));
#endif
  out = c;
  return true;
}

bool nvSaveConfigJson(const String &json) {
  if (json.length() > 3500) return false;
  nvLock();
  prefs.begin(NS, false);
  size_t n = prefs.putString("cfg", json);
  prefs.end();
  nvUnlock();
  return n == json.length();
}

void nvLoadStoredConfig(NvConfig &out) {
  nvLock();
  prefs.begin(NS, true);
  String json = prefs.getString("cfg", "");
  prefs.end();
  nvUnlock();
  String err;
  if (json.length() && nvParseConfig(json, out, err)) {
    NVLOG("[cfg] loaded stored config v%d\n", (int)out.version);
    return;
  }
  if (json.length()) NVLOG("[cfg] stored config rejected (%s), using default\n", err.c_str());
  nvDefaultConfig(out);
}
