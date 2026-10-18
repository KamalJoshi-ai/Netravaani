#pragma once
#include <Arduino.h>
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "nv_types.h"

// Shared state between tasks (ADC/detection, network, BLE, alarm/UI)
extern NvSettings gSettings;            // guarded by nvLock()
extern volatile bool gSettingsChanged;  // BLE wrote new settings
extern volatile bool gProvisioned;      // settings complete (Wi-Fi + backend + device id + token)
extern volatile uint32_t gProvisionUntil;
extern uint32_t gBootId;
extern char gHardwareId[24];

extern volatile bool gWifiUp;
extern volatile bool gBackendOk;
extern volatile bool gBackendAuthError;
extern volatile int32_t gDesiredConfigVersion;
extern volatile uint8_t gBatteryPct;
extern volatile bool gChannelOk[3];

// Boot diagnostics
extern bool gSafeMode;              // booted in crash-loop safe mode
extern char gLastReset[20];         // reset reason of this boot, e.g. "POWERON", "PANIC"
extern uint32_t gCrashCount;        // consecutive abnormal resets

// Task handles (for stack high-water-mark reports)
extern TaskHandle_t gTaskAdc, gTaskEvt, gTaskNet, gTaskUi, gTaskDiag;

void nvStateBegin();
void nvLock();
void nvUnlock();
NvConfig nvGetConfig();
void nvSetConfig(const NvConfig &c);
NvSettings nvGetSettings();
bool nvProvisionOpen();
