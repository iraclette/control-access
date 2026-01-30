#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include "mbedtls/sha256.h"

// ===================== CONFIG =====================
static const char* WIFI_SSID     = "YOUR_WIFI";
static const char* WIFI_PASSWORD = "YOUR_PASS";

static const char* BASE_URL      = "http://127.0.0.1:8000"; // or http://192.168.x.x:8000 for LAN
static const char* DEVICE_SECRET = "Developeri22_ip20061009";     // must match backend
static const char* PIN_SALT      = "W7RJexc3HJwYB6NxVzJZ";        // must match backend

// Wiegand pins from keypad
static const int D0_PIN = 26;    // choose free GPIOs
static const int D1_PIN = 27;

// Relay pin (to IN on relay module)
static const int RELAY_PIN = 25;

// Unlock pulse time
static const uint32_t UNLOCK_MS = 1200;

// Sync interval
static const uint32_t SYNC_EVERY_MS = 30 * 1000; // 30s

// Wiegand: if no bits arrive for this time, consider message done
static const uint32_t WIEGAND_GAP_MS = 30;
// ===================================================

// Cache stored in NVS under "cache"
Preferences prefs;

// ---------- Wiegand capture ----------
volatile uint64_t wiegandBits = 0;
volatile uint8_t wiegandBitCount = 0;
volatile uint32_t lastPulseMs = 0;

void IRAM_ATTR onD0() {
  // D0 means 0 bit
  wiegandBits <<= 1;
  wiegandBitCount++;
  lastPulseMs = millis();
}
void IRAM_ATTR onD1() {
  // D1 means 1 bit
  wiegandBits = (wiegandBits << 1) | 1ULL;
  wiegandBitCount++;
  lastPulseMs = millis();
}

bool readWiegand(uint64_t &bits, uint8_t &count) {
  // If we have bits and gap elapsed -> message done
  if (wiegandBitCount > 0 && (millis() - lastPulseMs) > WIEGAND_GAP_MS) {
    noInterrupts();
    bits = wiegandBits;
    count = wiegandBitCount;
    wiegandBits = 0;
    wiegandBitCount = 0;
    interrupts();
    return true;
  }
  return false;
}

// ---------- SHA256 hex(pin + salt) ----------
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
    out[i * 2] = hex[(hash[i] >> 4) & 0xF];
    out[i * 2 + 1] = hex[hash[i] & 0xF];
  }
  out[64] = 0;
  return String(out);
}

String hashPin(const String &pin) {
  // Must match backend: sha256(PIN + SALT) or SALT+PIN depending on your backend.
  // You said your working backend is PIN + SALT, so we do that:
  return sha256Hex(pin + String(PIN_SALT));
}

// ---------- Relay ----------
void unlockDoor() {
  Serial.println("UNLOCK: relay pulse");
  digitalWrite(RELAY_PIN, HIGH);     // adjust if your relay is active-low
  delay(UNLOCK_MS);
  digitalWrite(RELAY_PIN, LOW);
}

// ---------- Cache format ----------
/*
We store:
- version (int)
- json string of flats data, but simplified:
  { "allowed": { "<pin_hash>": true/false, ... } }
*/
bool isHashAllowed(const String &pinHash) {
  prefs.begin("cache", true);
  String json = prefs.getString("allowed_json", "");
  prefs.end();

  if (json.length() == 0) return false;

  StaticJsonDocument<8192> doc;
  DeserializationError err = deserializeJson(doc, json);
  if (err) return false;

  JsonObject allowed = doc["allowed"].as<JsonObject>();
  if (!allowed.containsKey(pinHash)) return false;
  return allowed[pinHash].as<bool>() == true;
}

void saveCacheFromSyncPayload(const String &payload) {
  // payload is backend /device/sync JSON:
  // { "version": N, "flats": [{label, pin_hash, access_enabled}, ...] }

  StaticJsonDocument<16384> doc;
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    Serial.print("JSON parse fail: ");
    Serial.println(err.c_str());
    return;
  }

  int version = doc["version"] | 0;
  JsonArray flats = doc["flats"].as<JsonArray>();

  StaticJsonDocument<8192> out;
  JsonObject allowed = out.createNestedObject("allowed");

  for (JsonObject f : flats) {
    const char* ph = f["pin_hash"];
    bool enabled = f["access_enabled"] | false;
    if (ph && strlen(ph) > 0) {
      allowed[ph] = enabled;
    }
  }

  String allowedJson;
  serializeJson(out, allowedJson);

  prefs.begin("cache", false);
  prefs.putInt("version", version);
  prefs.putString("allowed_json", allowedJson);
  prefs.end();

  Serial.print("Cache saved. Version=");
  Serial.println(version);
}

// ---------- Sync ----------
bool syncOnce() {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = String(BASE_URL) + "/device/sync";

  http.begin(url);
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

// ---------- Turn Wiegand bits into a "PIN" string ----------
/*
Many Wiegand keypads send:
- 4-bit keypresses (each digit), OR
- a final multi-bit code representing the whole entered PIN, OR
- card data format (26/34 bits), not for PIN.

Without the keypad manual, we can’t know the exact encoding.
So we start with a debug approach:
- print bit count + bits
- ALSO try interpreting as decimal number if bitcount <= 32
- You then see what changes when you type digits.
*/
String decodeToPinGuess(uint64_t bits, uint8_t count) {
  // Basic guess: treat as integer code
  if (count <= 32) {
    uint32_t v = (uint32_t)bits;
    return String(v);
  }
  // fallback: return bits as hex string
  char buf[20];
  snprintf(buf, sizeof(buf), "%llx", (unsigned long long)bits);
  return String(buf);
}

// ---------- Setup/Loop ----------
uint32_t lastSyncAt = 0;

void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  pinMode(D0_PIN, INPUT_PULLUP);
  pinMode(D1_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(D0_PIN), onD0, FALLING);
  attachInterrupt(digitalPinToInterrupt(D1_PIN), onD1, FALLING);

  Serial.println("\nBooting...");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi connecting");
  for (int i = 0; i < 30 && WiFi.status() != WL_CONNECTED; i++) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi OK. IP=");
    Serial.println(WiFi.localIP());
    syncOnce();
    lastSyncAt = millis();
  } else {
    Serial.println("WiFi not connected. Using cache only.");
  }
}

void loop() {
  // periodic sync
  if (WiFi.status() == WL_CONNECTED && (millis() - lastSyncAt) > SYNC_EVERY_MS) {
    Serial.println("Sync...");
    syncOnce();
    lastSyncAt = millis();
  }

  // read wiegand message
  uint64_t bits;
  uint8_t count;
  if (readWiegand(bits, count)) {
    Serial.print("Wiegand received. bits=");
    Serial.print((unsigned long long)bits);
    Serial.print(" count=");
    Serial.println(count);

    String pinGuess = decodeToPinGuess(bits, count);
    Serial.print("PIN guess: ");
    Serial.println(pinGuess);

    // if it isn't digits, you're probably not getting raw PIN, just codes
    bool allDigits = true;
    for (size_t i = 0; i < pinGuess.length(); i++) {
      if (!isDigit(pinGuess[i])) { allDigits = false; break; }
    }

    if (!allDigits) {
      Serial.println("Not numeric PIN guess. Need keypad encoding info or decode mapping.");
      return;
    }

    String h = hashPin(pinGuess);
    Serial.print("Computed pin_hash: ");
    Serial.println(h);

    if (isHashAllowed(h)) {
      Serial.println("ACCESS GRANTED");
      unlockDoor();
    } else {
      Serial.println("ACCESS DENIED");
    }
  }
}
