// Host-side tests for src/sync_parser.h -- run with: pio test -e native
#include <unity.h>
#include <string>
#include "sync_parser.h"

// Feeds a fixed buffer. With burst > 0 it behaves like a slow socket: only `burst`
// more bytes become readable each time the fake clock advances, and peek()/read()
// return -1 in between -- the case that matters on a real WiFiClient.
class FakeStream : public Stream {
 public:
  FakeStream(const std::string &data, size_t burst = 0)
      : data_(data), burst_(burst), lastTick_(millis()), released_(burst ? burst : data.size()) {}

  int available() override { release(); return (int)(released_ > pos_ ? released_ - pos_ : 0); }
  int peek() override { release(); return pos_ < released_ ? (unsigned char)data_[pos_] : -1; }
  int read() override { int c = peek(); if (c >= 0) pos_++; return c; }

  size_t consumed() const { return pos_; }

 private:
  void release() {
    if (!burst_) return;
    uint32_t t = millis();
    if (t != lastTick_) {
      released_ += burst_ * (t - lastTick_);
      lastTick_ = t;
    }
    if (released_ > data_.size()) released_ = data_.size();
  }

  std::string data_;
  size_t burst_;
  uint32_t lastTick_;
  size_t pos_ = 0;
  size_t released_;
};

static std::string hashHex(uint32_t n) {
  // deterministic, distinct 64-char lowercase hex per n
  char buf[65];
  for (int i = 0; i < 8; i++) snprintf(buf + i * 8, 9, "%08x", n * 2654435761u + (uint32_t)i);
  return std::string(buf, 64);
}

static KeyHash keyOf(const std::string &hex) {
  KeyHash h;
  TEST_ASSERT_TRUE(parseHexHash(hex.c_str(), h));
  return h;
}

static SyncData freshData() {
  SyncData d;
  d.version = -1;
  d.unlockMs = 800;
  return d;
}

// Exactly the shape FastAPI emits for SyncSnapshot (compact, model field order).
static std::string snapshot(const std::string &entries, const std::string &tags,
                            const std::string &ota = "null", long version = 7) {
  return "{\"version\":" + std::to_string(version) + ",\"full\":true,\"entries\":[" + entries +
         "],\"tags\":[" + tags + "],\"ota\":" + ota + ",\"device\":{\"unlock_ms\":5000}}";
}

static std::string pinEntry(const std::string &h, bool en) {
  return std::string("{\"pin_hash\":\"") + h + "\",\"access_enabled\":" + (en ? "true" : "false") + "}";
}
static std::string tagEntry(const std::string &h, bool en) {
  return std::string("{\"hash\":\"") + h + "\",\"access_enabled\":" + (en ? "true" : "false") + "}";
}

void setUp() { fakeclock::now() = 0; }
void tearDown() {}

// ---------- hash helpers ----------
void test_parse_hex_hash() {
  KeyHash h;
  std::string hex = hashHex(1);
  TEST_ASSERT_TRUE(parseHexHash(hex.c_str(), h));
  TEST_ASSERT_EQUAL_HEX8(strtol(hex.substr(0, 2).c_str(), nullptr, 16), h[0]);

  TEST_ASSERT_FALSE(parseHexHash("", h));
  TEST_ASSERT_FALSE(parseHexHash(nullptr, h));
  TEST_ASSERT_FALSE(parseHexHash(hex.substr(0, 63).c_str(), h));     // too short
  TEST_ASSERT_FALSE(parseHexHash((hex + "0").c_str(), h));           // too long
  std::string bad = hex; bad[10] = 'g';
  TEST_ASSERT_FALSE(parseHexHash(bad.c_str(), h));
}

void test_is_allowed_case_insensitive() {
  std::vector<KeyHash> list = {keyOf(hashHex(1)), keyOf(hashHex(2))};
  finalizeKeys(list);
  std::string upper = hashHex(2);
  for (auto &c : upper) c = toupper(c);
  TEST_ASSERT_TRUE(isAllowed(list, String(hashHex(1).c_str())));
  TEST_ASSERT_TRUE(isAllowed(list, String(upper.c_str())));
  TEST_ASSERT_FALSE(isAllowed(list, String(hashHex(3).c_str())));
  TEST_ASSERT_FALSE(isAllowed(list, String("not-a-hash")));
}

