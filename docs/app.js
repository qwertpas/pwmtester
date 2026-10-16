const $ = (id) => document.getElementById(id);
const pins = [1, 2, ...Array.from({ length: 15 }, (_, i) => i + 4), 21];
for (const [id, initial] of [['pwm', 12], ['power', 13], ['ground', 11]]) {
  $(id).replaceChildren(...pins.map((pin) => new Option(`GPIO ${pin}`, pin)));
  $(id).value = initial;
}
let port, reader, writer, reading, heartbeat, waiting;
let connected = false, opening = false, closing = false, active = false;
let sending = false, pending = null, desired = false;
const supported = 'serial' in navigator && window.isSecureContext;

function message(text, error = false) {
  $('message').textContent = error ? text : '';
  $('message').hidden = !error;
  $('message').classList.toggle('error', error);
}
function validPins() {
  const valid = new Set(['pwm', 'power', 'ground'].map((id) => $(id).value)).size === 3;
  $('pin-error').hidden = valid;
  return valid;
}
function render() {
  $('connect').textContent = opening ? 'Connecting…' : connected ? 'Disconnect' : 'Connect USB';
  $('connect').disabled = !supported || opening || closing || !!document.querySelector('ewt-install-dialog');
  $('connection').textContent = connected ? 'Connected · ESP32-S3' : opening ? 'Connecting…' : 'Disconnected';
  $('dot').classList.toggle('connected', connected);
  $('enable').disabled = !connected || active || !validPins() || closing;
  $('stop').disabled = !connected || closing;
  $('install').disabled = connected || opening || closing;
  $('output-state').textContent = active ? 'Outputs on' : 'Outputs off';
}
function preview(value) {
  $('pulse').value = value;
  $('pulse-number').value = value;
  $('pulse-value').value = value;
  $('duty').textContent = `${(value / 200).toFixed(2)}% duty`;
  const x = 30 + value * 600 / 20000;
  $('wave').setAttribute('d', `M0 83H30V23H${x}V83H630V23H660`);
  $('wave-title').textContent = `Pulse preview: ${value} microseconds in a 20 millisecond period`;
}
function settings(on = desired) {
  return `SET ${$('pwm').value} ${$('power').value} ${$('ground').value} ${$('pulse').value} ${$('power-level').value} ${$('ground-level').value} ${Number(on)}`;
}
function receive(text) {
  let data;
  try { data = JSON.parse(text); } catch { return; }
  if (!data.error && (data.app !== 'pwmtester' || data.version !== 1)) return;
  if (!data.error) {
    active = data.enabled;
    if (!active && (!waiting || waiting.command === "H")) { desired = false; pending = null; }
    render();
  }
  if (waiting) {
    const { resolve, reject, timer } = waiting;
    waiting = null;
    clearTimeout(timer);
    data.error ? reject(new Error(data.error)) : resolve(data);
  }
}
async function read() {
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        receive(buffer.slice(0, end).trim());
        buffer = buffer.slice(end + 1);
      }
      if (buffer.length > 4096) buffer = '';
    }
  } catch (error) {
    if (!closing) message(`USB disconnected: ${error.message}`, true);
  } finally {
    reader.releaseLock();
    if (waiting) {
      clearTimeout(waiting.timer);
      waiting.reject(new Error('Serial connection ended.'));
      waiting = null;
    }
    if (!closing) void disconnect(false);
  }
}
async function request(command) {
  const response = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting = null;
      reject(new Error('Board did not respond. Install PWM Tester firmware, then reconnect.'));
    }, 1800);
    waiting = { resolve, reject, timer, command };
  });
  try {
    await writer.write(new TextEncoder().encode(`${command}\n`));
  } catch (error) {
    clearTimeout(waiting?.timer);
    waiting?.reject(error);
    waiting = null;
  }
  return response;
}
async function send(command) {
  pending = command;
  if (sending || !connected || closing) return;
  sending = true;
  try {
    while (pending && connected && !closing) {
      const next = pending;
      pending = null;
      await request(next);
    }
  } catch (error) {
    message(error.message, true);
    void disconnect(false);
  } finally { sending = false; }
}
async function connect() {
  opening = true;
  render();
  try {
    // requestPort must remain in the user's click gesture.
    port = await navigator.serial.requestPort({ filters: [{ usbVendorId: 0x303a }] });
    await port.open({ baudRate: 115200 });
    writer = port.writable.getWriter();
    reader = port.readable.getReader();
    reading = read();
    await request('STOP');
    connected = true;
    await send(settings(false));
    if (!connected) return;
    heartbeat = setInterval(() => {
      if (connected && !sending && !pending && !closing) void send('H');
    }, 500);
    message('Connected. Choose your GPIOs and enable outputs when ready.');
  } catch (error) {
    if (error.name === 'NotFoundError') message('No USB port selected.');
    else message(error.message, true);
    await disconnect(false);
  } finally { opening = false; render(); }
}
async function disconnect(stop = true) {
  if (closing) return;
  closing = true;
  clearInterval(heartbeat);
  pending = null;
  render();
  // Send STOP after any outstanding command; the firmware watchdog also stops
  // outputs if a USB failure prevents this final write.
  if (writer && stop) {
    try { await writer.write(new TextEncoder().encode('STOP\n')); } catch { /* Port already lost. */ }
  }
  connected = false;
  active = desired = false;
  if (reader) {
    try { await reader.cancel(); await reading; } catch { /* Port already lost. */ }
  }
  if (writer) writer.releaseLock();
  if (port?.readable || port?.writable) {
    try { await port.close(); } catch (error) { message(`USB close failed: ${error.message}`, true); }
  }
  port = reader = writer = reading = null;
  closing = false;
  render();
}
$('connect').addEventListener('click', async () => {
  if (connected) { await disconnect(); message('Disconnected. Outputs off.'); }
  else await connect();
});
$('pulse').addEventListener('input', () => {
  preview(Number($('pulse').value));
  if (validPins()) void send(settings());
});
$('pulse-number').addEventListener('change', () => {
  const value = $('pulse-number').valueAsNumber;
  if (!$('pulse-number').checkValidity() || !Number.isInteger(value)) {
    $('pulse-number').reportValidity();
    return;
  }
  preview(value);
  if (validPins()) void send(settings());
});
$('center').addEventListener('click', () => {
  preview(1500);
  if (validPins()) void send(settings());
});
for (const id of ['pwm', 'power', 'ground']) {
  $(id).addEventListener('change', () => {
    desired = false;
    const valid = validPins();
    if (connected) void send(valid ? settings(false) : 'STOP');
    message('GPIO assignment changed. Outputs off.');
    render();
  });
}
for (const id of ['power-level', 'ground-level']) {
  $(id).addEventListener('change', () => { if (validPins()) void send(settings()); });
}
$('enable').addEventListener('click', () => {
  if (validPins()) { desired = true; void send(settings(true)); }
});
$('stop').addEventListener('click', () => { desired = false; void send('STOP'); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && connected) { desired = false; void send('STOP'); }
});
window.addEventListener('pagehide', () => {
  if (writer) void writer.write(new TextEncoder().encode('STOP\n')).catch(() => {});
});
// The installer owns its serial port until its dialog closes.
new MutationObserver(render).observe(document.body, { childList: true });
preview(1500);
render();
if (!supported) message('USB control requires desktop Chrome or Edge, over HTTPS or localhost.', true);
