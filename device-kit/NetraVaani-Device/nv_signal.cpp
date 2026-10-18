// 500 Hz x 3 channel acquisition using the ESP32-C6 ADC in continuous (DMA) mode.
// The ADC setup follows Upside Down Labs' official NPG Lite firmware
// (channels A0, A1, A2 = BioAmp CH1..CH3, A6 = battery divider).
#include <math.h>
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "esp_adc/adc_continuous.h"
#include "esp_adc/adc_cali.h"
#include "esp_adc/adc_cali_scheme.h"
#include "hal/adc_types.h"
#include "hal/efuse_hal.h"
#include "soc/soc_caps.h"
#include "nv_config.h"
#include "nv_state.h"
#include "nv_signal.h"
#include "nv_detect.h"
#include "nv_ble.h"

#define NUM_ADC_CH 4  // 3 BioAmp + battery
static const uint8_t HW_CH[NUM_ADC_CH] = { 0, 1, 2, 6 };
static int8_t hw2idx[10];

static adc_continuous_handle_t sAdc = nullptr;
static adc_cali_handle_t sBattCali = nullptr;
static bool sBattCaliOk = false;
static SemaphoreHandle_t sAdcSem = nullptr;
static uint32_t sChipRev = 0;

static uint16_t sLast[NUM_ADC_CH];
static uint32_t sHaveMask = 0;

// battery averaging
static uint32_t sBattSum = 0, sBattCount = 0, sBattWinStart = 0, sSampleCount = 0;

static const float VOLT_LUT[] = { 3.27, 3.61, 3.69, 3.71, 3.73, 3.75, 3.77, 3.79, 3.80, 3.82,
                                  3.84, 3.85, 3.87, 3.91, 3.95, 3.98, 4.02, 4.08, 4.11, 4.15, 4.20 };
static const int PCT_LUT[] = { 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100 };

static float batteryPercent(float v) {
  const int n = sizeof(VOLT_LUT) / sizeof(VOLT_LUT[0]);
  if (v <= VOLT_LUT[0]) return 0;
  if (v >= VOLT_LUT[n - 1]) return 100;
  int i = 0;
  while (i < n - 1 && v > VOLT_LUT[i + 1]) i++;
  return PCT_LUT[i] + (v - VOLT_LUT[i]) * (PCT_LUT[i + 1] - PCT_LUT[i]) / (VOLT_LUT[i + 1] - VOLT_LUT[i]);
}

static inline uint16_t fixRaw(uint16_t raw) {
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  if (sChipRev == 1) {  // same correction as the official firmware for C6 rev 1
    uint32_t v = (uint32_t)raw * 4095u / 3249u;
    return (uint16_t)(v > 4095u ? 4095u : v);
  }
#endif
  return raw;
}

static bool IRAM_ATTR onConvDone(adc_continuous_handle_t, const adc_continuous_evt_data_t *, void *) {
  BaseType_t woken = pdFALSE;
  xSemaphoreGiveFromISR(sAdcSem, &woken);
  return woken == pdTRUE;
}

static void adcInit() {
  static adc_digi_pattern_config_t pattern[NUM_ADC_CH];
  for (int i = 0; i < NUM_ADC_CH; i++) {
    pattern[i].atten = ADC_ATTEN_DB_12;
    pattern[i].channel = HW_CH[i];
    pattern[i].unit = ADC_UNIT_1;
    pattern[i].bit_width = ADC_BITWIDTH_12;
  }
  for (int i = 0; i < (int)sizeof(hw2idx); i++) hw2idx[i] = -1;
  for (int i = 0; i < NUM_ADC_CH; i++) hw2idx[HW_CH[i]] = i;

  adc_continuous_handle_cfg_t hcfg = {};
  hcfg.max_store_buf_size = NUM_ADC_CH * SOC_ADC_DIGI_RESULT_BYTES * BLOCK_COUNT * 8;
  hcfg.conv_frame_size = NUM_ADC_CH * SOC_ADC_DIGI_RESULT_BYTES * BLOCK_COUNT;
  ESP_ERROR_CHECK(adc_continuous_new_handle(&hcfg, &sAdc));

  adc_continuous_evt_cbs_t cbs = {};
  cbs.on_conv_done = onConvDone;
  ESP_ERROR_CHECK(adc_continuous_register_event_callbacks(sAdc, &cbs, nullptr));

  adc_continuous_config_t dcfg = {};
  dcfg.pattern_num = NUM_ADC_CH;
  dcfg.adc_pattern = pattern;
  dcfg.sample_freq_hz = SAMPLE_RATE_HZ * NUM_ADC_CH;
  dcfg.conv_mode = ADC_CONV_SINGLE_UNIT_1;
  dcfg.format = ADC_DIGI_OUTPUT_FORMAT_TYPE2;
  ESP_ERROR_CHECK(adc_continuous_config(sAdc, &dcfg));
  ESP_ERROR_CHECK(adc_continuous_start(sAdc));
  NVLOG("[adc] running: %d Hz x 3 channels + battery\n", SAMPLE_RATE_HZ);
}

