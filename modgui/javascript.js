
function (event) {
    if (event.type !== 'change') return;

    var root = event.icon || event.settings;
    if (!root) return;

    var el = root.jquery ? root[0] : root;
    if (!el) return;

    // Initialise Copy All button once per GUI instance.
    if (!el._midiCopyReady) {
        var copyButton = el.querySelector('.probe-copy-btn');
        var textarea = el.querySelector('textarea.probe-log');
        var copyStatus = el.querySelector('.probe-copy-status');

        if (copyButton && textarea) {
            copyButton.addEventListener('mousedown', function(e) {
                e.stopPropagation();
            });

            copyButton.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();

                // Copy the latest stored history, even if the
                // textarea display has been paused while focused.
                var state = el._midiMonitor;
                var text = state && state.history
                    ? state.history.join('\n')
                    : textarea.value;

                if (!text) {
                    if (copyStatus) {
                        copyStatus.textContent = 'No messages';
                    }
                    return;
                }

                // Update and select the complete log.
                textarea.value = text;
                textarea.focus();
                textarea.select();

                function fallbackCopy() {
                    var success = false;

                    try {
                        success = document.execCommand('copy');
                    } catch (err) {
                        success = false;
                    }

                    if (copyStatus) {
                        copyStatus.textContent =
                            success ? 'Copied!' : 'Copy failed';
                    }
                }

                // Prefer the modern Clipboard API where available.
                // Fall back to execCommand for HTTP-based MODEP.
                if (navigator.clipboard &&
                    navigator.clipboard.writeText &&
                    window.isSecureContext) {

                    navigator.clipboard.writeText(text).then(
                        function() {
                            if (copyStatus) {
                                copyStatus.textContent = 'Copied!';
                            }
                        },
                        function() {
                            fallbackCopy();
                        }
                    );
                } else {
                    fallbackCopy();
                }
            });

            el._midiCopyReady = true;
        }
    }

    var find = function(selector) {
        return el.querySelector(selector);
    };

    var hex = function(v) {
        return ('0' + (v & 255).toString(16).toUpperCase()).slice(-2);
    };

    // Maintain independent state for each plugin GUI instance.
    if (!el._midiMonitor) {
        el._midiMonitor = {
            count: null,
            status: 0,
            data1: 0,
            data2: 0,
            snapshots: 0,
            skipped: 0,
            history: []
        };
    }

    var m = el._midiMonitor;
    var value = Math.round(Number(event.value));

    if (!Number.isFinite(value)) return;

    // Process incoming MIDI byte control updates.
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

    // Update total MIDI message counter.
    var counter = find('.probe-count');
    if (counter) {
        counter.textContent = String(value);
    }

    // Establish the initial message count.
    if (m.count === null) {
        m.count = value;
        return;
    }

    var difference = value - m.count;
    m.count = value;

    if (difference <= 0) return;

    var log = find('textarea.probe-log');
    if (!log) return;

    // Identify intermediate messages not individually displayed.
    if (difference > 1) {
        var skipped = difference - 1;
        m.skipped += skipped;

        m.history.push(
            '... ' + skipped +
            ' intermediate events not displayed'
        );
    }

    // Store the latest MIDI message snapshot.
    var bytesText = [
        hex(m.status),
        hex(m.data1),
        hex(m.data2)
    ].join(' ');

    m.history.push('#' + value + '  ' + bytesText);
    m.snapshots++;

    // Retain the latest 100 lines.
    if (m.history.length > 100) {
        m.history = m.history.slice(-100);
    }

    // Update the display only when the textarea is not focused.
    // This prevents incoming MIDI events from interrupting selection.
    if (document.activeElement !== log) {
        log.value = m.history.join('\n');
        log.scrollTop = log.scrollHeight;
    }

    // Update the status footer.
    var footer = find('.probe-log-footer');

    if (footer) {
        footer.textContent =
            'Snapshots: ' + m.snapshots +
            ' | Skipped: ' + m.skipped;
    }
}
