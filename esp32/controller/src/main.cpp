#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wiegand.h>
#include "mbedtls/sha256.h"
#include <map>
#include <Update.h>
#include <WiFiClientSecure.h>
#include <Preferences.h>
#include <time.h>
#include "certs.h"
#include "secrets.h"

// ================= CONFIG =================
#define D0_PIN 26
#define D1_PIN 27
#define RELAY_PIN 25
#define LED 2

#include "common.h"

#define RELAY_ACTIVE_HIGH false

const char* WIFI_SSID     = SECRET_WIFI_SSID;
const char* WIFI_PASSWORD = SECRET_WIFI_PASSWORD;

const char* BASE_URL      = "https://control-access.onrender.com";

// Shared across devices for now (per-device secrets already exist in the
// devices table for /sync; this one gates /device_logs). Must match backend/.env.
const char* DEVICE_SECRET = SECRET_DEVICE_SECRET;

const char* PIN_SALT      = SECRET_PIN_SALT;

const char* TAG_SALT      = SECRET_TAG_SALT;

// version firmware actuelle -- set via -DFW_VERSION in platformio.ini per env,
// so bumping it is a build-config change instead of an easy-to-forget source edit.
#ifndef FW_VERSION
#define FW_VERSION "1.0.0"
#endif
static const char* CURRENT_FW_VERSION = FW_VERSION;

// timing
static const uint32_t PIN_TIMEOUT_MS = 8000;
// Full sync (fetches every pin/tag -- the expensive part) runs on this long interval.
// Actual responsiveness comes from VERSION_CHECK_EVERY_MS below: a full sync also
// runs immediately whenever that cheap check notices the backend's version counter
// changed (any admin edit, or an explicit "force refresh" click, bumps it).
static const uint32_t SYNC_EVERY_MS          = 5UL * 60 * 60 * 1000;  // 5 hours
static const uint32_t VERSION_CHECK_EVERY_MS = 2UL * 60 * 1000;       // 2 minutes

// boot-loop detection: if we reboot this many times without a syncOnce() ever
// completing on the currently running firmware, assume the last OTA was bad.
static const uint32_t BOOT_FAIL_THRESHOLD = 3;
Preferences prefs;

std::map<String, bool> allowedPins;
std::map<String, bool> allowedTags;

WIEGAND wg;
String pinBuffer = "";
String tagBuffer = "";
uint32_t lastKeyMs = 0;

uint32_t unlockMs = 800;
uint32_t lastSyncMs = 0;
uint32_t lastVersionCheckMs = 0;
long lastKnownVersion = -1;  // -1 = unknown yet, forces a sync on the first real check

String deviceId;

// ---------- Relay ----------
void relayOn()  { digitalWrite(RELAY_PIN, RELAY_ACTIVE_HIGH ? HIGH : LOW); }
void relayOff() { digitalWrite(RELAY_PIN, RELAY_ACTIVE_HIGH ? LOW  : HIGH); }

void unlockDoor() {
  Serial.println("UNLOCK");
  relayOn();
  delay(unlockMs);
  relayOff();
  Serial.println("RELAY off");
}

// ---------- Remote logging ----------
void logRemote(const String &msg) {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setCACert(ROOT_CA);

  HTTPClient http;
  String url = String(BASE_URL) + "/device_logs";
  if (!http.begin(client, url)) return;

  http.addHeader("X-Device-Secret", DEVICE_SECRET);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<256> doc;
  doc["msg"] = msg;
  String body;
  serializeJson(doc, body);

  http.POST(body);
  http.end();
}

