// Local alarm state, BOOT button and status indication.
// This path never depends on Wi-Fi, the backend or Bluetooth.
//
// Only on-board hardware is touched:
//   GPIO 9  BOOT/USER button (input):  short press = silence alarm,
//                                      hold 3 s   = open setup window
//   GPIO 15 on-board RGB LEDs (if NV_ONBOARD_PIXELS):
//     pixel 0   network: red = not set up / no Wi-Fi, amber = backend unreachable,
//               purple = token rejected, green = connected,
//               blinking blue = setup window open, blinking magenta = SAFE MODE
//     pixels 1-4  flash red while the alarm is active
//     pixel 5   battery: green > 70 %, amber 20-70 %, red < 20 %
// No buzzer output in this version. GPIO 7 and GPIO 8 are never touched.
#include "nv_config.h"
#include "nv_state.h"
#include "nv_alarm.h"
#if NV_ONBOARD_PIXELS
#include <Adafruit_NeoPixel.h>
static Adafruit_NeoPixel sPix(PIXEL_COUNT, PIN_PIXELS, NEO_GRB + NEO_KHZ800);
#endif

static volatile bool sAlarm = false;
static volatile bool sAlarmChanged = false;
static volatile uint32_t sTestUntil = 0;

void nvAlarmStart() {
  if (!sAlarm) { sAlarm = true; sAlarmChanged = true; }
}
void nvAlarmStop() {
  if (sAlarm) { sAlarm = false; sAlarmChanged = true; }
}
bool nvAlarmActive() { return sAlarm; }
void nvAlarmTest() { sTestUntil = millis() + 1000; }

#if NV_ONBOARD_PIXELS
static uint32_t rgb(uint8_t r, uint8_t g, uint8_t b) { return sPix.Color(r, g, b); }

static void updatePixels(uint32_t now) {
  bool test = (int32_t)(sTestUntil - now) > 0;
  bool flash = test || (sAlarm && (now % 400) < 250);
  for (int i = 1; i <= 4; i++) sPix.setPixelColor(i, flash ? rgb(80, 0, 0) : 0);

  uint32_t net;
  bool blinkOn = (now % 1000) < 500;
  if (gSafeMode) net = blinkOn ? rgb(PIXEL_BRIGHT, 0, PIXEL_BRIGHT) : 0;
  else if (nvProvisionOpen() && blinkOn) net = rgb(0, 0, PIXEL_BRIGHT);
  else if (!gWifiUp) net = rgb(PIXEL_BRIGHT, 0, 0);
  else if (gBackendAuthError) net = rgb(PIXEL_BRIGHT / 2, 0, PIXEL_BRIGHT);
  else if (!gBackendOk) net = rgb(PIXEL_BRIGHT, PIXEL_BRIGHT / 2, 0);
  else net = rgb(0, PIXEL_BRIGHT, 0);
  sPix.setPixelColor(0, net);

  uint8_t b = gBatteryPct;
  uint32_t bat = 0;
  if (b <= 100) bat = b > 70 ? rgb(0, PIXEL_BRIGHT, 0) : (b > 20 ? rgb(PIXEL_BRIGHT, PIXEL_BRIGHT / 2, 0) : rgb(PIXEL_BRIGHT, 0, 0));
  sPix.setPixelColor(PIXEL_COUNT - 1, bat);
  sPix.show();
}
#endif

static void uiTask(void *) {
  bool btnDown = false, longFired = false;
  uint32_t btnSince = 0;
  for (;;) {
    uint32_t now = millis();

    // ---- BOOT button (read only) ----
    bool pressed = digitalRead(PIN_BOOT_BTN) == LOW;
    if (pressed && !btnDown) { btnDown = true; btnSince = now; longFired = false; NVLOG("[ui] BOOT pressed\n"); }
    if (pressed && btnDown && !longFired && now - btnSince >= 3000) {
      longFired = true;
      gProvisionUntil = now + PROVISION_WINDOW_MS;
      NVLOG("[ui] setup window opened for %d s\n", PROVISION_WINDOW_MS / 1000);
    }
    if (!pressed && btnDown) {
      btnDown = false;
      NVLOG("[ui] BOOT released after %lu ms\n", (unsigned long)(now - btnSince));
      if (!longFired && now - btnSince >= 30 && sAlarm) {
        nvAlarmStop();
        nvOnLocalSilence();
      }
    }

    // ---- report alarm state changes (serial + BLE + event) ----
    if (sAlarmChanged) {
      sAlarmChanged = false;
      nvOnAlarmChanged(sAlarm);
    }

#if NV_ONBOARD_PIXELS
    updatePixels(now);
#endif
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

void nvAlarmBegin() {
  pinMode(PIN_BOOT_BTN, INPUT_PULLUP);  // on-board button; board already pulls it up
#if NV_ONBOARD_PIXELS
  sPix.begin();
  sPix.clear();
  sPix.show();
#endif
  xTaskCreatePinnedToCore(uiTask, "nv_ui", STACK_UI, nullptr, 4, &gTaskUi, 0);
}
