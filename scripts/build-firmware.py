#!/usr/bin/env python3.11
"""Build and merge the ESP32-S3 firmware using the shared PlatformIO Core."""
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
core = Path.home() / '.platformio/penv/bin'
subprocess.run([str(core / 'pio'), 'run', '-d', str(root / 'firmware')], check=True)
packages = Path.home() / '.platformio/packages'
framework = packages / 'framework-arduinoespressif32'
esptool = packages / 'tool-esptoolpy'
build = root / 'firmware/.pio/build/supermini'
subprocess.run([
    str(core / 'python'), str(esptool / 'esptool.py'), '--chip', 'esp32s3', 'merge-bin',
    '-o', str(root / 'docs/firmware/pwmtester.bin'),
    '--flash-mode', 'dio', '--flash-freq', '80m', '--flash-size', '4MB',
    '0x0', str(build / 'bootloader.bin'), '0x8000', str(build / 'partitions.bin'),
    '0xe000', str(framework / 'tools/partitions/boot_app0.bin'),
    '0x10000', str(build / 'firmware.bin'),
], check=True)