// ---------- OTA download ----------
bool otaDownloadAndUpdate(String binUrl, const char* expectedSha256 /* can be null */) {
  // fail closed: never flash a binary we can't verify
  if (!expectedSha256 || strlen(expectedSha256) != 64) {
    Serial.println("OTA refused: missing/invalid sha256");
    setLedMode(LED_OTA_FAIL);
    return false;
  }

  // build absolute URL if needed
  if (binUrl.startsWith("/")) binUrl = String(BASE_URL) + binUrl;

  Serial.print("OTA downloading: ");
  Serial.println(binUrl);
  setLedMode(LED_OTA_DOWNLOADING);

  WiFiClientSecure client;
  client.setCACert(ROOT_CA);

  HTTPClient http;
  if (!http.begin(client, binUrl)) {
    Serial.println("OTA http.begin failed");
    return false;
  }

  http.addHeader("X-Device-Secret", DEVICE_SECRET);

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

  // Stream manually (instead of Update.writeStream) so we can hash each chunk
  // as it's written and verify integrity BEFORE Update.end() finalizes the flash.
  mbedtls_sha256_context shaCtx;
  mbedtls_sha256_init(&shaCtx);
  mbedtls_sha256_starts_ret(&shaCtx, 0);

  uint8_t buf[1024];
  size_t written = 0;
  uint32_t lastDataMs = millis();
  bool streamError = false;

  while (written < (size_t)len) {
    size_t avail = stream->available();
    if (avail == 0) {
      if (!client.connected() || millis() - lastDataMs > 15000) {
        Serial.println("OTA stream timeout/disconnected");
        streamError = true;
        break;
      }
      delay(10);
      continue;
    }

    size_t toRead = avail > sizeof(buf) ? sizeof(buf) : avail;
    int n = stream->read(buf, toRead);
    if (n <= 0) continue;
    lastDataMs = millis();

    mbedtls_sha256_update_ret(&shaCtx, buf, n);
    if (Update.write(buf, n) != (size_t)n) {
      Serial.println("OTA flash write failed");
      streamError = true;
      break;
    }
    written += n;
  }

  http.end();

  if (streamError || written != (size_t)len) {
    Serial.println("OTA download incomplete");
    Update.abort();
    mbedtls_sha256_free(&shaCtx);
    setLedMode(LED_OTA_FAIL);
    return false;
  }

  uint8_t hash[32];
  mbedtls_sha256_finish_ret(&shaCtx, hash);
  mbedtls_sha256_free(&shaCtx);

  const char* hex = "0123456789abcdef";
  char gotHash[65];
  for (int i = 0; i < 32; i++) {
    gotHash[i * 2]     = hex[(hash[i] >> 4) & 0xF];
    gotHash[i * 2 + 1] = hex[hash[i] & 0xF];
  }
  gotHash[64] = 0;

  if (strcasecmp(gotHash, expectedSha256) != 0) {
    Serial.print("OTA sha256 mismatch, expected=");
    Serial.print(expectedSha256);
    Serial.print(" got=");
    Serial.println(gotHash);
    Update.abort();
    setLedMode(LED_OTA_FAIL);
    logRemote("OTA REJECTED: sha256 mismatch for " + binUrl);
    return false;
  }

  if (!Update.end(true)) {
    Serial.print("OTA Update.end failed: ");
    Serial.println(Update.errorString());
    setLedMode(LED_OTA_FAIL);
    return false;
  }

  Serial.println("OTA success (sha256 verified), rebooting...");
  setLedMode(LED_OTA_SUCCESS);
  delay(500);
  ESP.restart();
  return true;
}

// ---------- Sync + OTA embedded ----------
bool syncOnce() {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  client.setCACert(ROOT_CA);

  HTTPClient http;
  String url = String(BASE_URL) + "/device/" + deviceId + "/sync";
  if (!http.begin(client, url)) {
    Serial.println("Sync http.begin failed");
    return false;
  }
  http.addHeader("X-Device-Secret", DEVICE_SECRET);
  http.addHeader("X-Firmware-Version", CURRENT_FW_VERSION);

  int code = http.GET();
  if (code != 200) {
    Serial.print("Sync HTTP ");
    Serial.println(code);
    http.end();
    return false;
  }

  String body = http.getString();
  http.end();

  StaticJsonDocument<32768> doc;
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

  // tags
  allowedTags.clear();
  for (JsonObject e : doc["tags"].as<JsonArray>()) {
    const char* h = e["hash"];
    bool en = e["access_enabled"] | false;
    if (h && *h) allowedTags[String(h)] = en;
  }

  // unlockMs optionnel si tu l'ajoutes côté backend
  unlockMs = doc["device"]["unlock_ms"] | unlockMs;  // fallback si absent

  // Remember the version this sync reflects, so the lightweight check-in knows
  // it's already up to date and doesn't trigger a redundant full sync.
  lastKnownVersion = doc["version"] | lastKnownVersion;

  Serial.print("✅ Sync OK. allowedPins=");
  Serial.print((int)allowedPins.size());
  Serial.print(" allowedTags=");
  Serial.println((int)allowedTags.size());
  Serial.print("unlockMs=");
  Serial.println(unlockMs);
  // OTA embedded in sync
  if (doc["ota"].is<JsonObject>()) {
    String targetVer = doc["ota"]["version"] | "";
    String binUrl    = doc["ota"]["url"] | "";
    String shaStr    = doc["ota"]["sha256"] | "";

    if (targetVer.length() > 0 && binUrl.length() > 0 && targetVer != CURRENT_FW_VERSION) {
      Serial.print("🧩 OTA available. target=");
      Serial.println(targetVer);
      otaDownloadAndUpdate(binUrl, shaStr.length() > 0 ? shaStr.c_str() : nullptr);
    }
  }

  // This sync cycle completed fully on the currently running firmware -- mark it good,
  // so a bad OTA doesn't get mistaken for a boot loop after a later, unrelated reset.
  // Only actually write if something's changing: this runs every 30s, and writing
  // unconditionally would needlessly widen the window for a power-loss-mid-write to
  // corrupt flash. Reads are cheap/safe, so check first.
  prefs.begin("ota", false);
  uint32_t curAttempt = prefs.getUInt("bootAttempt", 0);
  String curLastGood = prefs.getString("lastGood", "");
  if (curAttempt != 0 || curLastGood != CURRENT_FW_VERSION) {
    prefs.putUInt("bootAttempt", 0);
    prefs.putString("lastGood", CURRENT_FW_VERSION);
  }
  prefs.end();

  return true;
}

