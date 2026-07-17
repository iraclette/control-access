#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wiegand.h>
#include <WiFiClientSecure.h>
#include "certs.h"
#include "secrets.h"

// ================= CONFIG =================
#define D0_PIN 26
#define D1_PIN 27
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

WIEGAND wg;
String deviceId;

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

  wg.begin(D0_PIN, D1_PIN);

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

  if (wg.available()) {
    unsigned long code = wg.getCode();
    int bits = wg.getWiegandType();

    Serial.print("Wiegand bits=");
    Serial.print(bits);
    Serial.print(" code=");
    Serial.println(code);

    if (bits == 26 || bits == 32) {
      if (WiFi.status() == WL_CONNECTED) {
        String hash = sha256Hex(String(TAG_SALT) + String(code));
        reportScan(hash);
      } else {
        Serial.println("No WiFi, cannot report scan");
        setLedMode(LED_OTA_FAIL);
      }
    }
  }
}
