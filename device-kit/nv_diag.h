#pragma once
#include <Arduino.h>

// Call first thing in setup(): reads the reset reason, prints the previous
// crash (from the flash core dump) and decides whether to enter safe mode.
void nvDiagBoot();
// Starts the periodic heap/stack report and the stable-uptime timer.
void nvDiagBegin();
