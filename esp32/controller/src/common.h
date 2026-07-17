#pragma once

// Shared between main.cpp (door/elevator) and enroller_main.cpp -- each build only
// ever compiles one of those two files (see platformio.ini build_src_filter), so
// defining state/functions directly here is safe: no risk of duplicate-symbol
// linker errors. `static` (not C++17 `inline`) so it works regardless of the
// toolchain's default C++ standard.

#include <Arduino.h>
#include <time.h>
#include "mbedtls/sha256.h"

// ============= LED patterns ================
// Requires a `LED` pin macro to be #defined before this header is included.

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

static LedMode ledMode = LED_OFF;
static uint32_t ledT0 = 0;
static bool ledState = false;

static void setLedMode(LedMode m) {
  ledMode = m;
  ledT0 = millis();
  ledState = false;
  digitalWrite(LED, LOW);
}

static void ledTask() {
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

// ---------- SHA256 ----------
static String sha256Hex(const String &input) {
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
static String getDeviceId() {
  uint64_t chipid = ESP.getEfuseMac();
  char id[17];
  snprintf(id, sizeof(id), "%04X%08X",
           (uint16_t)(chipid >> 32),
           (uint32_t)chipid);
  return String(id);
}

// ---------- Time sync ----------
// WiFiClientSecure::setCACert() validates the server cert's date range against the
// device's clock, which boots at ~1970 with no RTC -- without this, every TLS
// connection fails cert verification before any HTTPS call can succeed.
static void syncTime() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("Waiting for NTP time sync");
  time_t now = time(nullptr);
  uint32_t t0 = millis();
  while (now < 8 * 3600 * 2 && millis() - t0 < 15000) {
    delay(250);
    Serial.print(".");
    now = time(nullptr);
  }
  Serial.println();
  Serial.print("Time synced: ");
  Serial.println((long)now);
}
