#pragma once
// Sync response parsing + key lookup. Kept free of WiFi/HTTP so it also builds on the
// host: see test/test_sync_parser (run with `pio test -e native`).

#include <Arduino.h>
#include <ArduinoJson.h>
#include <string.h>
#include <vector>
#include <array>
#include <algorithm>

typedef std::array<uint8_t, 32> KeyHash;

// ---------- Key hash helpers ----------
static int hexNibble(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

static bool parseHexHash(const char* hex, KeyHash &out) {
  if (!hex || strlen(hex) != 64) return false;
  for (int i = 0; i < 32; i++) {
    int hi = hexNibble(hex[i * 2]);
    int lo = hexNibble(hex[i * 2 + 1]);
    if (hi < 0 || lo < 0) return false;
    out[i] = (hi << 4) | lo;
  }
  return true;
}

static bool isAllowed(const std::vector<KeyHash> &list, const String &hexHash) {
  KeyHash h;
  return parseHexHash(hexHash.c_str(), h) && std::binary_search(list.begin(), list.end(), h);
}

// ---------- Streaming sync parser ----------
// The sync response holds every PIN/tag of the building. Buffering it into a String
// and then deserializing it whole into one JsonDocument needed roughly 3x its size in
// heap at once; once the building had enough keys that allocation failed, the sync
// aborted and the device silently kept its old list forever (old tags kept working,
// new ones never arrived). Instead we walk the top-level object straight off the
// socket and deserialize the "entries"/"tags" arrays one small element at a time.
static int peekRaw(Stream &s) {
  uint32_t t0 = millis();
  for (;;) {
    int c = s.peek();
    if (c >= 0) return c;
    if (millis() - t0 > 5000) return -1;
    delay(1);
  }
}

static bool isJsonWs(int c) { return c == ' ' || c == '\t' || c == '\r' || c == '\n'; }

static int peekNonWs(Stream &s) {
  for (;;) {
    int c = peekRaw(s);
    if (!isJsonWs(c)) return c;
    s.read();
  }
}

static int readNonWs(Stream &s) {
  int c = peekNonWs(s);
  if (c >= 0) s.read();
  return c;
}

// Reads a number/bool/null/simple string without consuming the delimiter after it
// (deserializeJson would swallow one char past a bare number).
static String readScalar(Stream &s) {
  if (peekRaw(s) == '"') {
    s.read();
    return s.readStringUntil('"');
  }
  String v;
  for (;;) {
    int c = peekRaw(s);
    if (c < 0 || c == ',' || c == '}' || c == ']' || isJsonWs(c)) return v;
    v += (char)s.read();
  }
}

static bool parseHashArray(Stream &s, const char* field, std::vector<KeyHash> &out) {
  if (readNonWs(s) != '[') return false;
  if (peekNonWs(s) == ']') { s.read(); return true; }

  JsonDocument item;  // reused: only ever holds one {hash, access_enabled} object
  for (;;) {
    if (deserializeJson(item, s)) return false;
    KeyHash h;
    if ((item["access_enabled"] | false) && parseHexHash(item[field] | "", h)) out.push_back(h);
    int c = readNonWs(s);
    if (c == ']') return true;
    if (c != ',') return false;
  }
}

struct SyncData {
  std::vector<KeyHash> pins;
  std::vector<KeyHash> tags;
  long version;
  uint32_t unlockMs;
  String otaVersion, otaUrl, otaSha256;
};

static bool parseSync(Stream &s, SyncData &out) {
  if (readNonWs(s) != '{') return false;
  if (peekNonWs(s) == '}') { s.read(); return true; }

  for (;;) {
    if (readNonWs(s) != '"') return false;
    String key = s.readStringUntil('"');
    if (readNonWs(s) != ':') return false;

    int c = peekNonWs(s);
    if (key == "entries") {
      if (!parseHashArray(s, "pin_hash", out.pins)) return false;
    } else if (key == "tags") {
      if (!parseHashArray(s, "hash", out.tags)) return false;
    } else if (c == '{' || c == '[') {
      JsonDocument doc;  // small: "ota" / "device"
      if (deserializeJson(doc, s)) return false;
      if (key == "device") {
        out.unlockMs = doc["unlock_ms"] | out.unlockMs;
      } else if (key == "ota") {
        out.otaVersion = doc["version"] | "";
        out.otaUrl     = doc["url"] | "";
        out.otaSha256  = doc["sha256"] | "";
      }
    } else {
      String v = readScalar(s);
      if (key == "version" && v.length() > 0 && v != "null") out.version = v.toInt();
    }

    c = readNonWs(s);
    if (c == '}') return true;
    if (c != ',') return false;
  }
}

static void finalizeKeys(std::vector<KeyHash> &v) {
  std::sort(v.begin(), v.end());
  v.erase(std::unique(v.begin(), v.end()), v.end());
  v.shrink_to_fit();
}
