
function (event) {
    if (event.type !== 'change') return;

    var root = event.icon || event.settings;
    if (!root) return;

    var el = root.jquery ? root[0] : root;
    if (!el) return;

    var find = function(selector) {
        return el.querySelector(selector);
    };

    var hex = function(v) {
        return ('0' + (v & 255).toString(16).toUpperCase()).slice(-2);
    };

    // One state object per GUI instance
    if (!el._midiMonitor) {
        el._midiMonitor = {
            count: null,
            status: 0,
            data1: 0,
            data2: 0,
            snapshots: 0,
            skipped: 0
        };
    }

    var m = el._midiMonitor;
    var value = Math.round(Number(event.value));

    if (!Number.isFinite(value)) return;

    // Receive individual MIDI byte updates
    if (
        event.symbol === 'status' ||
        event.symbol === 'data1' ||
        event.symbol === 'data2'
    ) {
        m[event.symbol] = value;

        var bytes = find('.probe-bytes');

        if (bytes) {
            bytes.textContent = [
                hex(m.status),
                hex(m.data1),
                hex(m.data2)
            ].join(' ');
        }

        return;
    }

    if (event.symbol !== 'count') return;

    var counter = find('.probe-count');
    if (counter) counter.textContent = String(value);

    // First count establishes a baseline
    if (m.count === null) {
        m.count = value;
        return;
    }

    var difference = value - m.count;
    m.count = value;

    if (difference <= 0) return;

    var log = find('.probe-log');
    if (!log) return;

    // Detect message-count gaps
    if (difference > 1) {
        var skipped = difference - 1;
        m.skipped += skipped;

        var gap = document.createElement('div');
        gap.className =
            'probe-log-line probe-log-gap';

        gap.textContent =
            '... ' + skipped +
            ' intermediate events not displayed';

        log.appendChild(gap);
    }

    // Append latest available MIDI snapshot
    var line = document.createElement('div');
    line.className = 'probe-log-line';

    var bytesText = [
        hex(m.status),
        hex(m.data1),
        hex(m.data2)
    ].join(' ');

    line.textContent =
        '#' + value + '  ' + bytesText;

    log.appendChild(line);
    m.snapshots++;

    // Keep only the most recent 100 log lines
    while (log.children.length > 100) {
        log.removeChild(log.firstChild);
    }

    log.scrollTop = log.scrollHeight;

    var footer = find('.probe-log-footer');
    if (footer) {
        footer.textContent =
            'Snapshots: ' + m.snapshots +
            ' | Skipped: ' + m.skipped;
    }
}
