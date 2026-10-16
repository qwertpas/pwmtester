#include <Arduino.h>

constexpr uint32_t frequency = 50;
constexpr uint8_t resolution = 14;
constexpr uint32_t timeoutMs = 2000;
int pwm = 12, powerPin = 13, groundPin = 11;
int pulse = 1500, powerLevel = 1, groundLevel = 0;
bool enabled = false;
uint32_t lastSeen = 0;
String line;
bool overflow = false;

bool validPin(int pin) {
    return pin == 1 || pin == 2 || (pin >= 4 && pin <= 18) || pin == 21;
}

void stop() {
    if (enabled) {
        ledcWrite(pwm, 0);
        ledcDetach(pwm);
    }
    for (int pin : {pwm, powerPin, groundPin}) {
        pinMode(pin, INPUT);
    }
    enabled = false;
}

void status() {
    Serial.printf("{\"app\":\"pwmtester\",\"version\":1,\"enabled\":%s,"
                  "\"pwm\":%d,\"power\":%d,\"ground\":%d,\"pulse\":%d,"
                  "\"powerLevel\":%d,\"groundLevel\":%d,\"frequency\":50}\n",
                  enabled ? "true" : "false", pwm, powerPin, groundPin,
                  pulse, powerLevel, groundLevel);
}

void handle(const char *text) {
    if (!strcmp(text, "GET")) {
        status();
        return;
    }
    if (!strcmp(text, "H")) {
        lastSeen = millis();
        status();
        return;
    }
    if (!strcmp(text, "STOP")) {
        stop();
        status();
        return;
    }
    int p, a, b, us, highA, highB, on, end = 0;
    const int count = sscanf(text, "SET %d %d %d %d %d %d %d%n",
                             &p, &a, &b, &us, &highA, &highB, &on, &end);
    if (count != 7 || text[end] != '\0' || !validPin(p) || !validPin(a) ||
        !validPin(b) || p == a || p == b || a == b || us < 1000 || us > 2000 ||
        (highA != 0 && highA != 1) || (highB != 0 && highB != 1) ||
        (on != 0 && on != 1)) {
        Serial.println("{\"error\":\"Invalid settings. Use three different supported GPIOs and 1000–2000 us.\"}");
        return;
    }
    // Detach old outputs before applying new pins or disabling the signal.
    if (enabled && (!on || pwm != p || powerPin != a || groundPin != b)) stop();
    pwm = p; powerPin = a; groundPin = b;
    pulse = us; powerLevel = highA; groundLevel = highB;
    if (on) {
        if (!enabled && !ledcAttach(pwm, frequency, resolution)) {
            stop();
            Serial.println("{\"error\":\"PWM timer setup failed.\"}");
            return;
        }
        ledcWrite(pwm, (uint32_t(pulse) * ((1U << resolution) - 1U) + 10000) / 20000);
        digitalWrite(powerPin, powerLevel);
        digitalWrite(groundPin, groundLevel);
        pinMode(powerPin, OUTPUT);
        pinMode(groundPin, OUTPUT);
        enabled = true;
    } else {
        stop();
    }
    lastSeen = millis();
    status();
}

void setup() {
    Serial.begin(115200);
    line.reserve(96);
}

void loop() {
    if (enabled && millis() - lastSeen > timeoutMs) {
        stop();
        status();
    }
    while (Serial.available()) {
        char ch = char(Serial.read());
        if (ch == '\n') {
            if (overflow) Serial.println("{\"error\":\"Command too long.\"}");
            else if (line.length()) handle(line.c_str());
            line = "";
            overflow = false;
        } else if (ch != '\r' && !overflow) {
            if (line.length() < 95) line += ch;
            else overflow = true;
        }
    }
    delay(1);
}
