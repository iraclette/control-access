#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wiegand.h>
#include "mbedtls/sha256.h"
#include <map>
#include <Update.h>
#include <WiFiClientSecure.h>

// ================= CONFIG =================
#define D0_PIN 26
#define D1_PIN 27
#define RELAY_PIN 25
#define LED 2

#define RELAY_ACTIVE_HIGH false

const char* WIFI_SSID     = "Irakli";
const char* WIFI_PASSWORD = "ip20061009 me";

const char* BASE_URL      = "https://control-access.onrender.com";

// ATTENTION: ton backend check dev.secret (par device).
// Donc soit tu mets le même secret partout, soit tu stockes un secret par device en DB.
const char* DEVICE_SECRET = "Developeri22_ip20061009";

const char* PIN_SALT      = "W7RJexc3HJwYB6NxVzJZ";

// version firmware actuelle
static const char* CURRENT_FW_VERSION = "1.0.0";

// timing
static const uint32_t PIN_TIMEOUT_MS = 8000;
static const uint32_t SYNC_EVERY_MS  = 30 * 1000;
// ============= LED_Patterns ================

enum LedMode {
  LED_OFF,
  LED_ON,
  LED_WIFI_CONNECTING,
  LED_SYNC_OK,
  LED_OTA_CHECK,
  LED_OTA_DOWNLOADING,
  LED_OTA_SUCCESS,
  LED_OTA_FAIL
};

LedMode ledMode = LED_OFF;
uint32_t ledT0 = 0;
bool ledState = false;

void setLedMode(LedMode m) {
  ledMode = m;
  ledT0 = millis();
  ledState = false;
  digitalWrite(LED, LOW);
}

void ledTask() {
  // call this frequently from loop()
  uint32_t now = millis();

  auto blink = [&](uint32_t onMs, uint32_t offMs) {
    uint32_t period = onMs + offMs;
    uint32_t t = (now - ledT0) % period;
    bool on = (t < onMs);
    digitalWrite(LED, on ? HIGH : LOW);
  };

  switch (ledMode) {
    case LED_OFF: digitalWrite(LED, LOW); break;
    case LED_ON:  digitalWrite(LED, HIGH); break;

    case LED_WIFI_CONNECTING: blink(100, 100); break;      // fast blink
    case LED_SYNC_OK:         blink(40, 960); break;       // short pulse every second
    case LED_OTA_CHECK:       blink(200, 800); break;      // 1 blink / sec
    case LED_OTA_DOWNLOADING: blink(300, 300); break;      // steady-ish blink
    case LED_OTA_SUCCESS:     blink(100, 100); break;      // burst for a while
    case LED_OTA_FAIL:        blink(700, 300); break;      // long on, short off
  }
}

std::map<String, bool> allowedPins;

WIEGAND wg;
String pinBuffer = "";
uint32_t lastKeyMs = 0;

uint32_t unlockMs = 800;
uint32_t lastSyncMs = 0;

String deviceId;

// ---------- Relay ----------
void relayOn()  { digitalWrite(RELAY_PIN, RELAY_ACTIVE_HIGH ? HIGH : LOW); }
void relayOff() { digitalWrite(RELAY_PIN, RELAY_ACTIVE_HIGH ? LOW  : HIGH); }

void unlockDoor() {
  Serial.println("🔓 UNLOCK");
  relayOn();
  delay(unlockMs);
  relayOff();
  Serial.println("🔒 RELAY off");
}

// ---------- SHA256 ----------
String sha256Hex(const String &input) {
  uint8_t hash[32];
  mbedtls_sha256_context ctx;
  mbedtls_sha256_init(&ctx);
  mbedtls_sha256_starts_ret(&ctx, 0);
  mbedtls_sha256_update_ret(&ctx, (const unsigned char*)input.c_str(), input.length());
  mbedtls_sha256_finish_ret(&ctx, hash);
  mbedtls_sha256_free(&ctx);

  const char* hex = "0123456789abcdef";
  char out[65];
  for (int i = 0; i < 32; i++) {
    out[i*2]   = hex[(hash[i] >> 4) & 0xF];
    out[i*2+1] = hex[hash[i] & 0xF];
  }
  out[64] = 0;
  return String(out);
}

// ---------- Device ID ----------
String getDeviceId() {
  uint64_t chipid = ESP.getEfuseMac();
  char id[17];
  snprintf(id, sizeof(id), "%04X%08X",
           (uint16_t)(chipid >> 32),
           (uint32_t)chipid);
  return String(id);
}

