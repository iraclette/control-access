#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <Wiegand.h>
#include "mbedtls/sha256.h"

// ================= CONFIG =================
static const int D0_PIN = 26;
static const int D1_PIN = 27;

static const int RELAY_PIN = 25;
static const bool RELAY_ACTIVE_HIGH = true;

static const uint32_t UNLOCK_MS = 800;

static const char* WIFI_SSID     = "Irakli";
static const char* WIFI_PASSWORD = "ip20061009 me";

// ⚠️ 127.0.0.1 ne marche pas sur ESP32: mets l'IP de ton serveur (PC) ou URL publique
static const char* BASE_URL      = "http://192.168.56.1:8000";
static const char* DEVICE_SECRET = "Developeri22_ip20061009";
static const char* PIN_SALT      = "W7RJexc3HJwYB6NxVzJZ";

static const uint32_t SYNC_EVERY_MS = 30 * 1000;

// Construction PIN (si le keypad envoie par touche)
static const uint32_t PIN_TIMEOUT_MS = 8000; // reset si l'utilisateur attend trop
static const uint8_t  PIN_MIN_LEN = 4;
static const uint8_t  PIN_MAX_LEN = 12;
// ==========================================

WIEGAND wg;
Preferences prefs;

// ---------- SHA256 ----------
String sha256Hex(const String &input) {
  uint8_t hash[32];
  mbedtls_sha256_context ctx;
  mbedtls_sha256_init(&ctx);
  mbedtls_sha256_starts_ret(&ctx, 0);
  mbedtls_sha256_update_ret(&ctx, (const unsigned char*)input.c_str(), input.length());
  mbedtls_sha256_finish_ret(&ctx, hash);
  mbedtls_sha256_free(&ctx);

  static const char* hex = "0123456789abcdef";
  char out[65];
  for (int i = 0; i < 32; i++) {
    out[i * 2]     = hex[(hash[i] >> 4) & 0xF];
    out[i * 2 + 1] = hex[hash[i] & 0xF];
  }
  out[64] = 0;
  return String(out);
}

String hashPin(const String &pin) {
  // backend: sha256(pin + salt)
  return sha256Hex(pin + String(PIN_SALT));
}

// ---------- Relay ----------
void relaySet(bool on) {
  if (RELAY_ACTIVE_HIGH) digitalWrite(RELAY_PIN, on ? HIGH : LOW);
  else                   digitalWrite(RELAY_PIN, on ? LOW  : HIGH);
}

void unlockDoor() {
  Serial.println("UNLOCK → relay pulse");
  relaySet(true);
  delay(UNLOCK_MS);
  relaySet(false);
}

// ---------- Cache ----------
bool isHashAllowed(const String &pinHash) {
  prefs.begin("cache", true);
  String json = prefs.getString("allowed_json", "");
  prefs.end();

  if (json.isEmpty()) return false;

  StaticJsonDocument<4096> doc;
  if (deserializeJson(doc, json)) return false;

  JsonObject allowed = doc["allowed"].as<JsonObject>();
  if (!allowed.containsKey(pinHash)) return false;
  return allowed[pinHash].as<bool>() == true;
}

void saveCacheFromSyncPayload(const String &payload) {
  StaticJsonDocument<16384> doc;
  if (deserializeJson(doc, payload)) {
    Serial.println("Sync JSON parse failed");
    return;
  }

  JsonArray flats = doc["flats"].as<JsonArray>();

  StaticJsonDocument<4096> out;
  JsonObject allowed = out.createNestedObject("allowed");

  for (JsonObject f : flats) {
    const char* ph = f["pin_hash"];
    bool enabled = f["access_enabled"] | false;
    if (ph && ph[0] != '\0') allowed[ph] = enabled;
  }

  String allowedJson;
  serializeJson(out, allowedJson);

  prefs.begin("cache", false);
  prefs.putString("allowed_json", allowedJson);
  prefs.end();

  Serial.println("Cache updated");
}

// ---------- Sync ----------
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

  String payload = http.getString();
  http.end();

  saveCacheFromSyncPayload(payload);
  return true;
}

// ---------- PIN assembly ----------
String currentPin = "";
uint32_t lastKeyAtMs = 0;

void resetPinBuffer() {
  if (!currentPin.isEmpty()) Serial.println("PIN buffer reset");
  currentPin = "";
  lastKeyAtMs = 0;
}

// Map “key message” to a character.
// This is keypad-dependent. Start with debug prints and adjust mapping.
bool mapKeyToChar(unsigned long code, int bits, char &out) {
  // Common mapping (NOT guaranteed):
  // Some keypads send 4-bit codes: 0-9, 10='*', 11='#'
  if (bits == 4 || bits == 8) {
    if (code <= 9) { out = char('0' + code); return true; }
    if (code == 10) { out = '*'; return true; }
    if (code == 11) { out = '#'; return true; }
  }
  return false;
}

void handleFullPin(const String &pin) {
  Serial.print("PIN final: ");
  Serial.println(pin);

  if (pin.length() < PIN_MIN_LEN || pin.length() > PIN_MAX_LEN) {
    Serial.println("Bad PIN length");
    return;
  }
  for (size_t i = 0; i < pin.length(); i++) {
    if (!isDigit(pin[i])) {
      Serial.println("PIN not numeric");
      return;
    }
  }

  String h = hashPin(pin);
  if (isHashAllowed(h)) {
    Serial.println("ACCESS GRANTED");
    unlockDoor();
  } else {
    Serial.println("ACCESS DENIED");
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(RELAY_PIN, OUTPUT);
  relaySet(false);

  wg.begin(D0_PIN, D1_PIN);

  Serial.println("Booting...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("WiFi connecting");
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi OK. IP=");
    Serial.println(WiFi.localIP());
    syncOnce();
  } else {
    Serial.println("WiFi not connected. Using cache only.");
  }
}

uint32_t lastSyncAtMs = 0;

void loop() {
  // timeout PIN buffer
  if (!currentPin.isEmpty() && (millis() - lastKeyAtMs) > PIN_TIMEOUT_MS) {
    resetPinBuffer();
  }

  // periodic sync
  if (WiFi.status() == WL_CONNECTED && (millis() - lastSyncAtMs) > SYNC_EVERY_MS) {
    Serial.println("Sync...");
    syncOnce();
    lastSyncAtMs = millis();
  }

  // Wiegand read
  if (wg.available()) {
    unsigned long code = wg.getCode();
    int bits = wg.getWiegandType();

    // DEBUG: always print raw
    Serial.print("Wiegand msg: bits=");
    Serial.print(bits);
    Serial.print(" code=");
    Serial.println(code);

    // Try interpret as keypress
    char k;
    if (mapKeyToChar(code, bits, k)) {
      lastKeyAtMs = millis();

      if (k == '#') {
        // treat as ENTER
        if (!currentPin.isEmpty()) handleFullPin(currentPin);
        resetPinBuffer();
        return;
      }

      if (k == '*') {
        // clear
        resetPinBuffer();
        return;
      }

      // digit
      if (currentPin.length() < PIN_MAX_LEN) {
        currentPin += k;
        Serial.print("PIN buffer: ");
        Serial.println(currentPin);
      } else {
        Serial.println("PIN too long, resetting");
        resetPinBuffer();
      }
      return;
    }

    // If not a keypress, maybe this keypad sends the full PIN as a single code.
    // Heuristic: if bits <= 32, treat code as decimal string
    if (bits <= 32) {
      String pin = String(code);
      handleFullPin(pin);
      resetPinBuffer();
      return;
    }

    Serial.println("Unrecognized Wiegand format → need mapping from keypad manual/logs.");
  }
}
