#include "nv_state.h"

NvSettings gSettings;
volatile bool gSettingsChanged = false;
volatile bool gProvisioned = false;
volatile uint32_t gProvisionUntil = 0;
uint32_t gBootId = 0;
char gHardwareId[24] = { 0 };

volatile bool gWifiUp = false;
volatile bool gBackendOk = false;
volatile bool gBackendAuthError = false;
volatile int32_t gDesiredConfigVersion = -1;
volatile uint8_t gBatteryPct = 255;
volatile bool gChannelOk[3] = { true, true, true };

bool gSafeMode = false;
char gLastReset[20] = "UNKNOWN";
uint32_t gCrashCount = 0;

TaskHandle_t gTaskAdc = nullptr, gTaskEvt = nullptr, gTaskNet = nullptr, gTaskUi = nullptr, gTaskDiag = nullptr;

static SemaphoreHandle_t sMutex = nullptr;
static NvConfig sConfig;

void nvStateBegin() {
  sMutex = xSemaphoreCreateRecursiveMutex();
}
void nvLock() {
  xSemaphoreTakeRecursive(sMutex, portMAX_DELAY);
}
void nvUnlock() {
  xSemaphoreGiveRecursive(sMutex);
}
NvConfig nvGetConfig() {
  nvLock();
  NvConfig c = sConfig;
  nvUnlock();
  return c;
}
void nvSetConfig(const NvConfig &c) {
  nvLock();
  sConfig = c;
  nvUnlock();
}
NvSettings nvGetSettings() {
  nvLock();
  NvSettings s = gSettings;
  nvUnlock();
  return s;
}
bool nvProvisionOpen() {
  if (!gProvisioned) return true;  // not set up yet: always accept setup
  return gProvisionUntil != 0 && (int32_t)(gProvisionUntil - millis()) > 0;
}
