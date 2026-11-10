# Changelog

All notable changes to **Mod-Midi-Monitor-LV2** are documented here.

Version numbers follow the project’s development milestones. Release dates are omitted where a Git tag date has not yet been established.

## [0.1.0] — Initial feature-complete release

### Added

- **Display-only MIDI message filters:** Note On, Note Off, CC, Program Change, Pitch Bend, Aftertouch, SysEx, System and Other.
- **MIDI channel filter:** All channels or one of channels 1–16. System and SysEx events remain visible when a specific channel is selected.
- **Display modes:** hexadecimal, decoded or both.
- **Collapsible Diagnostics and Display Filters panels**, both closed by default.
- **Flexible MIDI history area** that uses available vertical space within the existing 585px plugin window.

### Changed

- Established the permanent LV2 plugin URI `https://github.com/tothoseofus/Mod-Midi-Monitor-LV2`, including the GUI and Atom/Patch `#lastMidi` identifiers. Older pedalboards using the development placeholder URI must replace the plugin instance.
- Updated project copyright and maintainer attribution to **Ken Spanks**, retaining the GPL-3.0-or-later licence and the `tothoseofus` GitHub repository.
- Treats velocity-zero Note On as Note Off for category filtering.
- Navigates through the visible filtered event set, retaining a 300-event window.
- **Copy All remains unfiltered:** copies all retained events (including full SysEx), irrespective of active display filters or current history page.
- Removed the redundant “Live MIDI event monitor” diagnostics text.
- Diagnostics continue updating when their panel is collapsed; MIDI capture and retention remain unaffected by filter selections.

### Compatibility

- Filtering and layout changes affect only the MOD GUI; the v0.1.0 release also updates plugin/Patch URI constants in C, metadata and JavaScript, and attribution headers. No DSP algorithm changes, LV2 port changes, screenshot/thumbnail changes or build workflow changes.
- Filtering and history behaviour checked with simulated browser tests; layout visually checked in Windows MOD Desktop.
- **Pending release regression checks:** v0.1.0 runtime on piStomp ARM64; Linux x64 runtime (built in CI but not yet verified on a host).

## [0.0.5] — Timestamped history, memory management and desktop builds

### Added

- LV2 history settings: `history_events` (100–50,000; default 10,000) and `history_memory_mib` (4–64 MiB; default 16).
- **Event-based, bounded browser history** with whole-message retention for complete/incomplete SysEx.
- 300-event history window and Older 300 / Newer 300 navigation.
- Sample-frame-derived timestamps displayed as elapsed `HH:MM:SS.mmm` since plugin activation.
- Versioned **V2 Atom/Patch transport**, with V1 browser-side decoder compatibility.
- Windows x64 (`.dll`) and Linux x64 (`.so`) GitHub Actions build targets alongside the existing piStomp ARM64 build.
- Screenshot and thumbnail resources and their MOD GUI TTL declarations. These resolved a Windows MOD Desktop startup crash caused by registering the custom GUI without those image resources in the tested environment.

### Changed

- **Copy All** exports the entire retained history, not only the current display window.
- Oldest complete events are evicted when event-count or estimated-memory limits are reached; settings can be changed during incoming traffic.
- Browser history storage and navigation are separate from the real-time C MIDI transport.

### Validation

- 214 complete 8,192-byte SysEx messages captured under the 16 MiB setting, with zero reported gaps or incomplete events during the measured stream and 500 ms intervals in its continuous section.
- Under a 4 MiB estimate budget, 84 complete 8,192-byte SysEx events retained at about 3.96 MiB.
- Live navigation/eviction capture retained 84 consecutive events (#232–#315), with no missing or duplicate sequence numbers.
- Host-settings persistence tested on piStomp; Windows MOD Desktop full-GUI startup and operation confirmed.
- Memory limit refers to **estimated retained history**, not a hard total JavaScript heap limit.

## [0.0.4] — SysEx support

- Added SysEx capture, 96-byte chunk transport and browser-side reassembly, up to a 65,536-byte implementation limit.
- Added SysEx length/delimiter validation, incomplete-message diagnostics and preservation of message ordering.
- Added queue-drop and unsupported-event diagnostics; improved Atom buffer construction.
- Introduced the V1 versioned MIDI transport format and two-line SysEx presentation.
- Tested 8, 256, 4,096 and 8,192-byte SysEx, including mixed short MIDI traffic.
- Updated plugin display name and **MIDI Utility** category.

## [0.0.3] — Human-readable MIDI interface

- Added decoding for Note On/Off, CC, Program Change, Pitch Bend, polyphonic/channel aftertouch and system messages.
- Added note names and common controller labels.
- Combined raw MIDI hexadecimal bytes with decoded descriptions.
- Refined the MOD GUI layout and styling.

## [0.0.2] — Batched Atom/Patch monitoring

- Introduced native LV2 Atom/Patch event transport with bounded FIFO and batched notifications.
- Added sequence numbering, missing-event detection, replay diagnostics and C-side batch counters.
- Added Copy All, Clear Log, Follow Latest and improved history scrolling/selection.
- Corrected empty Atom output-buffer handling that had caused repeated notifications.

## [0.0.1] — Proof of concept

- First LV2 MIDI-input monitor with numerical event count and latest MIDI bytes.
- Initial MOD/MODEP custom interface and basic event display.

---

The initial release is intended for diagnostic use. Host delivery, buffer limits and MIDI bypass behaviour can affect the events reported; successful testing under specific workloads does not guarantee lossless delivery under every configuration.
