# PWM Tester

[Open PWM Tester](https://qwertpas.github.io/pwmtester/) in desktop Chrome or Edge.

A static GitHub Pages controller for an ESP32-S3 SuperMini over USB. Based on the original PennyESC PWM tester: 50 Hz, 1000–2000 µs pulses, plus two configurable digital outputs. No server or account is required.

1. Connect the board with a USB data cable.
2. Click **Install on ESP32-S3** once. Close the installer when finished.
3. Click **Connect USB** and select the Espressif USB serial port.
4. Select the GPIOs, pulse width, and both auxiliary levels. Click **Enable outputs**.

The servo pin controls follow connector order: Ground (brown/black), Power (red), Signal (orange/yellow). Default pins: signal 12, power 13 HIGH, ground 11 LOW. Both auxiliaries support HIGH and LOW. GPIOs 1, 2, 4–18 and 21 are supported; match the board's silkscreen. GPIO0/3 are excluded because of boot strapping, GPIO19/20 carry USB, and flash/PSRAM pins are excluded.

Aux outputs are 3.3 V logic GPIOs, **not supply rails**. Use the board's 3V3/GND or a suitable external supply for power. Do not connect an external supply to an auxiliary output. The outputs do not provide regulated power or overcurrent protection.

Outputs start disabled. Stop, disconnect, hiding the tab, and GPIO changes disable outputs. A firmware watchdog disables them after 2 seconds without host communication. Disabled pins are high impedance; HIGH/LOW only applies while enabled. GPIO changes require explicitly enabling outputs again. Assignments are session settings, not stored on the board.

If installation cannot connect, hold BOOT, tap RESET, release BOOT, then retry. Tap RESET after installation if needed. Close other serial monitors; only one process may own the port.

## Development

The site is buildless HTML/CSS/JS in `docs/`. GitHub Pages serves `main:/docs`.

```sh
python3.11 -m http.server 8765 --directory docs
```

The installer is [ESP Web Tools 10.4.0](https://github.com/esphome/esp-web-tools), bundled locally with its notices. To rebuild it:

```sh
npm ci
npm run build
npm run check
```

Firmware uses the shared PlatformIO installation at `~/.platformio/penv/bin/pio`, with the platform pinned in `firmware/platformio.ini`. The ESP32-S3FH4R2 has 4 MB flash and 2 MB PSRAM; this firmware does not require PSRAM.

```sh
python3.11 scripts/build-firmware.py
```

This compiles firmware and merges the bootloader, partition table, boot app and application into `docs/firmware/pwmtester.bin` at flash offset 0, matching the browser installer. To flash the connected board directly (close the site's connection first):

```sh
~/.platformio/penv/bin/python ~/.platformio/packages/tool-esptoolpy/esptool.py \
  --chip esp32s3 --port /dev/cu.usbmodem101 --baud 460800 \
  write-flash 0 docs/firmware/pwmtester.bin
```

## USB protocol

115200 baud, newline-delimited ASCII commands; replies are newline-delimited JSON. Version 1 replies identify `app: "pwmtester"`. Configuration is atomic and all three pins must differ.

- `GET`: read status.
- `SET <pwm> <aux1> <aux2> <pulse_us> <aux1_level> <aux2_level> <enabled>`: validate and apply settings. Levels and enabled are 0 or 1.
- `H`: heartbeat/status. Send every 500 ms while connected.
- `STOP`: immediately disable outputs.

The timer uses 14-bit LEDC resolution at 50 Hz (approximately 1.22 µs per step). The UI preview shows requested timing; it is not an oscilloscope measurement.