void test_finalize_sorts_and_dedupes() {
  std::vector<KeyHash> v = {keyOf(hashHex(3)), keyOf(hashHex(1)), keyOf(hashHex(3)), keyOf(hashHex(2))};
  finalizeKeys(v);
  TEST_ASSERT_EQUAL(3, v.size());
  TEST_ASSERT_TRUE(std::is_sorted(v.begin(), v.end()));
}

// ---------- full snapshot parsing ----------
void test_parses_backend_snapshot() {
  std::string json = snapshot(pinEntry(hashHex(1), true) + "," + pinEntry(hashHex(2), false),
                              tagEntry(hashHex(10), true) + "," + tagEntry(hashHex(11), false) + "," +
                                  tagEntry(hashHex(12), true));
  FakeStream s(json);
  SyncData d = freshData();
  TEST_ASSERT_TRUE(parseSync(s, d));
  finalizeKeys(d.pins);
  finalizeKeys(d.tags);

  TEST_ASSERT_EQUAL(7, d.version);
  TEST_ASSERT_EQUAL(5000, d.unlockMs);
  TEST_ASSERT_EQUAL(1, d.pins.size());  // disabled entries are dropped
  TEST_ASSERT_EQUAL(2, d.tags.size());
  TEST_ASSERT_TRUE(isAllowed(d.pins, String(hashHex(1).c_str())));
  TEST_ASSERT_FALSE(isAllowed(d.pins, String(hashHex(2).c_str())));
  TEST_ASSERT_TRUE(isAllowed(d.tags, String(hashHex(12).c_str())));
  TEST_ASSERT_FALSE(isAllowed(d.tags, String(hashHex(11).c_str())));
  TEST_ASSERT_EQUAL(0, d.otaVersion.length());
  TEST_ASSERT_EQUAL(json.size(), s.consumed());
}

void test_parses_ota_block() {
  std::string sha(64, 'a');
  std::string json = snapshot("", "", "{\"version\":\"1.0.13\",\"url\":\"https://x/fw.bin\",\"sha256\":\"" + sha + "\"}");
  FakeStream s(json);
  SyncData d = freshData();
  TEST_ASSERT_TRUE(parseSync(s, d));
  TEST_ASSERT_TRUE(d.otaVersion == "1.0.13");
  TEST_ASSERT_TRUE(d.otaUrl == "https://x/fw.bin");
  TEST_ASSERT_TRUE(d.otaSha256 == sha.c_str());
}

void test_key_order_and_whitespace_independent() {
  std::string json =
      "{\n  \"device\" : { \"unlock_ms\" : 1234 },\n  \"tags\" : [ " + tagEntry(hashHex(5), true) +
      " , " + tagEntry(hashHex(6), true) + " ] ,\n  \"ota\" : null ,\n  \"version\" : 42 ,\n"
      "  \"entries\" : [ ] ,\n  \"full\" : true\n}";
  FakeStream s(json);
  SyncData d = freshData();
  TEST_ASSERT_TRUE(parseSync(s, d));
  TEST_ASSERT_EQUAL(42, d.version);
  TEST_ASSERT_EQUAL(1234, d.unlockMs);
  TEST_ASSERT_EQUAL(2, d.tags.size());
  TEST_ASSERT_EQUAL(0, d.pins.size());
}

void test_missing_fields_keep_fallbacks() {
  FakeStream s("{\"entries\":[],\"tags\":[]}");
  SyncData d = freshData();
  d.version = 3;
  TEST_ASSERT_TRUE(parseSync(s, d));
  TEST_ASSERT_EQUAL(3, d.version);
  TEST_ASSERT_EQUAL(800, d.unlockMs);
}

void test_null_version_keeps_fallback() {
  FakeStream s("{\"version\":null,\"entries\":[],\"tags\":[]}");
  SyncData d = freshData();
  d.version = 9;
  TEST_ASSERT_TRUE(parseSync(s, d));
  TEST_ASSERT_EQUAL(9, d.version);
}

