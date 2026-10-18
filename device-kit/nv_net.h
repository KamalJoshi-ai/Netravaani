#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

void nvNetBegin();
// Queue an event for delivery. `fields` are merged into the event body.
// Returns false if the device is not provisioned yet.
bool nvQueueEvent(const char *eventType, JsonDocument &fields);
int nvQueuedCount();