// ---------- OTA download ----------
bool otaDownloadAndUpdate(String binUrl, const char* expectedSha256 /* can be null */) {
  // build absolute URL if needed
  if (binUrl.startsWith("/")) binUrl = String(BASE_URL) + binUrl;

  Serial.print("OTA downloading: ");
  Serial.println(binUrl);
  setLedMode(LED_OTA_DOWNLOADING);

  WiFiClientSecure client;
  client.setInsecure(); // rapide; mieux: mettre le root CA

  HTTPClient http;
  if (!http.begin(client, binUrl)) {
    Serial.println("OTA http.begin failed");
    return false;
  }

  http.addHeader("X-Device-Secret", DEVICE_SECRET); // optionnel si tu veux protéger

  int code = http.GET();
  if (code != 200) {
    Serial.print("OTA HTTP ");
    Serial.println(code);
    http.end();
    return false;
  }

  int len = http.getSize();
  if (len <= 0) {
    Serial.println("OTA invalid content length");
    http.end();
    return false;
  }

  WiFiClient* stream = http.getStreamPtr();

  if (!Update.begin(len)) {
    Serial.println("OTA Update.begin failed");
    http.end();
    return false;
  }

  size_t written = Update.writeStream(*stream);
  if (written != (size_t)len) {
    Serial.print("OTA written mismatch: ");
    Serial.print(written);
    Serial.print("/");
    Serial.println(len);
    Update.abort();
    http.end();
    return false;
  }

  if (!Update.end(true)) {
    Serial.print("OTA Update.end failed: ");
    Serial.println(Update.errorString());
    setLedMode(LED_OTA_FAIL);
    http.end();
    return false;
  }

  http.end();

  Serial.println("✅ OTA success, rebooting...");
  setLedMode(LED_OTA_SUCCESS);
  delay(500);
  ESP.restart();
  return true;
}

// ---------- Sync + OTA embedded ----------
bool syncOnce() {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(BASE_URL) + "/device/" + deviceId + "/sync";
  if (!http.begin(client, url)) {
    Serial.println("Sync http.begin failed");
    return false;
  }
  http.addHeader("X-Device-Secret", DEVICE_SECRET);

  int code = http.GET();
  if (code != 200) {
    Serial.print("Sync HTTP ");
    Serial.println(code);
    http.end();
    return false;
  }

  String body = http.getString();
  http.end();

  StaticJsonDocument<12288> doc;
  auto err = deserializeJson(doc, body);
  if (err) {
    Serial.print("Sync JSON error: ");
    Serial.println(err.c_str());
    return false;
  }

  // entries
  allowedPins.clear();
  for (JsonObject e : doc["entries"].as<JsonArray>()) {
    const char* h = e["pin_hash"];
    bool en = e["access_enabled"] | false;
    if (h && *h) allowedPins[String(h)] = en;
  }

  // unlockMs optionnel si tu l'ajoutes côté backend
  unlockMs = doc["device"]["unlock_ms"] | unlockMs;

  Serial.print("✅ Sync OK. allowedPins=");
  Serial.println((int)allowedPins.size());

  // OTA embedded in sync
  if (doc["ota"].is<JsonObject>()) {
    String targetVer = doc["ota"]["version"] | "";
    String binUrl    = doc["ota"]["url"] | "";
    const char* sha  = doc["ota"]["sha256"] | nullptr;

    if (targetVer.length() > 0 && binUrl.length() > 0 && targetVer != CURRENT_FW_VERSION) {
      Serial.print("🧩 OTA available. target=");
      Serial.println(targetVer);
      otaDownloadAndUpdate(binUrl, sha);
    }
  }

  return true;
}

// ---------- PIN handling ----------
void resetPin() { pinBuffer = ""; }

void handlePin() {
  Serial.print("PIN entered: ");
  Serial.println(pinBuffer);

  if (pinBuffer.length() < 4) {
    Serial.println("PIN too short");
    resetPin();
    return;
  }

  String hash = sha256Hex(String(PIN_SALT) + pinBuffer);
  Serial.print("Hash: ");
  Serial.println(hash);

  if (allowedPins.count(hash) && allowedPins[hash]) {
    Serial.println("✅ ACCESS GRANTED");
    unlockDoor();
  } else {
    Serial.println("❌ ACCESS DENIED");
  }

  resetPin();
}

// ---------- Setup ----------
void setup() {
  Serial.begin(115200);
  delay(200);

  deviceId = getDeviceId();
  Serial.print("DEVICE_ID=");
  Serial.println(deviceId);

  pinMode(RELAY_PIN, OUTPUT);
  pinMode(LED, OUTPUT);
  setLedMode(LED_WIFI_CONNECTING);
  relayOff();

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
    syncOnce();
    lastSyncMs = millis();
    setLedMode(LED_SYNC_OK); // or LED_SYNC_OK after sync
  } else {
    Serial.println("WiFi not connected (offline mode)");
  }
}

// ---------- Loop ----------
void loop() {
  if (!pinBuffer.isEmpty() && millis() - lastKeyMs > PIN_TIMEOUT_MS) resetPin();

  if (WiFi.status() == WL_CONNECTED && millis() - lastSyncMs > SYNC_EVERY_MS) {
    syncOnce();
    lastSyncMs = millis();
  }

  if (wg.available()) {
    unsigned long code = wg.getCode();
    int bits = wg.getWiegandType();

    Serial.print("Wiegand bits=");
    Serial.print(bits);
    Serial.print(" code=");
    Serial.println(code);

    if (bits == 4 || bits == 8) {
      lastKeyMs = millis();

      if (code <= 9) {
        pinBuffer += char('0' + code);
        Serial.print("PIN: ");
        Serial.println(pinBuffer);
      } else if (code == 27) { // clear (*)
        resetPin();
      } else if (code == 13) { // enter (#)
        handlePin();
      }
    }
  }
}