void test_entry_without_access_enabled_is_denied() {
  FakeStream s(snapshot("", "{\"hash\":\"" + hashHex(1) + "\"}"));
  SyncData d = freshData();
  TEST_ASSERT_TRUE(parseSync(s, d));
  TEST_ASSERT_EQUAL(0, d.tags.size());
}

void test_invalid_hash_skipped_not_fatal() {
  FakeStream s(snapshot("", tagEntry("deadbeef", true) + "," + tagEntry(hashHex(2), true)));
  SyncData d = freshData();
  TEST_ASSERT_TRUE(parseSync(s, d));
  TEST_ASSERT_EQUAL(1, d.tags.size());
}

// The whole point of the rewrite: thousands of keys (far more than the old
// whole-document parse could fit in ESP32 heap) arriving over a slow socket.
void test_large_snapshot_over_slow_stream() {
  const int N = 5000;
  std::string pins, tags;
  for (int i = 0; i < N; i++) {
    if (i) { pins += ","; tags += ","; }
    pins += pinEntry(hashHex(i), i % 10 != 0);           // every 10th disabled
    tags += tagEntry(hashHex(100000 + i), i % 10 != 0);
  }
  std::string json = snapshot(pins, tags);
  FakeStream s(json, /*burst=*/1460);  // ~one TCP segment per tick
  s.setTimeout(5000);
  SyncData d = freshData();
  TEST_ASSERT_TRUE(parseSync(s, d));
  finalizeKeys(d.pins);
  finalizeKeys(d.tags);
  TEST_ASSERT_EQUAL(N - N / 10, d.pins.size());
  TEST_ASSERT_EQUAL(N - N / 10, d.tags.size());
  TEST_ASSERT_TRUE(isAllowed(d.tags, String(hashHex(100000 + N - 1).c_str())));  // last one, i.e. "newest"
  TEST_ASSERT_FALSE(isAllowed(d.tags, String(hashHex(100000 + 10).c_str())));     // disabled
  TEST_ASSERT_EQUAL(5000, d.unlockMs);
  TEST_ASSERT_EQUAL(json.size(), s.consumed());
}

// ---------- failure paths: must return false (caller keeps the old lists), never hang ----------
void test_truncated_response_fails() {
  std::string json = snapshot(pinEntry(hashHex(1), true), tagEntry(hashHex(2), true));
  for (size_t cut : {(size_t)0, (size_t)1, (size_t)20, json.size() / 2, json.size() - 1}) {
    fakeclock::now() = 0;
    FakeStream s(json.substr(0, cut));
    s.setTimeout(5000);
    SyncData d = freshData();
    TEST_ASSERT_FALSE_MESSAGE(parseSync(s, d), ("cut at " + std::to_string(cut)).c_str());
    TEST_ASSERT_LESS_THAN_UINT32(60000, millis());  // gave up via timeout, didn't spin forever
  }
}

void test_garbage_fails() {
  const char* bad[] = {"[]", "nope", "{\"tags\":{}}", "{\"tags\":[1,2]x}", "{\"version\":1 \"tags\":[]}",
                       "<html>502 Bad Gateway</html>"};
  for (const char* b : bad) {
    fakeclock::now() = 0;
    FakeStream s(b);
    SyncData d = freshData();
    TEST_ASSERT_FALSE_MESSAGE(parseSync(s, d), b);
  }
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_parse_hex_hash);
  RUN_TEST(test_is_allowed_case_insensitive);
  RUN_TEST(test_finalize_sorts_and_dedupes);
  RUN_TEST(test_parses_backend_snapshot);
  RUN_TEST(test_parses_ota_block);
  RUN_TEST(test_key_order_and_whitespace_independent);
  RUN_TEST(test_missing_fields_keep_fallbacks);
  RUN_TEST(test_null_version_keeps_fallback);
  RUN_TEST(test_entry_without_access_enabled_is_denied);
  RUN_TEST(test_invalid_hash_skipped_not_fatal);
  RUN_TEST(test_large_snapshot_over_slow_stream);
  RUN_TEST(test_truncated_response_fails);
  RUN_TEST(test_garbage_fails);
  return UNITY_END();
}
