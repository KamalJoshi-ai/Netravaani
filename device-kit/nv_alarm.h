#pragma once
#include <Arduino.h>

// Software-only local alarm in this version: no buzzer, no external LEDs.
// The alarm state is logged on serial, notified over BLE, reported in every
// heartbeat, and (if NV_ONBOARD_PIXELS) shown on the on-board RGB LEDs.
void nvAlarmBegin();
void nvAlarmStart();
void nvAlarmStop();
bool nvAlarmActive();
void nvAlarmTest();  // 1 s visual test on the on-board LEDs

// Implemented in nv_events.cpp
void nvOnLocalSilence();
void nvOnAlarmChanged(bool active);
