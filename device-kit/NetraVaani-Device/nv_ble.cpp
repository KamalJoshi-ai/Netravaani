// Bluetooth LE: (1) NetraVaani commissioning service for the admin frontend,
// (2) Chords-compatible raw streaming for calibration screens / Chords Web.
// Runtime patient events do NOT use Bluetooth; they go over Wi-Fi.
//
// v1.1.0 fixes:
//  - Advertising no longer includes a 128-bit service UUID. In v1.0.0 that UUID
//    (18 bytes) was copied into the scan response together with the 18-character
//    name, exceeding the 31-byte BLE limit; the stack rejected the scan response
//    and the name "NPG-Lite-3CH:XX:XX" was never broadcast, so browsers filtering
//    on the "NPG" name prefix could not find the board. Advertising now matches
//    the official NPG Lite firmware: flags in the advertisement, name + TX power
//    in the scan response (23 bytes).
//  - Callbacks only copy data. JSON parsing and flash writes run in the events task.
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include "nv_config.h"
#include "nv_state.h"
#include "nv_ble.h"

static BLECharacteristic *sData = nullptr, *sControl = nullptr, *sBattery = nullptr;
static BLECharacteristic *sIdentity = nullptr, *sProvision = nullptr, *sStatus = nullptr;
static volatile bool sStreaming = false;
static volatile bool sConnected = false;
static String sIdentityCache = "{}";

static uint8_t sPkt[BLOCK_COUNT * (1 + 2 * NUM_BIO_CH)];
static uint8_t sPktIdx = 0, sCounter = 0;

bool nvBleConnected() { return sConnected; }

void nvBleSetIdentity(const String &json) {
  nvLock();
  sIdentityCache = json;
  nvUnlock();
}

class ServerCb : public BLEServerCallbacks {
  void onConnect(BLEServer *) override {
    sConnected = true;
    BLEDevice::stopAdvertising();  // same as the official firmware
  }
  void onDisconnect(BLEServer *) override {
    sConnected = false;
    sStreaming = false;
    BLEDevice::startAdvertising();
  }
};

// Chords control: START / STOP / WHORU / STATUS (same as official firmware)
class ControlCb : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) override {
    String cmd = c->getValue();
    cmd.trim();
    cmd.toUpperCase();
    if (cmd == "START") {
      sPktIdx = 0;
      sCounter = 0;
      sStreaming = true;
    } else if (cmd == "STOP") {
      sStreaming = false;
    } else if (cmd == "WHORU") {
      c->setValue("NPG-LITE");
      c->notify();
    } else if (cmd == "STATUS") {
      c->setValue(sStreaming ? "RUNNING" : "STOPPED");
      c->notify();
    }
  }
};

class IdentityCb : public BLECharacteristicCallbacks {
  void onRead(BLECharacteristic *c) override {
    nvLock();
    String copy = sIdentityCache;
    nvUnlock();
    c->setValue(copy.c_str());
  }
};

class ProvisionCb : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) override {
    String raw = c->getValue();
    nvPostProvisionCommand((const uint8_t *)raw.c_str(), raw.length());
  }
};

void nvBleReply(bool ok, const char *msg) {
  String s = String("{\"type\":\"reply\",\"ok\":") + (ok ? "true" : "false") + ",\"msg\":\"" + msg + "\"}";
  nvBleNotifyStatus(s);
}

bool nvBleBegin(const char *name) {
  BLEDevice::init(name);
  BLEDevice::setMTU(500);
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCb());

  // --- Chords-compatible service (UUIDs unchanged) ---
  BLEService *chords = server->createService(CHORDS_SERVICE_UUID);
  sData = chords->createCharacteristic(CHORDS_DATA_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  sData->addDescriptor(new BLE2902());
  sControl = chords->createCharacteristic(CHORDS_CONTROL_UUID, BLECharacteristic::PROPERTY_READ |
                                                                  BLECharacteristic::PROPERTY_WRITE |
                                                                  BLECharacteristic::PROPERTY_NOTIFY);
  sControl->addDescriptor(new BLE2902());
  sControl->setCallbacks(new ControlCb());
  sBattery = chords->createCharacteristic(CHORDS_BATTERY_UUID, BLECharacteristic::PROPERTY_READ |
                                                                  BLECharacteristic::PROPERTY_NOTIFY);
  sBattery->addDescriptor(new BLE2902());
  chords->start();

  // --- NetraVaani commissioning service (UUIDs unchanged) ---
  BLEService *nv = server->createService(NV_SERVICE_UUID);
  sIdentity = nv->createCharacteristic(NV_IDENTITY_UUID, BLECharacteristic::PROPERTY_READ);
  sIdentity->setCallbacks(new IdentityCb());
  sProvision = nv->createCharacteristic(NV_PROVISION_UUID, BLECharacteristic::PROPERTY_WRITE);
  sProvision->setCallbacks(new ProvisionCb());
  sStatus = nv->createCharacteristic(NV_STATUS_UUID, BLECharacteristic::PROPERTY_READ |
                                                        BLECharacteristic::PROPERTY_NOTIFY);
  sStatus->addDescriptor(new BLE2902());
  nv->start();

  // Default advertising, as in the official firmware: no service UUIDs, so the
  // name fits in the scan response.
  bool ok = BLEDevice::getAdvertising()->start();
  NVLOG("[ble] %s as \"%s\"\n", ok ? "advertising" : "ADVERTISING FAILED", name);
  return ok;
}

// Called from the ADC task for every sample. Builds 70-byte Chords packets:
// 10 x [counter, CH1 hi, CH1 lo, CH2 hi, CH2 lo, CH3 hi, CH3 lo]
void nvBleStreamPush(const uint16_t v[3]) {
  if (!sStreaming || !sConnected || !sData) return;
  uint8_t *p = &sPkt[sPktIdx * (1 + 2 * NUM_BIO_CH)];
  p[0] = sCounter++;
  for (int c = 0; c < NUM_BIO_CH; c++) {
    p[1 + 2 * c] = v[c] >> 8;
    p[2 + 2 * c] = v[c] & 0xFF;
  }
  if (++sPktIdx >= BLOCK_COUNT) {
    sPktIdx = 0;
    sData->setValue(sPkt, sizeof(sPkt));
    sData->notify();
  }
}

void nvBleNotifyBattery(uint8_t pct) {
  if (!sBattery) return;
  sBattery->setValue(&pct, 1);
  if (sConnected) sBattery->notify();
}

void nvBleNotifyStatus(const String &json) {
  if (!sStatus) return;
  sStatus->setValue(json.c_str());
  if (sConnected) sStatus->notify();
}
