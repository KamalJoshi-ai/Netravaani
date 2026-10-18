// setup() and loop() live in a .cpp file on purpose: the Arduino builder then
// has no functions in the .ino to auto-generate prototypes for. In v1.0.0 a
// mis-generated prototype placed a call to setup() inside setup() itself
// (infinite recursion, stack overflow, reboot loop on every boot).
#include <Arduino.h>
#include "esp_mac.h"
#include "nv_config.h"
#include "nv_types.h"
#include "nv_state.h"
#include "nv_storage.h"
#include "nv_diag.h"
#include "nv_alarm.h"
#include "nv_ble.h"
#include "nv_events.h"
#include "nv_signal.h"
#include "nv_net.h"

void setup() {
  Serial.begin(115200);
  Serial.setTxTimeoutMs(0);  // never block a task when no USB host is reading
  uint32_t t0 = millis();
  while (!Serial && millis() - t0 < 1500) delay(10);  // give the Serial Monitor a moment to attach

  nvStateBegin();
  NVLOG("\n=== NetraVaani %s booting ===\n", NV_FW_VERSION);
  nvDiagBoot();  // reset reason, previous crash, safe-mode decision

  nvStorageBegin();
  gBootId = nvNextBootId();

  uint8_t mac[6];
  esp_read_mac(mac, ESP_MAC_EFUSE_FACTORY);
  snprintf(gHardwareId, sizeof(gHardwareId), "NPGLITE-%02X%02X%02X%02X%02X%02X",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

  gSettings = nvLoadSettings();
  NvConfig cfg;
  nvLoadStoredConfig(cfg);
  nvSetConfig(cfg);
  gProvisioned = gSettings.provisioned();
  gProvisionUntil = millis() + PROVISION_WINDOW_MS;  // setup is allowed for 5 min after every restart

  NVLOG("[boot] %s | boot %lu | device %s | config v%d | %s\n", gHardwareId, (unsigned long)gBootId,
        gSettings.deviceId.length() ? gSettings.deviceId.c_str() : "(not registered)", (int)cfg.version,
        gSettings.provisioned() ? "provisioned" : "NOT SET UP");
  if (gProvisioned)
    NVLOG("[boot] Wi-Fi \"%s\", backend %s | setup window open for %d s\n", gSettings.ssid.c_str(),
          gSettings.apiBase.c_str(), PROVISION_WINDOW_MS / 1000);
  else
    NVLOG("[boot] setup window OPEN until the board is set up (use the setup page)\n");

  nvAlarmBegin();   // BOOT button + on-board LEDs (no buzzer)
  nvEventsBegin();  // events task must exist before anything can post to it

#if NV_ENABLE_BLE
  char bleName[32];
  snprintf(bleName, sizeof(bleName), "NPG-Lite-3CH:%02X:%02X", mac[4], mac[5]);
  nvBleBegin(bleName);
#else
  NVLOG("[boot] BLE disabled in this build\n");
#endif

#if NV_ENABLE_ADC
  if (!gSafeMode) nvSignalBegin();
#else
  NVLOG("[boot] ADC disabled in this build\n");
#endif

#if NV_ENABLE_WIFI
  if (!gSafeMode) nvNetBegin();
#else
  NVLOG("[boot] Wi-Fi disabled in this build\n");
#endif

  nvDiagBegin();
  NVLOG("[boot] setup complete, free heap %lu\n", (unsigned long)ESP.getFreeHeap());
}

void loop() {
  vTaskDelay(pdMS_TO_TICKS(1000));  // everything runs in FreeRTOS tasks
}
