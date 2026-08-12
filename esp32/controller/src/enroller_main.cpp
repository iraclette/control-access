#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <WiFiClientSecure.h>
#include "certs.h"
#include "secrets.h"

// ================= CONFIG =================
// RDM6300 is UART-only (9600 8N1), TX-only -- only its TX needs to reach an ESP32
// RX-capable pin. RDM_TX_PIN is unused (nothing wired to it) but HardwareSerial
// still wants a pin number, so it's set to an otherwise-unused GPIO.
#define RDM_RX_PIN 16
#define RDM_TX_PIN 17
#define LED 2

const char* WIFI_SSID     = SECRET_WIFI_SSID;
const char* WIFI_PASSWORD = SECRET_WIFI_PASSWORD;

const char* BASE_URL      = "https://control-access.onrender.com";

const char* DEVICE_SECRET = SECRET_DEVICE_SECRET;
const char* TAG_SALT      = SECRET_TAG_SALT;

#include "common.h"

// No relay, no PIN buffer, no OTA -- this device only ever reads a tag, hashes
// it, and reports it. It can't unlock anything, so a stray tap here can't
// affect real access, unlike tapping an unrecognized card on a live door unit.

HardwareSerial rdmSerial(2);
String deviceId;

// ---------- RDM6300 ----------
// Frame: 0x02 (STX) + 10 ASCII hex chars (5-byte tag ID) + 2 ASCII hex chars
// (checksum: XOR of the 5 ID bytes) + 0x03 (ETX). 14 bytes total, 9600 8N1.
//
// The raw 5-byte ID is NOT what a Wiegand door/elevator reader computes for the
// same physical tag -- confirmed empirically (tapped the same tag on both,
// compared logged codes). What matched was the last 3 bytes (bytes 2-4) read as
// a big-endian 24-bit integer, which lines up with why: standard 26-bit Wiegand
// (H10301) is 1 parity + 8-bit facility code + 16-bit card number + 1 parity =
// exactly 24 real data bits = 3 bytes, and that's what the reader chip extracts
// from the tag, discarding the first 2 bytes entirely. So we derive and hash
// that same 3-byte value here instead of the raw 10-char ID, to actually match
// what door/elevator units will compute when the tag is tapped there.
bool readRdmTag(String &outCode) {
  static uint8_t buf[14];
  static uint8_t idx = 0;

  while (rdmSerial.available()) {
    uint8_t b = rdmSerial.read();

    // Raw byte trace -- shows up regardless of whether it ever forms a valid
    // frame, so "nothing prints on a tap" and "garbled data" look different.
    if (b < 0x10) Serial.print("0");
    Serial.print(b, HEX);
    Serial.print(" ");

    if (b == 0x02) { // STX -- start of a new frame, always resync here
      idx = 0;
      buf[idx++] = b;
      continue;
    }

    if (idx == 0) continue; // haven't seen STX yet, ignore stray bytes
    if (idx < sizeof(buf)) buf[idx++] = b;

    if (b == 0x03 && idx == 14) { // ETX at the expected position -- complete frame
      idx = 0;

      char hexId[11];
      memcpy(hexId, buf + 1, 10);
      hexId[10] = 0;

      char hexChecksum[3];
      memcpy(hexChecksum, buf + 11, 2);
      hexChecksum[2] = 0;

      uint8_t computed = 0;
      for (int i = 0; i < 10; i += 2) {
        char pair[3] = { hexId[i], hexId[i + 1], 0 };
        computed ^= (uint8_t)strtoul(pair, nullptr, 16);
      }
      uint8_t received = (uint8_t)strtoul(hexChecksum, nullptr, 16);
      if (computed != received) {
        Serial.println("RDM6300: checksum mismatch, ignoring read");
        return false;
      }

      Serial.print("RDM6300 raw ID=");
      Serial.println(hexId);

      // Wiegand-equivalent: last 3 bytes (last 6 hex chars) as a 24-bit big-endian
      // integer -- see the comment above this function for why.
      unsigned long wiegandEquivalent = strtoul(hexId + 4, nullptr, 16);
      outCode = String(wiegandEquivalent);
      return true;
    }

    if (idx >= sizeof(buf)) idx = 0; // malformed/overlong frame, resync on next STX
  }

  return false;
}

// ---------- Report a scan ----------
void reportScan(const String &hash) {
  Serial.print("Reporting scan hash=");
  Serial.println(hash);
  setLedMode(LED_OTA_DOWNLOADING); // reused here as a "busy" blink

  WiFiClientSecure client;
  client.setCACert(ROOT_CA);

  HTTPClient http;
  String url = String(BASE_URL) + "/device/" + deviceId + "/scan";
  if (!http.begin(client, url)) {
    Serial.println("scan http.begin failed");
    setLedMode(LED_OTA_FAIL);
    return;
  }
  http.addHeader("X-Device-Secret", DEVICE_SECRET);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<128> doc;
  doc["hash"] = hash;
  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  http.end();

  if (code == 200) {
    Serial.println("scan reported OK");
    setLedMode(LED_OTA_SUCCESS);
  } else {
    Serial.print("scan report failed, HTTP ");
    Serial.println(code);
    setLedMode(LED_OTA_FAIL);
  }
}

// ---------- Setup ----------
void setup() {
  Serial.begin(115200);
  delay(200);

  deviceId = getDeviceId();
  Serial.print("DEVICE_ID=");
  Serial.println(deviceId);
  Serial.println("Enroller ready -- tap a tag to report its hash.");

  pinMode(LED, OUTPUT);
  setLedMode(LED_WIFI_CONNECTING);

  rdmSerial.begin(9600, SERIAL_8N1, RDM_RX_PIN, RDM_TX_PIN);

  // We always pass credentials explicitly from secrets.h -- ESP32's own NVS
  // credential caching buys us nothing and is one more thing that can get
  // corrupted by a power loss mid-write, so skip it entirely.
  WiFi.persistent(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi");
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi connected, IP=");
    Serial.println(WiFi.localIP());
    syncTime();
    setLedMode(LED_SYNC_OK);
  } else {
    Serial.println("WiFi not connected -- cannot report scans until reset");
    setLedMode(LED_OTA_FAIL);
  }
}

// ---------- Loop ----------
void loop() {
  ledTask();

  String tagCode;
  if (readRdmTag(tagCode)) {
    Serial.print("Wiegand-equivalent code=");
    Serial.println(tagCode);

    if (WiFi.status() == WL_CONNECTED) {
      String hash = sha256Hex(String(TAG_SALT) + tagCode);
      reportScan(hash);
    } else {
      Serial.println("No WiFi, cannot report scan");
      setLedMode(LED_OTA_FAIL);
    }
  }
}