// ---------- Lightweight version check ----------
// Cheap check-in (no flat/tag data, just a counter) so we can poll often without
// the cost of a full sync every time. Triggers an immediate full syncOnce() the
// moment the backend's version counter differs from what we last synced --
// covers both routine admin edits and an explicit "force refresh" click.
void checkVersionAndMaybeSync() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setCACert(ROOT_CA);

  HTTPClient http;
  String url = String(BASE_URL) + "/device/" + deviceId + "/version";
  if (!http.begin(client, url)) {
    Serial.println("Version check http.begin failed");
    return;
  }
  http.addHeader("X-Device-Secret", DEVICE_SECRET);

  int code = http.GET();
  if (code != 200) {
    Serial.print("Version check HTTP ");
    Serial.println(code);
    http.end();
    return;
  }

  String body = http.getString();
  http.end();

  StaticJsonDocument<128> doc;
  auto err = deserializeJson(doc, body);
  if (err) {
    Serial.print("Version check JSON error: ");
    Serial.println(err.c_str());
    return;
  }

  long serverVersion = doc["version"] | -1;
  if (serverVersion != lastKnownVersion) {
    Serial.print("Version changed (");
    Serial.print(lastKnownVersion);
    Serial.print(" -> ");
    Serial.print(serverVersion);
    Serial.println("), doing a full sync");
    syncOnce();
    lastSyncMs = millis();
  }
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
    Serial.println("ACCESS GRANTED");
    unlockDoor();
  } else {
    Serial.println("ACCESS DENIED");
  }

  resetPin();
}

// ---------- Tag handling ----------
void resetTag() { tagBuffer = ""; }

void handleTag(){
  String hash = sha256Hex(String(TAG_SALT) + tagBuffer);
  Serial.print("Hash: ");
  Serial.println(hash);

  if (allowedTags.count(hash) && allowedTags[hash]) {
    Serial.println("ACCESS GRANTED");
    unlockDoor();
  } else {
    Serial.println("ACCESS DENIED");
  }  

  resetTag();
}

// ---------- Setup ----------
void setup() {
  Serial.begin(115200);
  delay(200);

  deviceId = getDeviceId();
  Serial.print("DEVICE_ID=");
  Serial.println(deviceId);
  Serial.print("FW_VERSION=");
  Serial.println(CURRENT_FW_VERSION);

  prefs.begin("ota", false);
  uint32_t bootAttempt = prefs.getUInt("bootAttempt", 0) + 1;
  prefs.putUInt("bootAttempt", bootAttempt);
  String lastGoodVersion = prefs.getString("lastGood", "");
  prefs.end();
  Serial.print("bootAttempt=");
  Serial.println(bootAttempt);

  pinMode(RELAY_PIN, OUTPUT);
  pinMode(LED, OUTPUT);
  setLedMode(LED_WIFI_CONNECTING);
  relayOff();

  wg.begin(D0_PIN, D1_PIN);

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

    if (bootAttempt > BOOT_FAIL_THRESHOLD && lastGoodVersion.length() > 0 && lastGoodVersion != CURRENT_FW_VERSION) {
      // Rebooted repeatedly without ever completing a sync on this firmware -- likely a bad OTA.
      // We don't auto-reflash here (no verified source for the old binary on-device); this makes
      // the failure visible so an admin can re-activate lastGoodVersion from the firmware page,
      // which the normal OTA check below will then pick up and apply.
      setLedMode(LED_OTA_FAIL);
      logRemote("BOOT LOOP: fw=" + String(CURRENT_FW_VERSION) + " lastGood=" + lastGoodVersion +
                " attempts=" + String(bootAttempt) + " -- re-activate lastGood in admin to recover");
    }

    syncOnce();
    lastSyncMs = millis();
    lastVersionCheckMs = millis();
    setLedMode(LED_SYNC_OK); // or LED_SYNC_OK after sync
  } else {
    Serial.println("WiFi not connected (offline mode)");
  }

}

// ---------- Loop ----------
void loop() {
  ledTask();

  if (!pinBuffer.isEmpty() && millis() - lastKeyMs > PIN_TIMEOUT_MS) resetPin();

  if (WiFi.status() == WL_CONNECTED && millis() - lastSyncMs > SYNC_EVERY_MS) {
    syncOnce();
    lastSyncMs = millis();
    lastVersionCheckMs = millis();
  } else if (WiFi.status() == WL_CONNECTED && millis() - lastVersionCheckMs > VERSION_CHECK_EVERY_MS) {
    checkVersionAndMaybeSync();
    lastVersionCheckMs = millis();
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
    } else if (bits == 26 || bits == 32) {
      tagBuffer = String(code);
      handleTag();
    }
  }
}
