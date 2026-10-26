
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

    // Keep an array of recent message lines
    if (!m.history) {
        m.history = [];
    }

    // Report gaps between GUI updates
    if (difference > 1) {
        var skipped = difference - 1;
        m.skipped += skipped;

        m.history.push(
            '... ' + skipped +
            ' intermediate events not displayed'
        );
    }

    // Append the latest MIDI snapshot
    var bytesText = [
        hex(m.status),
        hex(m.data1),
        hex(m.data2)
    ].join(' ');

    m.history.push('#' + value + '  ' + bytesText);
    m.snapshots++;

    // Retain the most recent 100 lines
    if (m.history.length > 100) {
        m.history = m.history.slice(-100);
    }


var historyText = m.history.join('\n');

// Try both ways of updating the textarea.
log.value = historyText;
log.textContent = historyText;

log.scrollTop = log.scrollHeight;

// Temporary diagnostics
var footer = find('.probe-log-footer');

if (footer) {
    footer.textContent =
        'Snapshots: ' + m.snapshots +
        ' | Skipped: ' + m.skipped +
        ' | Element: ' + log.tagName +
        ' | Length: ' + log.value.length;
}


    var footer = find('.probe-log-footer');
    if (footer) {
        footer.textContent =
            'Snapshots: ' + m.snapshots +
            ' | Skipped: ' + m.skipped;
    }
}
