
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

    // Browser-side ring buffer; no memory allocation changes in audio thread.
    /*
     * Mod-Midi-Monitor-LV2 — event-based browser history store
     * Copyright (C) 2026 tothoseofus
     * SPDX-License-Identifier: GPL-3.0-or-later
     *
     * Standalone module for testing. When integrated into MOD GUI, inline this
     * code within modgui/javascript.js (MOD's JS callback is not an ES module).
     */
    function createMidiHistory(options) {
        'use strict';
        options = options || {};
        var DEFAULT_EVENTS = 10000;
        var DEFAULT_BYTES = 16 * 1024 * 1024;
        var MIN_EVENTS = 100;
        var MAX_EVENTS = 50000;
        var MIN_BYTES = 4 * 1024 * 1024;
        var MAX_BYTES = 64 * 1024 * 1024;
    
        function validLimit(value, min, max, name) {
            if (!Number.isSafeInteger(value) || value < min || value > max) {
                throw new RangeError(name + ' must be an integer between ' + min + ' and ' + max);
            }
            return value;
        }
        var maxEvents = validLimit(options.maxEvents === undefined ? DEFAULT_EVENTS : options.maxEvents,
                                   MIN_EVENTS, MAX_EVENTS, 'maxEvents');
        var maxBytes = validLimit(options.maxBytes === undefined ? DEFAULT_BYTES : options.maxBytes,
                                  MIN_BYTES, MAX_BYTES, 'maxBytes');
    
        // Ring buffer avoids O(n) array.shift/splice on every incoming event.
        // Storage is allocated incrementally only as events arrive.
        var slots = [];
        var head = 0;
        var count = 0;
        var usedBytes = 0;
        var evicted = 0;
        var oversized = 0;
    
        function estimate(event) {
            // Approximation for string data and JS object overhead; NOT physical heap usage.
            var bytes = 128;
            if (typeof event.hex === 'string') bytes += event.hex.length * 2;
            if (typeof event.decoded === 'string') bytes += event.decoded.length * 2;
            if (typeof event.reason === 'string') bytes += event.reason.length * 2;
            if (event.bytes && typeof event.bytes.length === 'number') bytes += event.bytes.length;
            return bytes;
        }
        function at(index) {
            if (index < 0 || index >= count) return null;
            return slots[(head + index) % slots.length].event;
        }
        function popOldest() {
            if (!count) return null;
            var item = slots[head];
            slots[head] = undefined; // release references for GC
            head = (head + 1) % slots.length;
            count--;
            usedBytes -= item.cost;
            evicted++;
            if (!count) { head = 0; slots = []; }
            return item.event;
        }
        function grow() {
            var capacity = slots.length;
            var newCapacity = Math.min(maxEvents, Math.max(64, capacity * 2));
            var grown = new Array(newCapacity);
            for (var i = 0; i < count; i++) grown[i] = slots[(head + i) % capacity];
            slots = grown;
            head = 0;
        }
        function trim() {
            while (count > maxEvents || usedBytes > maxBytes) popOldest();
        }
        function append(event) {
            if (!event || typeof event !== 'object') throw new TypeError('event must be an object');
            var cost = estimate(event);
            if (cost > maxBytes) { oversized++; return false; }
            // No mutation of the input object. Ingested records are assumed immutable.
            if (count === slots.length && slots.length < maxEvents) grow();
            if (count === slots.length) popOldest();
            if (!slots.length) grow();
            slots[(head + count) % slots.length] = { event: event, cost: cost };
            count++;
            usedBytes += cost;
            trim();
            return true;
        }
        function configure(config) {
            config = config || {};
            // Validate both before applying either; failed settings are atomic.
            var nextEvents = validLimit(config.maxEvents === undefined ? maxEvents : config.maxEvents,
                                        MIN_EVENTS, MAX_EVENTS, 'maxEvents');
            var nextBytes = validLimit(config.maxBytes === undefined ? maxBytes : config.maxBytes,
                                       MIN_BYTES, MAX_BYTES, 'maxBytes');
            maxEvents = nextEvents;
            maxBytes = nextBytes;
            trim();
            // Physical ring capacity may temporarily exceed a newly decreased maxEvents.
            // Compact now to avoid retaining unnecessary empty slots.
            if (slots.length > maxEvents) {
                var compact = new Array(Math.max(count, Math.min(64, maxEvents)));
                for (var i = 0; i < count; i++) compact[i] = slots[(head + i) % slots.length];
                slots = compact;
                head = 0;
            }
            return stats();
        }
        function range(start, length) {
            start = Math.max(0, Math.floor(start));
            length = Math.max(0, Math.floor(length));
            var end = Math.min(count, start + length);
            var output = [];
            for (var i = start; i < end; i++) output.push(at(i));
            return output;
        }
        function latest(n) { return range(Math.max(0, count - n), n); }
        function clear() { slots = []; head = 0; count = 0; usedBytes = 0; }
        function stats() {
            return { count: count, estimatedBytes: usedBytes,
                     maxEvents: maxEvents, maxBytes: maxBytes,
                     evicted: evicted, oversized: oversized };
        }
        return { append: append, configure: configure, range: range,
                 latest: latest, at: at, clear: clear, stats: stats };
    }

    var VIEW_LIMIT = 300;

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

            store: createMidiHistory(),
            viewStart: 0,
            following: true,
            newDuringReview: 0,
            droppedDuringReview: 0,
            // Presentation-only filtering. The stored event history is never filtered.
            filters: { noteOn: true, noteOff: true, cc: true, pc: true,
                       bend: true, aftertouch: true, sysex: true,
                       system: true, other: true },
            channelFilter: 0, // 0 = any channel; system/SysEx are channel-less
            displayMode: 'both',
            storeRevision: 0,
            visibleRevision: -1,
            visibleIndices: [],
            filterRevision: 0,
            indexedFilterRevision: -1
        };
    }

    var m = el._midiMonitor;
    var log = find('textarea.probe-log');
    var footer = find('.probe-log-footer');
    var diagnostics = find('.probe-diagnostics');
    var filtersPanel = find('.probe-filters');
    var reviewStatus = find('.probe-review-status');
    var followButton = find('.probe-follow-btn');
    var copyButton = find('.probe-copy-btn');
    var copyStatus = find('.probe-copy-status');
    var clearButton = find('.probe-clear-btn');
    var olderButton = find('.probe-older-btn');
    var newerButton = find('.probe-newer-btn');
    var channelSelect = find('.probe-channel-filter');
    var modeSelect = find('.probe-display-mode');
    var filterInputs = el.querySelectorAll('.probe-filter-checkbox');

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
                ' | Visible: ' + displayedIndices().length +
                ' | Retained: ' + m.store.stats().count +
                ' | Data: ' + (m.store.stats().estimatedBytes / 1048576).toFixed(2) + ' MiB';
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
                    m.droppedDuringReview + ' older events evicted during review';
            } else {
                reviewStatus.textContent =
                    'Reviewing history | ' +
                    m.newDuringReview +
                    ' new events | Showing ' + (displayedIndices().length ? m.viewStart + 1 : 0) +
                    '–' + Math.min(m.viewStart + VIEW_LIMIT, displayedIndices().length);
            }
        }
    }

    // ----------------------------------------
    // Stored event history and presentation-only filtering
    // ----------------------------------------

    function midiCategory(bytes) {
        var status = bytes[0];
        if (status >= 0xF0) return { type: 'system', channel: 0 };
        var channel = (status & 15) + 1;
        var type = status & 0xF0;
        if (type === 0x80 || (type === 0x90 && bytes[2] === 0))
            return { type: 'noteOff', channel: channel };
        if (type === 0x90) return { type: 'noteOn', channel: channel };
        if (type === 0xB0) return { type: 'cc', channel: channel };
        if (type === 0xC0) return { type: 'pc', channel: channel };
        if (type === 0xE0) return { type: 'bend', channel: channel };
        if (type === 0xA0 || type === 0xD0)
            return { type: 'aftertouch', channel: channel };
        return { type: 'other', channel: channel };
    }

    function matchesFilter(entry) {
        var category = entry.type || 'other';
        if (!m.filters[category]) return false;
        return !m.channelFilter || !entry.channel ||
            entry.channel === m.channelFilter;
    }

    function displayedIndices() {
        if (m.visibleRevision === m.storeRevision &&
            m.indexedFilterRevision === m.filterRevision) return m.visibleIndices;
        var result = [];
        var count = m.store.stats().count;
        for (var i = 0; i < count; i++) {
            if (matchesFilter(m.store.at(i))) result.push(i);
        }
        m.visibleIndices = result;
        m.visibleRevision = m.storeRevision;
        m.indexedFilterRevision = m.filterRevision;
        return result;
    }

    function formatEntry(entry) {
        var text = entry.decoded;
        if (m.displayMode === 'both' || !text) return text;
        if (entry.type === 'sysex') {
            return m.displayMode === 'decoded' ? text.split('\n')[0] : text;
        }
        var parts = /^(.*?#\d+\s+)([0-9A-F]{2}(?: [0-9A-F]{2}){0,2})\s+\|\s+(.*)$/.exec(text);
        if (!parts) return text; // Preserve errors and transport diagnostics.
        return parts[1] + (m.displayMode === 'hex' ? parts[2] : parts[3]);
    }

    function addEntry(text, metadata) {
        var before = m.store.stats().evicted;
        var oldest = m.store.at(0);
        var eventRecord = { decoded: String(text), type: 'other', channel: 0 };
        if (metadata) {
            eventRecord.type = metadata.type;
            eventRecord.channel = metadata.channel || 0;
        }
        m.store.append(eventRecord);
        m.storeRevision++;
        var removed = m.store.stats().evicted - before;
        if (!m.following) {
            m.newDuringReview++;
            m.droppedDuringReview += removed;
            // The historical window is addressed in FILTERED event positions.
            if (removed && oldest && matchesFilter(oldest)) {
                m.viewStart = Math.max(0, m.viewStart - 1);
            }
        }
    }

    function addLine(line, metadata) { addEntry(line, metadata); }

    // Windowing applies after filtering, and never modifies the store.
    function historyText(start, count, unfiltered) {
        var result = [];
        if (unfiltered) {
            return m.store.range(start, count).map(function(e) {
                return e.decoded;
            }).join('\n');
        }
        var indexes = displayedIndices();
        var end = Math.min(indexes.length, start + count);
        for (var i = start; i < end; i++) {
            result.push(formatEntry(m.store.at(indexes[i])));
        }
        return result.join('\n');
    }

    function renderLog() {
        if (!log) return;
        var count = displayedIndices().length;
        if (m.following) {
            m.viewStart = Math.max(0, count - VIEW_LIMIT);
        } else {
            m.viewStart = Math.min(m.viewStart, Math.max(0, count - VIEW_LIMIT));
        }
        var value = historyText(m.viewStart, VIEW_LIMIT, false);
        if (!m.following && log.value === value) return;
        var scroll = log.scrollTop;
        var start = log.selectionStart, end = log.selectionEnd;
        log.value = value;
        if (m.following) log.scrollTop = log.scrollHeight;
        else {
            try { log.setSelectionRange(Math.min(start,value.length),Math.min(end,value.length)); }
            catch (err) {}
            log.scrollTop = scroll;
        }
    }

    function filterChanged() {
        m.filterRevision++;
        m.viewStart = 0;
        // Explicit filter changes refresh the view even while reviewing.
        renderLog();
        updateStatus();
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

        renderLog();
        updateStatus();
    }

    // ----------------------------------------
    // Initialise GUI interaction once
    // ----------------------------------------

    if (!el._midiMonitorUIReady) {

        if (diagnostics) {
            // Prevent MOD's pedal drag-handle from intercepting disclosure clicks.
            var disclosure = find('.probe-diagnostics-toggle');
            if (disclosure) {
                disclosure.addEventListener('mousedown', function(e) { e.stopPropagation(); });
                disclosure.addEventListener('click', function(e) { e.stopPropagation(); });
                disclosure.addEventListener('touchstart', function(e) { e.stopPropagation(); }, { passive: true });
            }
            var syncDiagnostics = function() {
                el.classList.toggle('probe-diagnostics-open', diagnostics.open);
            };
            diagnostics.addEventListener('toggle', syncDiagnostics);
            syncDiagnostics();
        }

        if (filtersPanel) {
            // Disclosure click must not initiate a MOD pedal drag.
            var filtersToggle = find('.probe-filters-toggle');
            if (filtersToggle) {
                filtersToggle.addEventListener('mousedown', function(e) { e.stopPropagation(); });
                filtersToggle.addEventListener('click', function(e) { e.stopPropagation(); });
                filtersToggle.addEventListener('touchstart', function(e) { e.stopPropagation(); }, { passive: true });
            }
        }

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
                m.store.clear();
                m.storeRevision++;
                m.viewStart = 0;

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

                    // Copy All always exports every retained event in original V2 format.
                    var text = historyText(0, m.store.stats().count, true);

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
                        renderLog();
                    }

                    // Modern Clipboard API with HTTP fallback.
                    if (navigator.clipboard &&
                        navigator.clipboard.writeText &&
                        window.isSecureContext) {

                        navigator.clipboard.writeText(text).then(
                            function() {
                                showResult(true);
                                renderLog();
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

        function moveWindow(delta) {
            enterReviewMode();
            m.viewStart = Math.max(0, Math.min(
                m.viewStart + delta,
                Math.max(0, displayedIndices().length - VIEW_LIMIT)));
            renderLog();
            updateStatus();
        }
        if (olderButton) {
            olderButton.addEventListener('mousedown', function(e) { e.stopPropagation(); });
            olderButton.addEventListener('click', function(e) {
                e.preventDefault(); e.stopPropagation(); moveWindow(-VIEW_LIMIT);
            });
        }
        if (newerButton) {
            newerButton.addEventListener('mousedown', function(e) { e.stopPropagation(); });
            newerButton.addEventListener('click', function(e) {
                e.preventDefault(); e.stopPropagation(); moveWindow(VIEW_LIMIT);
            });
        }

        // All filter controls operate only on the browser's presentation layer.
        for (var f = 0; f < filterInputs.length; f++) {
            (function(control) {
                control.checked = m.filters[control.value] !== false;
                control.addEventListener('mousedown', function(e) { e.stopPropagation(); });
                control.addEventListener('click', function(e) { e.stopPropagation(); });
                control.addEventListener('change', function(e) {
                    e.stopPropagation();
                    m.filters[control.value] = control.checked;
                    filterChanged();
                });
            })(filterInputs[f]);
        }
        if (channelSelect) {
            channelSelect.value = String(m.channelFilter);
            channelSelect.addEventListener('mousedown', function(e) { e.stopPropagation(); });
            channelSelect.addEventListener('change', function(e) {
                e.stopPropagation();
                m.channelFilter = Number(channelSelect.value);
                filterChanged();
            });
        }
        if (modeSelect) {
            modeSelect.value = m.displayMode;
            modeSelect.addEventListener('mousedown', function(e) { e.stopPropagation(); });
            modeSelect.addEventListener('change', function(e) {
                e.stopPropagation();
                m.displayMode = modeSelect.value;
                renderLog();
                updateStatus();
            });
        }

        el._midiMonitorUIReady = true;
    }

    // ----------------------------------------
    // Versioned Atom/Patch MIDI transport (V1 and V2)
    // ----------------------------------------

    // Timestamps are event times from the LV2 audio clock, not browser arrival.
    // V2 carries integer microseconds elapsed since plugin activation.
    function formatTimestamp(value) {
        if (value === null || value === undefined) return '';
        var us = Number(value);
        if (!Number.isSafeInteger(us) || us < 0) return '';
        var ms = Math.floor(us / 1000);
        var millis = ms % 1000;
        var seconds = Math.floor(ms / 1000) % 60;
        var minutes = Math.floor(ms / 60000) % 60;
        var hours = Math.floor(ms / 3600000);
        function pad(n, width) { return String(n).padStart(width, '0'); }
        return '[' + pad(hours, 2) + ':' + pad(minutes, 2) + ':' +
            pad(seconds, 2) + '.' + pad(millis, 3) + '] ';
    }

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

        var incompleteHeader = formatTimestamp(m.sysex.timestampUs) + '#' + m.sysex.sequence +
            '  SysEx (' + m.sysex.bytes.length + '/' + m.sysex.total +
            ' bytes, incomplete: ' + why + ')';

        var partialHex = [];

        for (var i = 0; i < m.sysex.bytes.length; i++) {
            partialHex.push(hex(m.sysex.bytes[i]));
        }

        addEntry(incompleteHeader + '\n      ' + partialHex.join(' '),
            { type: 'sysex', channel: 0 });

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

        var hasTimes = lines[0] === 'V2';
        if (!hasTimes && lines[0] !== 'V1') {
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
            var timestampUs = null;
            if (hasTimes) {
                if (fields.length < 4 || !/^\d+$/.test(fields[2]) ||
                    !Number.isSafeInteger(Number(fields[2]))) {
                    addLine('! Invalid event timestamp');
                    continue;
                }
                timestampUs = Number(fields[2]);
                fields.splice(2, 1); // Restore V1 field offsets for the existing parser.
            }

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
                    formatTimestamp(timestampUs) + '#' + seq + '  ' + midiHex +
                    '  | ' + decodeMidi(midiHex), midiCategory(midi)
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
                    formatTimestamp(timestampUs) + '! #' + seq +
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
                        timestampUs: timestampUs,
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

                    addEntry(formatTimestamp(m.sysex.timestampUs) + '#' + seq + '  SysEx (' +
                        data.length + ' bytes, complete)\n      ' +
                        hexParts.join(' '), { type: 'sysex', channel: 0 });

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

        if (m.following) renderLog();
        updateStatus();
        return;
    }

    // ----------------------------------------
    // Process monitored LV2 control values
    // ----------------------------------------

    var value = Math.round(Number(event.value));

    if (!Number.isFinite(value)) return;

    if (event.symbol === 'history_events' ||
        event.symbol === 'history_memory_mib') {
        var config = {};
        if (event.symbol === 'history_events') config.maxEvents = value;
        else config.maxBytes = value * 1048576;
        try {
            m.store.configure(config);
            m.storeRevision++;
            renderLog(); updateStatus();
        } catch (err) {
            // Ignore invalid host automation values.
        }
        return;
    }

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
