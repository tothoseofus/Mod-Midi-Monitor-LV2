    
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

    
    // ----------------------------------------
    // Human-readable MIDI decoding
    // ----------------------------------------

    function midiNoteName(note) {
        var names = [
            'C', 'C#', 'D', 'D#', 'E', 'F',
            'F#', 'G', 'G#', 'A', 'A#', 'B'
        ];

        // Middle C (MIDI note 60) is C4.
        return names[note % 12] +
            (Math.floor(note / 12) - 1);
    }

    function midiCCName(cc) {
        var names = {
            0: 'Bank Select MSB',
            1: 'Modulation',
            2: 'Breath Controller',
            4: 'Foot Controller',
            5: 'Portamento Time',
            6: 'Data Entry MSB',
            7: 'Channel Volume',
            8: 'Balance',
            10: 'Pan',
            11: 'Expression',
            32: 'Bank Select LSB',
            64: 'Sustain Pedal',
            65: 'Portamento',
            66: 'Sostenuto',
            67: 'Soft Pedal',
            71: 'Resonance',
            72: 'Release Time',
            73: 'Attack Time',
            74: 'Brightness',
            91: 'Reverb Send',
            93: 'Chorus Send',
            120: 'All Sound Off',
            121: 'Reset Controllers',
            122: 'Local Control',
            123: 'All Notes Off',
            124: 'Omni Off',
            125: 'Omni On',
            126: 'Mono Mode',
            127: 'Poly Mode'
        };

        return names[cc] || ('Controller ' + cc);
    }

    function decodeMidi(hexText) {
        var parts = hexText.trim().split(/\s+/);
        var bytes = [];

        for (var i = 0; i < parts.length; i++) {
            var b = parseInt(parts[i], 16);

            if (!/^[0-9A-Fa-f]{2}$/.test(parts[i]) ||
                !Number.isFinite(b)) {
                return 'Invalid MIDI';
            }

            bytes.push(b);
        }

        if (!bytes.length) return 'Empty MIDI';

        var status = bytes[0];
        var type = status & 0xF0;
        var channel = (status & 0x0F) + 1;
        var d1 = bytes.length > 1 ? bytes[1] : 0;
        var d2 = bytes.length > 2 ? bytes[2] : 0;

        // System messages
        if (status >= 0xF0) {
            var systemNames = {
                0xF1: 'MTC Quarter Frame',
                0xF2: 'Song Position',
                0xF3: 'Song Select',
                0xF6: 'Tune Request',
                0xF8: 'Timing Clock',
                0xFA: 'Start',
                0xFB: 'Continue',
                0xFC: 'Stop',
                0xFE: 'Active Sensing',
                0xFF: 'System Reset'
            };

            if (status === 0xF2 && bytes.length >= 3) {
                return 'Song Position ' +
                    (d1 + (d2 << 7));
            }

            if (status === 0xF3 && bytes.length >= 2) {
                return 'Song Select ' + d1;
            }

            return systemNames[status] ||
                'System ' + hex(status);
        }

        if (status < 0x80) {
            return 'Invalid status';
        }

        // Check channel-message length.
        var needed =
            (type === 0xC0 || type === 0xD0) ? 2 : 3;

        if (bytes.length < needed) {
            return 'Incomplete MIDI';
        }

        var ch = 'Ch ' + channel + '  ';

        switch (type) {
            case 0x80:
                return 'Note Off  ' + ch +
                    midiNoteName(d1) +
                    '(' + d1 + ')' +
                    '  Rel Vel ' + d2;

            case 0x90:
                if (d2 === 0) {
                    return 'Note Off  ' + ch +
                        midiNoteName(d1) +
                        '(' + d1 + ')' +
                        '  Vel 0';
                }

                return 'Note On   ' + ch +
                    midiNoteName(d1) +
                    '(' + d1 + ')' +
                    '  Vel ' + d2;

            case 0xA0:
                return 'Poly Aftertouch  ' + ch +
                    midiNoteName(d1) +
                    '  Pressure ' + d2;

            case 0xB0:
                return 'CC  ' + ch +
                    midiCCName(d1) +
                    ' (' + d1 + ') = ' + d2;

            case 0xC0:
                return 'Program Change  ' + ch +
                    'Program ' + (d1 + 1) +
                    ' (MIDI ' + d1 + ')';

            case 0xD0:
                return 'Channel Aftertouch  ' + ch +
                    'Pressure ' + d1;

            case 0xE0:
                var bend = d1 + (d2 << 7);

                return 'Pitch Bend  ' + ch +
                    (bend === 8192 ? 'Centre' :
                     bend < 8192 ? 'Down' : 'Up') +
                    ' (' + bend + ', ' +
                    (bend - 8192) + ' signed)';

            default:
                return 'Unknown MIDI';
        }
    }


    var NORMAL_LIMIT = 100;
    var REVIEW_LIMIT = 5000;

    // Independent state for each plugin instance.
    if (!el._midiMonitor) {
        el._midiMonitor = {
            count: null,
            status: 0,
            data1: 0,
            data2: 0,

            snapshots: 0,
            skipped: 0,
            batchEvents: 0,
            transportGaps: 0,
            lastSequence: null,
            transportMode: false,
            repeatedBatches: 0,
            lastBatchText: null,

            history: [],
            following: true,
            newDuringReview: 0,
            droppedDuringReview: 0
        };
    }

    var m = el._midiMonitor;
    var log = find('textarea.probe-log');
    var footer = find('.probe-log-footer');
    var reviewStatus = find('.probe-review-status');
    var followButton = find('.probe-follow-btn');
    var copyButton = find('.probe-copy-btn');
    var copyStatus = find('.probe-copy-status');
    var clearButton = find('.probe-clear-btn');

    // ----------------------------------------
    // Status and visual updates
    // ----------------------------------------

    function updateStatus() {
        if (footer) {
            footer.textContent = m.transportMode
                ? 'Batch events: ' + m.batchEvents +
                  ' | Transport gaps: ' + m.transportGaps +
                  ' | Stored lines: ' + m.history.length
                : 'Snapshots: ' + m.snapshots +
                  ' | Skipped: ' + m.skipped +
                  ' | Stored lines: ' + m.history.length;
         }

        if (followButton) {
            if (m.following) {
                followButton.textContent = 'Following Latest';
                followButton.classList.add('following');
            } else {
                followButton.textContent = 'Follow Latest';
                followButton.classList.remove('following');
            }
        }

        if (reviewStatus) {
            if (m.following) {
                reviewStatus.textContent = '';
            } else if (m.droppedDuringReview > 0) {
                reviewStatus.textContent =
                    'History full! ' +
                    m.droppedDuringReview +
                    ' log lines not stored. ' +
                    'Click Follow Latest to resume.';
            } else {
                reviewStatus.textContent =
                    'Reviewing history | ' +
                    m.newDuringReview +
                    ' new log lines';
            }
        }
    }

    // ----------------------------------------
    // History buffer
    // ----------------------------------------

    function addLine(line) {
        if (m.following) {
            m.history.push(line);

            // Rolling history in normal mode<=.
            if (m.history.length > NORMAL_LIMIT) {
                m.history.splice(
                    0,
                    m.history.length - NORMAL_LIMIT
                );
            }
        } else {
            // Protect existing lines during review.
            if (m.history.length < REVIEW_LIMIT) {
                m.history.push(line);
                m.newDuringReview++;
            } else {
                m.droppedDuringReview++;
            }
        }
    }

    // ----------------------------------------
    // Textarea rendering
    // ----------------------------------------

    function renderLog() {
        if (!log) return;

        var text = m.history.join('\n');

        if (m.following) {
            log.value = text;
            log.scrollTop = log.scrollHeight;
            return;
        }

        // Preserve the reader's scroll and selection.
        var oldScroll = log.scrollTop;
        var oldStart = log.selectionStart;
        var oldEnd = log.selectionEnd;
        var oldDirection = log.selectionDirection;

        log.value = text;

        try {
            log.setSelectionRange(
                Math.min(oldStart, text.length),
                Math.min(oldEnd, text.length),
                oldDirection
            );
        } catch (err) {
            // Selection preservation is best effort.
        }

        log.scrollTop = oldScroll;
    }

    // ----------------------------------------
    // Enter review mode
    // ----------------------------------------

    function enterReviewMode() {
        if (!m.following) return;

        m.following = false;
        m.newDuringReview = 0;
        m.droppedDuringReview = 0;

        updateStatus();
    }

    // ----------------------------------------
    // Return to live following
    // ----------------------------------------

    function followLatest() {
        m.following = true;
        m.newDuringReview = 0;
        m.droppedDuringReview = 0;

        // Restore normal rolling history.
        if (m.history.length > NORMAL_LIMIT) {
            m.history = m.history.slice(-NORMAL_LIMIT);
        }

        renderLog();
        updateStatus();
    }

    // ----------------------------------------
    // Initialise GUI interaction once
    // ----------------------------------------

    if (!el._midiMonitorUIReady) {

        if (log) {
            // Clicking inside the history protects it.
            log.addEventListener('mousedown', function(e) {
                e.stopPropagation();
                enterReviewMode();
            });

            // Touchscreen interaction.
            log.addEventListener('touchstart', function(e) {
                e.stopPropagation();
                enterReviewMode();
            }, { passive: true });

            // Mouse-wheel scrolling.
            log.addEventListener('wheel', function(e) {
                e.stopPropagation();
                enterReviewMode();
            }, { passive: true });

            // Keyboard navigation if supported by MODEP.
            log.addEventListener('keydown', function(e) {
                var keys = [
                    'ArrowUp', 'ArrowDown',
                    'PageUp', 'PageDown',
                    'Home', 'End'
                ];

                if (keys.indexOf(e.key) !== -1) {
                    enterReviewMode();
                }
            });
        }

        
        // ----------------------------------------
        // Clear Log button
        // ----------------------------------------

        if (clearButton) {
            clearButton.addEventListener('mousedown', function(e) {
                e.stopPropagation();
            });

            clearButton.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();

                // Remove the displayed and stored history.
                m.history = [];

                // Reset display statistics.
                m.snapshots = 0;
                m.skipped = 0;
                m.batchEvents = 0;
                m.transportGaps = 0;
                m.repeatedBatches = 0;
                m.lastBatchText = null;

                // Resume automatic scrolling.
                m.following = true;
                m.newDuringReview = 0;
                m.droppedDuringReview = 0;

                // IMPORTANT:
                // Keep m.lastSequence unchanged.
                // Otherwise replayed batches could be mistaken
                // for new MIDI messages after clearing the log.

                // Clear the textarea.
                if (log) {
                    log.value = '';
                    log.scrollTop = 0;
                }

                if (copyStatus) {
                    copyStatus.textContent = '';
                }

                var atomStatus = find('.probe-atom-status');
                if (atomStatus) {
                    atomStatus.textContent = 'Log cleared';
                }

                updateStatus();
            });
        }


        // Follow Latest button.
        if (followButton) {
            followButton.addEventListener('mousedown',
                function(e) {
                    e.stopPropagation();
                }
            );

            followButton.addEventListener('click',
                function(e) {
                    e.preventDefault();
                    e.stopPropagation();

                    followLatest();
                }
            );
        }

        // Copy All button.
        if (copyButton && log) {
            copyButton.addEventListener('mousedown',
                function(e) {
                    e.stopPropagation();
                }
            );

            copyButton.addEventListener('click',
                function(e) {
                    e.preventDefault();
                    e.stopPropagation();

                    var text = m.history.join('\n');

                    if (!text) {
                        if (copyStatus) {
                            copyStatus.textContent =
                                'No messages';
                        }
                        return;
                    }

                    function showResult(success) {
                        if (copyStatus) {
                            copyStatus.textContent =
                                success ? 'Copied!' : 'Copy failed';
                        }
                    }

                    // Select all text for legacy copy support.
                    log.value = text;
                    log.focus();
                    log.select();

                    function fallbackCopy() {
                        var success = false;

                        try {
                            success =
                                document.execCommand('copy');
                        } catch (err) {
                            success = false;
                        }

                        showResult(success);
                    }

                    // Modern Clipboard API with HTTP fallback.
                    if (navigator.clipboard &&
                        navigator.clipboard.writeText &&
                        window.isSecureContext) {

                        navigator.clipboard.writeText(text).then(
                            function() {
                                showResult(true);
                            },
                            function() {
                                fallbackCopy();
                            }
                        );
                    } else {
                        fallbackCopy();
                    }
                }
            );
        }

        el._midiMonitorUIReady = true;
    }

    
    // ----------------------------------------
    // Batched Atom/Patch MIDI notifications
    // ----------------------------------------

    if (event.uri ===
        'https://example.org/pistomp-midi-probe#lastMidi') {

        m.transportMode = true;

        var batchText = String(event.value || '');

        // Ignore an identical batch delivered again by MODEP.
        if (batchText === m.lastBatchText) {
            m.repeatedBatches++;

            var atomStatus = find('.probe-atom-status');

            if (atomStatus) {
                atomStatus.textContent =
                    'Total: ' + m.batchEvents +
                    ' | Gaps: ' + m.transportGaps +
                    ' | Repeated batches: ' + m.repeatedBatches;
            }

            return;
        }

        m.lastBatchText = batchText;

        var lines = batchText.split(/\r?\n/);
       
        var validEvents = 0;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;

            // Format: sequence,HEX HEX HEX
            var match = /^(\d+),((?:[0-9A-Fa-f]{2})(?: [0-9A-Fa-f]{2}){0,2})$/.exec(line);

            if (!match) {
                addLine('! Invalid batch record: ' + line);
                continue;
            }

            var sequence = Number(match[1]);
            var midiBytes = match[2].toUpperCase();

            if (m.lastSequence !== null) {
                if (sequence > m.lastSequence + 1) {
                    var missing =
                        sequence - m.lastSequence - 1;

                    m.transportGaps += missing;

                    addLine(
                        '! ' + missing +
                        ' MIDI events missing before #' +
                        sequence
                    );
                } else if (sequence <= m.lastSequence) {
                    // Already processed this sequence number.
                    continue;
                }
            }

            m.lastSequence = sequence;
            m.batchEvents++;
            validEvents++;

            addLine(
                '#' + sequence + '  ' + midiBytes +
                '  | ' + decodeMidi(midiBytes)
            );
        }

        var atomStatus = find('.probe-atom-status');

        if (atomStatus) {
            atomStatus.textContent =
                validEvents + ' new events' +
                ' | Total: ' + m.batchEvents +
                ' | Gaps: ' + m.transportGaps +
                ' | Replays: ' + m.repeatedBatches;
         }

        renderLog();
        updateStatus();

        return;
    }
   
    // ----------------------------------------
    // Process monitored LV2 control values
    // ----------------------------------------

    var value = Math.round(Number(event.value));

    if (!Number.isFinite(value)) return;

    
    // ----------------------------------------
    // Diagnostic: C-side batch count
    // ----------------------------------------

    if (event.symbol === 'batch_count') {

        var batchCounter =
            find('.probe-batch-count');

        if (batchCounter) {
            batchCounter.textContent =
                String(value);
        }

        return;
    }


    // MIDI byte updates.
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

    // Total incoming MIDI event counter.
    var counter = find('.probe-count');

    if (counter) {
        counter.textContent = String(value);
    }

    // Establish baseline on first update.
    if (m.count === null) {
        m.count = value;
        updateStatus();
        return;
    }

    m.count = value;

    // Once native batching is active, don't duplicate events
    // using the old numerical snapshot mechanism.
    if (m.transportMode) {
        updateStatus();
        return;
    }
    
    // ----------------------------------------
    // History is supplied by Atom/Patch only
    // ----------------------------------------

    // Numerical control ports still update the
    // message counter and latest MIDI bytes.
    //
    // They no longer add entries to the history,
    // because Atom/Patch handles that separately.

    return;

}
