#pragma once
#include "nv_types.h"

void nvStorageBegin();
NvSettings nvLoadSettings();
void nvSaveSettings(const NvSettings &s);
void nvFactoryReset();
uint32_t nvNextBootId();

void nvDefaultConfig(NvConfig &c);
bool nvParseConfig(const String &json, NvConfig &out, String &err);
bool nvSaveConfigJson(const String &json);
void nvLoadStoredConfig(NvConfig &out);  // last known-good, or factory default
