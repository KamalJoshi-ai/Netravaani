#pragma once
#include <Arduino.h>
#include "nv_types.h"

// Called 500 times per second with raw 12-bit values of CH1..CH3
void nvDetectProcess(const uint16_t v[3]);

// Implemented in NetraVaani-Device.ino
void nvOnGesture(NvGesture g);
void nvOnSignalQualityChanged();