static void onFullSample() {
  uint16_t bio[NUM_BIO_CH];
  for (int c = 0; c < NUM_BIO_CH; c++) bio[c] = fixRaw(sLast[c]);

  nvDetectProcess(bio);      // gestures + signal quality
  nvBleStreamPush(bio);      // raw stream for calibration (only if a client asked)

  // battery: average one reading every 50 samples, update every 10 s
  if (++sSampleCount % 50 == 0) {
    int mv = sLast[3];
    if (sBattCaliOk) adc_cali_raw_to_voltage(sBattCali, sLast[3], &mv);
    sBattSum += mv;
    sBattCount++;
  }
  uint32_t now = millis();
  if (now - sBattWinStart >= 10000 && sBattCount > 0) {
    float avg = (float)sBattSum / sBattCount;
    float volts = (avg / 1000.0f) * 2.0f + (sBattCaliOk ? 0.05f : -0.02f);
    gBatteryPct = (uint8_t)ceilf(batteryPercent(volts));
    nvBleNotifyBattery(gBatteryPct);
    sBattSum = sBattCount = 0;
    sBattWinStart = now;
  }
}

static void adcTask(void *) {
  adcInit();
  uint8_t buf[NUM_ADC_CH * SOC_ADC_DIGI_RESULT_BYTES * BLOCK_COUNT];
  const uint32_t FULL = (1u << NUM_ADC_CH) - 1;
  for (;;) {
    if (xSemaphoreTake(sAdcSem, pdMS_TO_TICKS(200)) != pdTRUE) continue;
    for (;;) {
      uint32_t len = 0;
      if (adc_continuous_read(sAdc, buf, sizeof(buf), &len, 0) != ESP_OK || len == 0) break;
      for (uint32_t i = 0; i + SOC_ADC_DIGI_RESULT_BYTES <= len; i += SOC_ADC_DIGI_RESULT_BYTES) {
        auto *p = (const adc_digi_output_data_t *)&buf[i];
        uint8_t ch = p->type2.channel;
        int8_t idx = ch < sizeof(hw2idx) ? hw2idx[ch] : -1;
        if (idx < 0) continue;
        sLast[idx] = p->type2.data;
        sHaveMask |= (1u << idx);
        if (sHaveMask == FULL) {
          sHaveMask = 0;
          onFullSample();
        }
      }
    }
  }
}

void nvSignalBegin() {
  sChipRev = efuse_hal_chip_revision();
  adc_cali_curve_fitting_config_t cc = {};
  cc.unit_id = ADC_UNIT_1;
  cc.chan = ADC_CHANNEL_6;
  cc.atten = ADC_ATTEN_DB_12;
  cc.bitwidth = ADC_BITWIDTH_12;
  sBattCaliOk = adc_cali_create_scheme_curve_fitting(&cc, &sBattCali) == ESP_OK;
  sAdcSem = xSemaphoreCreateBinary();
  sBattWinStart = millis();
  xTaskCreatePinnedToCore(adcTask, "nv_adc", STACK_ADC, nullptr, 5, &gTaskAdc, 0);
}
