// On-device gesture detection. Simple, deterministic rules on filtered signals:
//   CH3 (EMG, jaw):  clench = envelope above threshold for 80 ms .. 1 s
//       2 clenches  -> G02 DOUBLE_CLENCH
//       3+ clenches -> G01 TRIPLE_CLENCH (universal help)
//       one 1.5-4 s hold -> G04 LONG_CLENCH
//   CH2 (EOG-V, eye): blink = short spike 40-400 ms; two within 650 ms -> G03 DOUBLE_BLINK
// Thresholds adapt to each patient's resting noise and can be tuned remotely
// through the configuration ("tuning" block). A channel with bad signal
// quality (lead off / saturated / flat) never produces gestures.
#include <math.h>
#include "nv_config.h"
#include "nv_state.h"
#include "nv_detect.h"

static uint32_t sTms = 0;  // time in ms derived from the sample count (2 ms per sample)
static uint32_t sSampleN = 0;
static uint32_t sLastEmit = 0;
static NvConfig sCfg;
static uint32_t sCfgRefreshAt = 0;

// ---------------- signal quality ----------------
struct Quality {
  uint16_t rails = 0, n = 0, mn = 4095, mx = 0;
  uint8_t badStreak = 0, goodStreak = 0;
};
static Quality sQ[3];

static void qualityUpdate(int ch, uint16_t v) {
  Quality &q = sQ[ch];
  if (v < 40 || v > 4055) q.rails++;
  if (v < q.mn) q.mn = v;
  if (v > q.mx) q.mx = v;
  if (++q.n < SAMPLE_RATE_HZ) return;  // evaluate once per second
  bool bad = (q.rails > SAMPLE_RATE_HZ / 4) || (q.mx - q.mn < 2);
  q.rails = q.n = 0;
  q.mn = 4095;
  q.mx = 0;
  if (bad) { q.goodStreak = 0; if (q.badStreak < 255) q.badStreak++; }
  else { q.badStreak = 0; if (q.goodStreak < 255) q.goodStreak++; }
  bool ok = gChannelOk[ch];
  if (ok && q.badStreak >= 2) { gChannelOk[ch] = false; nvOnSignalQualityChanged(); }
  if (!ok && q.goodStreak >= 2) { gChannelOk[ch] = true; nvOnSignalQualityChanged(); }
}

// ---------------- emit with refractory period ----------------
static void emit(NvGesture g) {
  if (sLastEmit != 0 && sTms - sLastEmit < GESTURE_REFRACTORY_MS) return;
  sLastEmit = sTms;
  nvOnGesture(g);
}

// ---------------- EMG: jaw clench patterns on CH3 ----------------
struct Emg {
  float base = 2048, env = 0, noise = 15;
  bool in = false, tooLong = false;
  uint32_t start = 0, end = 0, groupStart = 0;
  uint8_t count = 0;
};
static Emg sE;

static void emgReset() { sE.in = false; sE.tooLong = false; sE.count = 0; }

static void emgProcess(uint16_t raw) {
  float x = raw;
  sE.base += 0.005f * (x - sE.base);              // remove slow drift (~0.4 s)
  sE.env += 0.04f * (fabsf(x - sE.base) - sE.env);  // rectified envelope (~50 ms)
  if (!sE.in) sE.noise += 0.0005f * (sE.env - sE.noise);
  float on = fmaxf(sE.noise * sCfg.emgFactor, sCfg.emgMin);
  float off = on * 0.6f;

#if NV_DEBUG_SIGNAL
  if (sSampleN % 25 == 0) Serial.printf("emg_env:%.1f emg_thr:%.1f ", sE.env, on);
#endif

  if (!sE.in) {
    if (sE.env > on && sTms - sE.end > 120) {
      sE.in = true;
      sE.tooLong = false;
      sE.start = sTms;
    } else if (sE.count > 0 && sTms - sE.end > 700) {
      // quiet for 700 ms: the clench group is finished, classify it
      if (sE.count >= 3) emit(G01);
      else if (sE.count == 2) emit(G02);
      sE.count = 0;  // a single short clench is ignored (chewing, swallowing)
    }
    return;
  }
  uint32_t dur = sTms - sE.start;
  if (dur > 4000) sE.tooLong = true;  // sustained tension, not a deliberate gesture
  if (sE.env >= off) return;

  sE.in = false;
  sE.end = sTms;
  if (sE.tooLong) { sE.count = 0; return; }
  if (dur >= 80 && dur <= 1000) {
    if (sE.count == 0 || sE.start - sE.groupStart > 3000) { sE.count = 0; sE.groupStart = sE.start; }
    sE.count++;
  } else if (dur >= 1500 && dur <= 4000) {
    if (sE.count == 0) emit(G04);
    sE.count = 0;
  } else {
    sE.count = 0;  // ambiguous length
  }
}

// ---------------- EOG: double blink on CH2 ----------------
struct Eog {
  float base = 2048, dev = 0, noise = 20;
  bool in = false;
  uint32_t start = 0, lastBlink = 0;
};
static Eog sB;

static void eogReset() { sB.in = false; sB.lastBlink = 0; }

static void eogProcess(uint16_t raw) {
  float x = raw;
  sB.base += 0.005f * (x - sB.base);
  sB.dev += 0.2f * (fabsf(x - sB.base) - sB.dev);  // light smoothing, either polarity
  if (!sB.in) sB.noise += 0.001f * (sB.dev - sB.noise);
  float on = fmaxf(sB.noise * sCfg.eogFactor, sCfg.eogMin);

#if NV_DEBUG_SIGNAL
  if (sSampleN % 25 == 0) Serial.printf("eog_dev:%.1f eog_thr:%.1f\n", sB.dev, on);
#endif

  if (!sB.in) {
    if (sB.dev > on) { sB.in = true; sB.start = sTms; }
    return;
  }
  if (sB.dev >= on * 0.5f) return;
  sB.in = false;
  uint32_t dur = sTms - sB.start;
  if (dur < 40 || dur > 400) return;  // too short = noise, too long = looking up/down
  if (sB.lastBlink && sTms - sB.lastBlink >= 120 && sTms - sB.lastBlink <= 650) {
    sB.lastBlink = 0;
    emit(G03);
  } else {
    sB.lastBlink = sTms;
  }
}

void nvDetectProcess(const uint16_t v[3]) {
  sSampleN++;
  sTms = sSampleN * (1000 / SAMPLE_RATE_HZ);
  if (sTms >= sCfgRefreshAt) {  // refresh tuning once per second (avoids locking every sample)
    sCfg = nvGetConfig();
    sCfgRefreshAt = sTms + 1000;
  }
  for (int c = 0; c < 3; c++) qualityUpdate(c, v[c]);

  if (gChannelOk[CH_EMG]) emgProcess(v[CH_EMG]);
  else emgReset();
  if (gChannelOk[CH_EOG_V]) eogProcess(v[CH_EOG_V]);
  else eogReset();
}
