#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wiegand.h>
#include "mbedtls/sha256.h"
#include <map>


// ================= CONFIG =================
#define D0_PIN 26
#define D1_PIN 27
#define RELAY_PIN 25

#define RELAY_ACTIVE_HIGH false
#define UNLOCK_MS 800

const char* WIFI_SSID     = "Irakli";
const char* WIFI_PASSWORD = "ip20061009 me";

const char* BASE_URL      = "https://control-access.onrender.com";
const char* DEVICE_SECRET = "Developeri22_ip20061009";
const char* PIN_SALT      = "W7RJexc3HJwYB6NxVzJZ";
// ==========================================

std::map<String, bool> allowedPins;
WIEGAND wg;
String pinBuffer = "";
unsigned long lastKeyMs = 0;
const unsigned long PIN_TIMEOUT_MS = 8000;

void relayOn()  { digitalWrite(RELAY_PIN, RELAY_ACTIVE_HIGH ? HIGH : LOW); }
void relayOff() { digitalWrite(RELAY_PIN, RELAY_ACTIVE_HIGH ? LOW  : HIGH); }

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
// ---------- Sync  ----------
bool syncOnce() {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  http.begin(String(BASE_URL) + "/device/sync");
  http.addHeader("X-Device-Secret", DEVICE_SECRET);

  int code = http.GET();
  if (code != 200) {
    Serial.print("Sync HTTP ");
    Serial.println(code);
    http.end();
    return false;
  }

  StaticJsonDocument<8192> doc;
  deserializeJson(doc, http.getString());
  http.end();

  allowedPins.clear();

  for (JsonObject f : doc["flats"].as<JsonArray>()) {
    allowedPins[(f["pin_hash"])] = f["access_enabled"];
  }

  Serial.println("✅ Sync OK");
  return true;
}

void logRemote(const String& msg) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(String(BASE_URL) + "/device/log");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Secret", DEVICE_SECRET);

  StaticJsonDocument<256> doc;
  doc["msg"] = msg;

  String body;
  serializeJson(doc, body);
  http.POST(body);
  http.end();
}

// ---------- Relay ----------
void unlockDoor() {
  Serial.println("🔓 UNLOCK");
  relayOn();
  delay(UNLOCK_MS);
  relayOff();
  Serial.println("🔒 RELAY off");
}

// ---------- PIN HANDLING ----------
void resetPin() {
  pinBuffer = "";
}

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
  delay(300);

  pinMode(RELAY_PIN, OUTPUT);
  relayOff();
  digitalWrite(RELAY_PIN, RELAY_ACTIVE_HIGH ? LOW : HIGH);

  wg.begin(D0_PIN, D1_PIN);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");
  Serial.println(WiFi.localIP());
  Serial.println(">> BEFORE syncOnce()");
  syncOnce();
  Serial.println(">> AFTER syncOnce()");
}

// ---------- Loop ----------
void loop() {
  if (!pinBuffer.isEmpty() && millis() - lastKeyMs > PIN_TIMEOUT_MS) {
    resetPin();
  }

  if (wg.available()) {
    unsigned long code = wg.getCode();
    int bits = wg.getWiegandType();

    Serial.print("Wiegand bits=");
    Serial.print(bits);
    Serial.print(" code=");
    Serial.println(code);

    // Standard keypad mapping
    if (bits == 4 || bits == 8) {
      lastKeyMs = millis();

      if (code <= 9) {
        pinBuffer += char('0' + code);
        Serial.print("PIN: ");
        Serial.println(pinBuffer);
      } else if (code == 27) { // *
        resetPin();
      } else if (code == 13) { // #
        handlePin();
      }
    }
  }
}
