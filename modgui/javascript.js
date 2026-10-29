
/*
 * Mod-Midi-Monitor-LV2
 * LV2 MIDI event monitor for MOD/MODEP and compatible hosts.
 *
 * Copyright (C) 2026 tothoseofus
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * This program is free software: you can redistribute it
 * and/or modify it under the terms of the GNU General
 * Public License as published by the Free Software
 * Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the LICENSE file for details.
 */

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

            batchEvents: 0,
            transportGaps: 0,
            lastSequence: null,
            repeatedBatches: 0,
            lastBatchText: null,
            sysex: null,
            sysexComplete: 0,
            sysexIncomplete: 0,
            queueDrops: 0,
            unsupported: 0,

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
            footer.textContent =
                'Batch events: ' + m.batchEvents +
                ' | Gaps: ' + m.transportGaps +
                ' | SysEx: ' + m.sysexComplete +
                ' | Incomplete: ' + m.sysexIncomplete +
                ' | Queue drops: ' + m.queueDrops +
                ' | Unsupported: ' + m.unsupported +
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

            // Rolling history in normal mode.
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
                m.batchEvents = 0;
                m.transportGaps = 0;
                m.repeatedBatches = 0;
                m.sysex = null;
                m.sysexComplete = 0;
                m.sysexIncomplete = 0;

                // Resume automatic scrolling.
                m.following = true;
                m.newDuringReview = 0;
                m.droppedDuringReview = 0;

                // Keep m.lastSequence and lastBatchText.
                // Old batches must not be accepted after clearing.

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
    // Versioned Atom/Patch MIDI transport (V1)
    // ----------------------------------------

    function bytesFromHex(value) {
        if (!value ||
            !/^[0-9a-fA-F]{2}( [0-9a-fA-F]{2})*$/.test(value)) {
            return null;
        }

        var parts = value.split(' ');
        var result = [];

        for (var j = 0; j < parts.length; j++) {
            result.push(parseInt(parts[j], 16));
        }

        return result;
    }

    function abortSysEx(why) {
        if (!m.sysex) return;

        addLine(
            '#' + m.sysex.sequence +
            '  SysEx (' +
            m.sysex.bytes.length + '/' +
            m.sysex.total +
            ' bytes, incomplete: ' + why + ')'
        );

        var partialHex = [];

        for (var i = 0; i < m.sysex.bytes.length; i++) {
            partialHex.push(hex(m.sysex.bytes[i]));
        }

        addLine(
            '      ' + partialHex.join(' ')
        );

        m.sysex = null;
        m.sysexIncomplete++;
    }

    function acceptSequence(sequence) {
        if (!Number.isSafeInteger(sequence) || sequence < 1) {
            return false;
        }

        if (m.lastSequence !== null) {
            if (sequence <= m.lastSequence) {
                return false;
            }

            if (sequence > m.lastSequence + 1) {
                var missing = sequence - m.lastSequence - 1;

                m.transportGaps += missing;

                addLine(
                    '! ' + missing +
                    ' MIDI events missing before #' + sequence
                );
            }
        }

        m.lastSequence = sequence;
        m.batchEvents++;
        return true;
    }

    if (event.uri ===
        'https://example.org/pistomp-midi-probe#lastMidi') {

        var batchText = String(event.value || '');

        if (batchText === m.lastBatchText) {
            m.repeatedBatches++;
            return;
        }

        m.lastBatchText = batchText;

        var lines = batchText.split(/\r?\n/);

        if (lines[0] !== 'V1') {
            addLine('! Unknown transport version');
            renderLog();
            updateStatus();
            return;
        }

        var newEvents = 0;

        for (var i = 1; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;

            var fields = line.split(',');

            if (fields.length < 3 ||
                !/^(M|S|X)$/.test(fields[0]) ||
                !/^\d+$/.test(fields[1])) {
                addLine('! Invalid transport record');
                continue;
            }

            var seq = Number(fields[1]);

            if (!Number.isSafeInteger(seq) || seq < 1) {
                addLine('! Invalid MIDI sequence');
                continue;
            }

            if (fields[0] === 'M') {
                if (fields.length !== 3) {
                    addLine('! Invalid M record');
                    continue;
                }

                var midi = bytesFromHex(fields[2]);

                if (!midi ||
                    midi.length < 1 ||
                    midi.length > 3 ||
                    midi[0] < 0x80) {
                    addLine('! Invalid short MIDI record');
                    continue;
                }

                if (m.sysex && seq > m.sysex.sequence) {
                    abortSysEx('new MIDI before completion');
                }

                if (!acceptSequence(seq)) continue;

                newEvents++;

                var midiHex = fields[2].toUpperCase();

                addLine(
                    '#' + seq + '  ' + midiHex +
                    '  | ' + decodeMidi(midiHex)
                );

            } else if (fields[0] === 'X') {
                if (fields.length !== 3 ||
                    !/^\d+$/.test(fields[2])) {
                    continue;
                }

                if (m.sysex && seq > m.sysex.sequence) {
                    abortSysEx('new event before completion');
                }

                if (!acceptSequence(seq)) continue;

                newEvents++;

                addLine(
                    '! #' + seq +
                    ' unsupported MIDI length ' +
                    fields[2] + ' bytes'
                );

            } else {
                if (fields.length !== 5 ||
                    !/^\d+$/.test(fields[2]) ||
                    !/^\d+$/.test(fields[3])) {
                    addLine('! Invalid SysEx chunk metadata');
                    continue;
                }

                var offset = Number(fields[2]);
                var total = Number(fields[3]);
                var chunk = bytesFromHex(fields[4]);

                if (!chunk ||
                    chunk.length < 1 ||
                    chunk.length > 96 ||
                    !Number.isSafeInteger(offset) ||
                    !Number.isSafeInteger(total) ||
                    total < 2 ||
                    total > 65536 ||
                    offset + chunk.length > total) {

                    abortSysEx('invalid chunk');

                    addLine(
                        '! Invalid SysEx chunk #' + seq
                    );

                    continue;
                }

                if (!m.sysex || m.sysex.sequence !== seq) {
                    if (m.sysex) {
                        abortSysEx('interrupted by another SysEx');
                    }

                    if (offset !== 0) {
                        addLine(
                            '! SysEx #' + seq +
                            ' starts at nonzero offset ' +
                            offset
                        );
                        continue;
                    }

                    if (!acceptSequence(seq)) continue;

                    m.sysex = {
                        sequence: seq,
                        total: total,
                        bytes: []
                    };

                    newEvents++;
                }

                if (total !== m.sysex.total ||
                    offset !== m.sysex.bytes.length) {

                    abortSysEx('offset/length mismatch');
                    continue;
                }

                Array.prototype.push.apply(
                    m.sysex.bytes,
                    chunk
                );

                if (m.sysex.bytes.length === total) {
                    var data = m.sysex.bytes;

                    if (data[0] !== 0xF0 ||
                        data[data.length - 1] !== 0xF7) {

                        abortSysEx('missing F0/F7 delimiters');
                        continue;
                    }

                    var hexParts = [];

                    for (var k = 0; k < data.length; k++) {
                        hexParts.push(hex(data[k]));
                    }

                    addLine(
                        '#' + seq +
                        '  SysEx (' +
                        data.length + ' bytes, complete)'
                    );

                    addLine(
                        '      ' + hexParts.join(' ')
                    );

                    m.sysex = null;
                    m.sysexComplete++;
                }
            }
        }

        var atomStatus = find('.probe-atom-status');

        if (atomStatus) {
            atomStatus.textContent =
                newEvents + ' new events | Total: ' +
                m.batchEvents + ' | Gaps: ' +
                m.transportGaps + ' | Replays: ' +
                m.repeatedBatches;
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
        var batchCounter = find('.probe-batch-count');

        if (batchCounter) {
            batchCounter.textContent = String(value);
        }

        return;
    }

    if (event.symbol === 'queue_drops' ||
        event.symbol === 'unsupported') {

        if (event.symbol === 'queue_drops') {
            m.queueDrops = value;
        } else {
            m.unsupported = value;
        }

        updateStatus();
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

    // Numerical ports update the summary only;
    // Atom/Patch owns history.
    updateStatus();
    return;
}
