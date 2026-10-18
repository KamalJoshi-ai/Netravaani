#pragma once
#include <Arduino.h>

bool nvBleBegin(const char *deviceName);     // returns false if advertising failed
void nvBleStreamPush(const uint16_t v[3]);   // Chords-format raw packets (calibration)
void nvBleNotifyBattery(uint8_t pct);
void nvBleNotifyStatus(const String &json);  // replies, gesture/signal/alarm messages
void nvBleReply(bool ok, const char *msg);
void nvBleSetIdentity(const String &json);   // cached identity returned on read
bool nvBleConnected();

// Implemented in nv_events.cpp: provisioning commands are handled outside the
// Bluetooth stack's callback task.
void nvPostProvisionCommand(const uint8_t *data, size_t len);
