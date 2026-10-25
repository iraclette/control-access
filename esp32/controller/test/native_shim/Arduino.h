#pragma once
// Minimal host-side stand-in for the bits of the Arduino core that src/sync_parser.h
// (and ArduinoJson's Stream reader) use. Time is a fake clock that only moves when
// delay() is called, so timeout paths run instantly and deterministically.

#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <string>

namespace fakeclock {
inline uint32_t &now() { static uint32_t t = 0; return t; }
}

inline uint32_t millis() { return fakeclock::now(); }
inline void delay(uint32_t ms) { fakeclock::now() += ms; }

class String {
 public:
  String() {}
  String(const char* s) : s_(s ? s : "") {}
  String(const std::string &s) : s_(s) {}

  const char* c_str() const { return s_.c_str(); }
  unsigned int length() const { return s_.size(); }
  long toInt() const { return atol(s_.c_str()); }

  String &operator+=(char c) { s_ += c; return *this; }
  bool operator==(const char* o) const { return s_ == o; }
  bool operator!=(const char* o) const { return s_ != o; }
  bool operator==(const String &o) const { return s_ == o.s_; }

 private:
  std::string s_;
};

// ArduinoJson's Stream support also references these (Printable -> JSON converter).
class Print {
 public:
  virtual ~Print() {}
  virtual size_t write(uint8_t c) = 0;
  virtual size_t write(const uint8_t* buf, size_t n) {
    size_t i = 0;
    while (i < n && write(buf[i])) i++;
    return i;
  }
};

class Printable {
 public:
  virtual ~Printable() {}
  virtual size_t printTo(Print &p) const = 0;
};

class Stream {
 public:
  virtual ~Stream() {}
  virtual int available() = 0;
  virtual int read() = 0;
  virtual int peek() = 0;

  void setTimeout(unsigned long ms) { timeout_ = ms; }

  size_t readBytes(char* buf, size_t len) {
    size_t n = 0;
    while (n < len) {
      int c = timedRead();
      if (c < 0) break;
      buf[n++] = (char)c;
    }
    return n;
  }

  String readStringUntil(char terminator) {
    String out;
    for (;;) {
      int c = timedRead();
      if (c < 0 || c == terminator) return out;
      out += (char)c;
    }
  }

 protected:
  int timedRead() {
    uint32_t start = millis();
    do {
      int c = read();
      if (c >= 0) return c;
      delay(1);
    } while (millis() - start < timeout_);
    return -1;
  }

  unsigned long timeout_ = 1000;
};
