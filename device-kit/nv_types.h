#pragma once
#include <Arduino.h>

// Gestures the firmware can detect. The backend maps them to actions.
enum NvGesture : uint8_t {
  G_NONE = 0,
  G01 = 1,  // TRIPLE_CLENCH  (jaw, CH3)  -> universal help + local alarm
  G02 = 2,  // DOUBLE_CLENCH  (jaw, CH3)
  G03 = 3,  // DOUBLE_BLINK   (eye, CH2)
  G04 = 4,  // LONG_CLENCH    (jaw held 1.5-4 s, CH3)
  G_MAX = 5
};

static const char *const NV_GESTURE_CODES[G_MAX] = { "", "G01", "G02", "G03", "G04" };
static const char *const NV_GESTURE_NAMES[G_MAX] = { "", "TRIPLE_CLENCH", "DOUBLE_CLENCH",
                                                     "DOUBLE_BLINK", "LONG_CLENCH" };

struct NvSettings {
  String ssid, pass, apiBase, deviceId, token;
  bool provisioned() const {
    return ssid.length() && apiBase.length() && deviceId.length() && token.length();
  }
};

struct NvGestureMap {
  bool enabled;
  char action[33];
  char mode[16];
};

struct NvConfig {
  int32_t version;              // 0 = factory default, never applied from backend
  NvGestureMap map[G_MAX];
  float emgMin, emgFactor;      // jaw clench detector tuning
  float eogMin, eogFactor;      // blink detector tuning
};

struct NvEvent {
  char eventId[64];
  char body[480];
  uint32_t createdMs;
};
