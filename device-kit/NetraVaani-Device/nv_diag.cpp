// Boot and runtime diagnostics. Nothing here suppresses errors: crashes still
// print their full panic report on USB serial and reboot as usual. This module
// additionally prints WHY the previous boot ended, using the core dump that
// Arduino-ESP32 3.2.0 saves to the "coredump" flash partition.
#include "esp_system.h"
#include "esp_core_dump.h"
#include "esp_attr.h"
#include "nv_config.h"
#include "nv_state.h"
#include "nv_diag.h"
#include "nv_alarm.h"

#define NV_RTC_MAGIC 0x4E56A11Cu
RTC_NOINIT_ATTR static uint32_t rtcMagic;
RTC_NOINIT_ATTR static uint32_t rtcCrashCount;

static const char *resetName(esp_reset_reason_t r) {
  switch (r) {
    case ESP_RST_POWERON: return "POWERON";
    case ESP_RST_EXT: return "EXTERNAL";
    case ESP_RST_SW: return "SOFTWARE";
    case ESP_RST_PANIC: return "PANIC";
    case ESP_RST_INT_WDT: return "INT_WATCHDOG";
    case ESP_RST_TASK_WDT: return "TASK_WATCHDOG";
    case ESP_RST_WDT: return "OTHER_WATCHDOG";
    case ESP_RST_DEEPSLEEP: return "DEEPSLEEP";
    case ESP_RST_BROWNOUT: return "BROWNOUT";
    case ESP_RST_SDIO: return "SDIO";
    case ESP_RST_USB: return "USB";
    case ESP_RST_JTAG: return "JTAG";
    default: return "UNKNOWN";
  }
}

static bool isAbnormal(esp_reset_reason_t r) {
  return r == ESP_RST_PANIC || r == ESP_RST_INT_WDT || r == ESP_RST_TASK_WDT ||
         r == ESP_RST_WDT || r == ESP_RST_BROWNOUT;
}

static void printPreviousCrash() {
  if (esp_core_dump_image_check() != ESP_OK) {
    NVLOG("[diag] no stored crash report\n");
    return;
  }
  esp_core_dump_summary_t *sum = (esp_core_dump_summary_t *)malloc(sizeof(esp_core_dump_summary_t));
  if (sum && esp_core_dump_get_summary(sum) == ESP_OK) {
    NVLOG("[diag] PREVIOUS CRASH: task '%s'  PC=0x%08lx  RA=0x%08lx  MCAUSE=0x%08lx  MTVAL=0x%08lx\n",
          sum->exc_task, (unsigned long)sum->exc_pc, (unsigned long)sum->ex_info.ra,
          (unsigned long)sum->ex_info.mcause, (unsigned long)sum->ex_info.mtval);
    NVLOG("[diag] decode with: riscv32-esp-elf-addr2line -pfiaC -e NetraVaani-Device.ino.elf 0x%08lx 0x%08lx\n",
          (unsigned long)sum->exc_pc, (unsigned long)sum->ex_info.ra);
  } else {
    NVLOG("[diag] crash report present but unreadable\n");
  }
  free(sum);
  esp_core_dump_image_erase();  // so the next report is about the next crash
}

void nvDiagBoot() {
  esp_reset_reason_t r = esp_reset_reason();
  strlcpy(gLastReset, resetName(r), sizeof(gLastReset));

  if (rtcMagic != NV_RTC_MAGIC || r == ESP_RST_POWERON) {
    rtcMagic = NV_RTC_MAGIC;
    rtcCrashCount = 0;
  }
  rtcCrashCount = isAbnormal(r) ? rtcCrashCount + 1 : 0;
  gCrashCount = rtcCrashCount;

  NVLOG("[diag] reset reason: %s | consecutive abnormal resets: %lu | free heap: %lu\n",
        gLastReset, (unsigned long)gCrashCount, (unsigned long)ESP.getFreeHeap());
  if (r == ESP_RST_BROWNOUT)
    NVLOG("[diag] BROWNOUT: supply voltage dropped. Check LiPo charge/polarity and the USB cable.\n");
  printPreviousCrash();

#if NV_SAFE_MODE_AFTER_CRASHES > 0
  if (gCrashCount >= NV_SAFE_MODE_AFTER_CRASHES) {
    gSafeMode = true;
    NVLOG("[diag] !!! SAFE MODE: %lu consecutive crashes. Bluetooth only; ADC and Wi-Fi are OFF.\n",
          (unsigned long)gCrashCount);
    NVLOG("[diag] !!! This is a failure state. Fix the crash above, then power-cycle the board.\n");
  }
#endif
}

static void stackLine(const char *name, TaskHandle_t t) {
  if (t) NVLOG(" %s=%u", name, (unsigned)uxTaskGetStackHighWaterMark(t));
}

static void diagTask(void *) {
  bool stableReported = false;
  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(NV_DIAG_EVERY_MS));
    uint32_t up = millis();
    if (!stableReported && up >= NV_STABLE_UPTIME_MS) {
      stableReported = true;
      rtcCrashCount = 0;  // counts as a good boot from now on
      NVLOG("[diag] stable for %lu s, crash counter cleared\n", (unsigned long)(up / 1000));
    }
    NVLOG("[diag] up=%lus heap=%lu minHeap=%lu stackFree(bytes):", (unsigned long)(up / 1000),
          (unsigned long)ESP.getFreeHeap(), (unsigned long)ESP.getMinFreeHeap());
    stackLine("adc", gTaskAdc);
    stackLine("evt", gTaskEvt);
    stackLine("net", gTaskNet);
    stackLine("ui", gTaskUi);
    stackLine("diag", gTaskDiag);
    NVLOG(" | wifi=%s backend=%s alarm=%s safe=%d\n", gWifiUp ? "up" : "down",
          gBackendOk ? "ok" : "no", nvAlarmActive() ? "ON" : "off", gSafeMode);
  }
}

void nvDiagBegin() {
  xTaskCreatePinnedToCore(diagTask, "nv_diag", STACK_DIAG, nullptr, 1, &gTaskDiag, 0);
}
