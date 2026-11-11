# Mod-Midi-Monitor-LV2

**A MIDI event and SysEx monitor for LV2 hosts, developed and tested on piStomp v3 running MODEP.**

**Current version:** `v0.1.0`

**Status:** Feature-complete initial release candidate. The core has been tested on piStomp v3/MODEP and Windows MOD Desktop; the latest filtering/collapsible GUI has been visually tested in Windows MOD Desktop. Linux x64 builds are available but have not been runtime-tested.

Mod-Midi-Monitor-LV2 provides a visual monitor for incoming MIDI messages, including System Exclusive (SysEx) messages. It captures MIDI events through an LV2 input port and displays them in a scrolling history within the MOD/MODEP custom plugin interface.

Unlike conventional LV2 control-port monitoring, which can miss intermediate events, this plugin uses **batched LV2 Atom/Patch notifications** to transfer MIDI events from the plugin to the browser interface.

The project is intended as a diagnostic and development tool for MIDI devices, software instruments, MIDI generators, controllers, configuration messages and audio-to-MIDI applications.

The plugin appears as **piStomp MIDI Monitor**, under the **MIDI Utility** category. The application has no MIDI output: connect the same MIDI source to other effects in parallel if required.

## Features

### MIDI Monitoring

- One MIDI input port.
- No MIDI output or audio ports.
- Captures incoming MIDI events without modifying or forwarding them.
- Displays raw MIDI messages in hexadecimal notation.
- Provides human-readable decoding of common MIDI messages.
- Lets you filter the visible log by message type or MIDI channel and switch between hexadecimal, decoded and combined views.
- Supports complete SysEx messages, including large data dumps.
- Maintains a configurable, bounded, event-based MIDI history (100–50,000 events and an estimated 4–64 MiB memory budget).
- Includes sample-position-derived timestamps relative to plugin activation.
- Assigns sequential numbers to incoming events.
- Detects missing event sequences.
- Handles bursts of multiple MIDI messages.
- Provides diagnostics for queue overflow and unsupported events.

### Human-Readable MIDI Display

The monitor decodes the following MIDI message categories:

- Note On and Note Off.
- Control Change (CC), including names for common controllers.
- Program Change (PC).
- Pitch Bend, including the 14-bit value and signed offset.
- Polyphonic Key Pressure (Polyphonic Aftertouch).
- Channel Pressure (Channel Aftertouch).
- Common MIDI system messages.
- System Exclusive (SysEx).

Note messages include both their musical note name and MIDI note number. Middle C (MIDI note 60) is displayed as C4.

For example:

```text
[00:00:12.000] #145  90 3C 64  | Note On   Ch 1  C4(60)  Vel 100
[00:00:12.050] #146  80 3C 40  | Note Off  Ch 1  C4(60)  Rel Vel 64
[00:00:12.100] #147  B0 01 7F  | CC  Ch 1  Modulation (1) = 127
[00:00:12.150] #148  C1 09     | Program Change  Ch 2  Program 10
[00:00:12.200] #149  E0 00 40  | Pitch Bend  Ch 1  Centre (8192)
[00:00:12.250] #150  BF 7B 00  | CC  Ch 16  All Notes Off (123) = 0
```

The original hexadecimal bytes are retained alongside their decoded meaning.

### System Exclusive (SysEx) Support

Version 0.0.4 introduced **variable-length SysEx capture and reassembly**, retained in v0.0.5.

The monitor supports:

- SysEx messages with a maximum supported size of 65,536 bytes.
- Chunked transport of SysEx data through LV2 Atom/Patch notifications.
- Browser-side reassembly of complete messages.
- Validation of chunk lengths and offsets.
- Validation of SysEx start (`F0`) and end (`F7`) bytes.
- Detection and reporting of incomplete messages.
- Full hexadecimal output of successfully reconstructed messages.
- Preservation of message ordering relative to Note, CC and other MIDI events.

SysEx messages are displayed across two lines.

For example:

```text
[00:00:16.000] #220  90 3C 64  | Note On  Ch 1  C4(60)  Vel 100
[00:00:16.100] #221  SysEx (256 bytes, complete)
      F0 7D 55 05 1F 44 69 0E 33 58 ... F7
[00:00:16.200] #222  B0 01 40  | CC  Ch 1  Modulation (1) = 64
[00:00:16.300] #223  80 3C 40  | Note Off  Ch 1  C4(60)  Rel Vel 64
```

The ellipsis in this example is illustrative. **The actual monitor displays every byte**, allowing the complete message to be copied and examined.

For incomplete SysEx messages, the monitor reports the number of bytes received, the expected length where known, and the reason reassembly could not be completed.

The 65,536-byte limit is an implementation limit, not a guarantee that every LV2 host can deliver a SysEx message of that size. Actual message capacity also depends on host buffers and available transport resources.

### Display filters and modes (v0.1.0)

The **Display Filters** panel is collapsed by default. Open it to choose which messages appear in the history window:

- **Message types:** Note On, Note Off, Control Change (CC), Program Change (PC), Pitch Bend, Aftertouch, SysEx, System, and Other.
- **Channel:** All or one of channels 1–16. Channel-less messages such as SysEx and system messages are not excluded by the channel selection.
- **Format:** **Both** (hexadecimal and decoded short MIDI), **Hex** or **Decoded**. SysEx remains represented by its summary and data, since there is no general semantic decoder for arbitrary manufacturer payloads.

A Note On message with velocity zero is treated as Note Off for filtering purposes. Both polyphonic key pressure and channel pressure are included under **Aftertouch**.

**Filters affect display only.** All accepted events are still stored (until an event-count or memory-limit eviction), regardless of the filter settings. Switching a filter can reveal previously hidden retained events. The **Older 300 / Newer 300** navigation applies to matching events; **Copy All** deliberately exports the **complete unfiltered retained history**, not just visible matches and not just the current page.

### MIDI History Interface

The MOD/MODEP GUI retains **whole MIDI events**, rather than independent display lines. Every complete or incomplete SysEx occupies one history record even though its summary and hex payload appear on separate lines. This prevents a rolling-history eviction from retaining half a SysEx entry.

The interface provides:

- A scrolling, timestamped event history with hexadecimal bytes and decoded short MIDI messages.
- **Following Latest** to keep the newest entries visible, and a review mode to preserve the current displayed text while new traffic arrives.
- **Older 300** and **Newer 300** buttons for navigating a window of at most **300 events**.
- **Copy All**, which copies **every retained event**, not merely the currently displayed 300-event window. Both modern clipboard and legacy browser-copy paths are supported.
- **Clear Log**, which clears browser-side history and its statistics, not the running C plugin's lifetime counters.
- Live message count, latest MIDI bytes, and Atom/Patch transport diagnostics.
- Independently collapsible **Diagnostics** and **Display Filters** panels (both collapsed by default).
- Automatically expanding/shrinking history textarea when either panel opens or closes, within the same **585px** plugin height.

**Diagnostics** collects last MIDI bytes, Atom/Patch status, C-side batch counts, and history/transport counters. These values continue updating while the section is collapsed. The message count remains visible above the collapsible panels. The **MIDI MESSAGE HISTORY** window takes the unused vertical space, and the Copy All, Clear Log, Follow Latest and navigation controls remain below it.

### History limits (introduced in v0.0.5)

Two standard LV2 **input control ports** appear in the host plugin settings:

| Port | Symbol | Range | Default |
|---|---|---|---|
| 9 — History Events | `history_events` | 100–50,000 events | 10,000 |
| 10 — History Memory (MiB) | `history_memory_mib` | 4–64 MiB | 16 MiB |

The browser JavaScript manages these settings, retention and eviction; the C audio thread does **not** allocate memory proportional to these values. If either limit is exceeded, the oldest complete event records are discarded first. Lowering limits applies to already retained history; raising them does not recover previously discarded entries.

**The MiB budget is an estimate** of retained payload data and JavaScript bookkeeping, *not* a hard ceiling on total browser memory or JavaScript engine heap consumption. A 4 MiB history limit typically retains fewer than 100 complete 8 KiB SysEx messages because hexadecimal text and record overhead are included.

Reviewing a scrolled log does **not** stop event capture or history eviction. The visible text can remain unchanged until navigating/refreshing, at which point records that have already expired disappear from the view. That is expected and is distinct from a transport sequence gap.

Host settings persistence has been tested on piStomp, including pedalboard changes, reboot, and separate plugin instances. The history itself remains in browser memory and is **not persisted** to disk.

## How It Works

The plugin uses two complementary mechanisms.

### 1. Numerical LV2 Control Outputs

Numerical control outputs provide:

- Total MIDI event count.
- Latest status byte.
- Latest data byte 1.
- Latest data byte 2.
- Number of C-side Atom/Patch batches emitted.
- Queue-drop count.
- Unsupported-event count.

These outputs provide diagnostic information but are not used to construct the event-by-event history.

MODEP may monitor numerical output controls at a lower frequency than incoming MIDI events, so their displayed values can lag behind the actual processing state.

During testing, numerical counters occasionally appeared to freeze temporarily when MIDI connections were changed. The counters subsequently caught up, while the Atom/Patch history continued updating normally.

### 2. Native LV2 Atom/Patch Transport

The primary MIDI history uses an LV2 Atom output port.

Incoming MIDI events are assigned sequence numbers and placed into bounded transport storage.

The C plugin packages events into `patch:Set` notifications containing an `atom:String`.

MODEP forwards these notifications to the custom JavaScript interface, which validates, decodes and displays the received events.

#### Transport implementation

| Parameter | Value |
|---|---|
| Transport protocol | Versioned **V2**, with V1 browser decoding compatibility |
| Transport mechanism | LV2 Atom/Patch |
| Queue capacity | 1,024 transport records |
| Short MIDI message length | 1–3 bytes |
| SysEx chunk payload | Up to 96 bytes |
| Maximum supported SysEx message | 65,536 bytes |
| Atom output buffer minimum requested | 4,096 bytes |
| Browser interface | MOD/MODEP custom JavaScript |
| Timestamps | Sample-position-derived, transmitted as integer microseconds |
| History retention | Browser-managed, up to 50,000 complete events and estimated 64 MiB |
| Visible history window | Up to 300 events matching the active display filters |

The C implementation uses bounded memory and avoids dynamic memory allocation in the real-time processing callback.

Large SysEx messages are divided into transport chunks and reassembled by JavaScript.

Each SysEx message receives one MIDI event sequence number, regardless of how many transport chunks are needed.

### Versioned Transport Records

v0.0.5 uses transport protocol **V2**. Each message carries a MIDI event sequence and an integer timestamp in **microseconds**, derived from the host's audio sample frames. For example:

```text
V2
M,145,12000000,90 3C 64
M,146,12050000,80 3C 40
```

SysEx data is transported in 96-byte chunks using one event sequence number and one timestamp for every chunk of the same incoming SysEx event:

```text
V2
S,147,12100000,0,8,F0 7D 01 02
S,147,12100000,4,8,03 04 05 F7
```

The browser reconstructs the original eight-byte SysEx and displays it as one timestamped event. The `X` transport record represents unsupported/unrepresentable messages. The browser decoder also accepts **V1** records for backward compatibility, although the current C plugin emits V2.

### Timestamp interpretation

History timestamps use `[HH:MM:SS.mmm]` and represent **elapsed plugin audio time since LV2 activation**, not the operating system's local clock. Because they are derived from event frame positions rather than JavaScript receive time, browser update delays should not distort the event spacing. The sample-derived clock may restart when the LV2 instance is reactivated. Timestamps are displayed to millisecond precision; the protocol carries integer microseconds.

### Sequence Tracking

Every incoming MIDI event receives a sequence number.

The browser uses these numbers to detect discontinuities.

For example:

```text
#350  B8 7B 00
#351  B9 7B 00
! 32 MIDI events missing before #384
#384  90 3C 64
```

A sequence gap indicates that events were numbered by the plugin but were not accepted into the browser's displayed history.

A gap does not, by itself, establish whether the cause was plugin bypass, queue overflow, host delivery failure or another transport problem.

SysEx chunk failures are additionally reported through the incomplete-message diagnostics.

## Transport Diagnostics

The monitor provides several diagnostic counters.

| Counter | Purpose |
|---|---|
| Messages | Total MIDI events received by the C plugin |
| C batches emitted | Atom/Patch batches successfully constructed by C |
| Batch events | MIDI events accepted by the browser |
| Transport gaps | Missing MIDI event sequence numbers |
| Replays | Repeated Atom/Patch batch values detected |
| SysEx | Successfully completed SysEx messages |
| Incomplete | SysEx messages that could not be fully reconstructed |
| Queue drops | Events or transport records dropped because queue capacity was insufficient |
| Unsupported | Incoming events that could not be represented by the current transport |

The **Messages** and **C batches emitted** counters are maintained by the LV2 plugin.

The browser-side Batch events, Transport gaps, Replays and SysEx completion statistics are maintained separately.

**Clear Log resets the browser history and its associated statistics.** It does not reset the C plugin's lifetime counters.

Consequently, the Messages and Batch events totals may differ after clearing the log. This is expected behaviour.

## Testing and Validation

Development and testing have been carried out on **piStomp v3 / Raspberry Pi 5 running MODEP** and **Windows x64 MOD Desktop**. A Linux x64 artifact is produced in CI; native Linux runtime behaviour has not yet been verified.

### Short MIDI and mixed traffic (earlier versions)

Multiple x42 MIDI Generator instances were used for Note On/Off, CC, multi-channel and dense bursts. A four-generator test exceeded **35,000 messages with no reported sequence gaps**; a separate five-generator test exceeded **26,000 with no detected gaps or replays**. These are empirical results for the tested setup, not a promise of lossless delivery in every host.

The SysEx Test Generator exercised 8, 256, 4,096 and 8,192-byte SysEx and mixed Note/CC/SysEx sequences. The piStomp tests correctly reconstructed and ordered messages through 8,192 bytes. The current C implementation permits SysEx up to **65,536 bytes**, but messages larger than 8,192 bytes have not been verified in runtime tests.

### v0.0.5 timestamp and history tests (retained in v0.1.0)

The Windows MOD Desktop test setup runs the companion SysEx Test Generator in **Repeat 8 KB** mode (one 8,192-byte message every **500 ms**) into the MIDI Monitor.

- At the **16 MiB** history setting, a capture of **214 complete 8,192-byte SysEx messages** showed zero sequence gaps, zero incomplete messages and 500 ms spacing between adjacent events in the continuous part of the test.
- Reducing the memory setting to **4 MiB** retained **84 complete 8,192-byte SysEx events** at approximately **3.96 MiB** estimated stored data, while older entries were evicted.
- A further capture while reviewing/scrolling and using **Older 300** retained **84 consecutive events (#232–#315)** with no missing or duplicate sequence numbers; all messages were marked complete and their hexadecimal payloads were validated. Older entries vanished from the refreshed view only after they expired from the rolling buffer.
- Count-limit increases/decreases during traffic were tested on piStomp; increasing the limit preserved still-retained existing records and did not resurrect already evicted records.
- Settings persistence was verified on piStomp, including reboot, pedalboard changes and separate instances.
- **Copy All** correctly exported the entire retained event history rather than only the visible window.

The test logs include pauses in transmission between some captures; those are **not** treated as missing MIDI events. No test here establishes universal lossless delivery, absolute MIDI latency, or a hard cap on total JavaScript heap memory.

### v0.1.0 interface checks

The new message-type filters, channel selector, and Hex / Decoded / Both modes were exercised with simulated MOD GUI callbacks and mixed MIDI events, including Note On with velocity zero and SysEx. **Copy All** was checked to continue exporting retained unfiltered events. The collapsible **Diagnostics** and **Display Filters** panels and the flexible history area were visually checked in Windows MOD Desktop.

These checks do not replace a full v0.1.0 regression run on piStomp ARM64 or a Linux x64 runtime test; those remain release follow-ups.

### Host bypass and diagnostics

MODEP may emit MIDI cleanup messages when plugins are switched on/off (notably CC 123 *All Notes Off* and CC 120 *All Sound Off*, potentially across all 16 channels). Bypass transitions may interrupt Atom/Patch forwarding and create reported sequence gaps, sometimes in groups of 32. The monitor reports these discontinuities rather than concealing them. Earlier repeated Patch notifications from incorrect empty Atom buffer handling were corrected in v0.0.2.

## Building

The repository uses **GitHub Actions**; neither local Linux compilation nor building on the piStomp itself is required.

### Versioning and artifact names

`VERSION` at the repository root is the **single source of truth** for the release
version (currently `0.1.0`). Before building, the Windows, Linux and ARM64
workflows run `tools/stamp_version.py`, which updates `monitor.ttl` with
`doap:revision`, `lv2:minorVersion` and `lv2:microVersion`. The LV2 identifier
(URI) does **not** change when the version changes, and no C source edits are
required to bump the version.

To publish the next version, edit `VERSION` to `MAJOR.MINOR.PATCH` and commit it.
A release tag should be `vMAJOR.MINOR.PATCH` (for example `v0.1.0`). CI will
**fail** if a tag's version does not match `VERSION`; this avoids mislabelled builds.

GitHub Actions artefact ZIPs download with this naming scheme:

```text
VERSION-pistomp-midi-probe-PLATFORM-BUILDNO.zip
```

For example, `0.1.0-pistomp-midi-probe-aarch64-42.zip`,
`0.1.0-pistomp-midi-probe-windows-x64-42.zip`, and
`0.1.0-pistomp-midi-probe-linux-x64-42.zip` (build numbers are examples).
`BUILDNO` is the GitHub Actions **workflow run number**, which is numbered
separately for each workflow. Every downloaded archive contains exactly one
`pistomp-midi-probe.lv2/` bundle, not a ZIP nested inside another ZIP.

These are **Actions artifacts**, not automatically published GitHub Release
attachments. If you publish a GitHub Release, attach the downloaded ZIPs to
that release separately.

### Build targets

| Target | Build environment | Binary | Test status |
|---|---|---|---|
| piStomp v3 / Raspberry Pi 5 ARM64 | Existing ARM64 workflow | `midi-monitor.so` | Runtime tested on piStomp / MODEP |
| Windows x64 | Windows runner, MSYS2 UCRT64 with LV2 headers | `midi-monitor.dll` | Runtime tested in Windows MOD Desktop |
| Linux x64 | Ubuntu runner with `lv2-dev` | `midi-monitor.so` | CI build available; runtime testing pending |

For GitHub Actions, select **Actions**, choose the platform workflow, choose the desired branch under **Run workflow**, then download the corresponding build artifact. The staged archive contains a `pistomp-midi-probe.lv2` folder with the native binary, `manifest.ttl`, `monitor.ttl` and the complete `modgui/` resources.

### Installation on piStomp

Copy the generated `.lv2` directory into the user plugin location (commonly `/home/pistomp/data/.lv2/`), then restart/rescan the host. If upgrading metadata or GUI resources does not refresh an existing pedalboard, remove and re-add the plugin.

### Windows MOD Desktop

Extract the **Windows x64** bundle, not the Linux/ARM64 bundle, into the directory that MOD Desktop scans for user LV2 plugins (commonly `%APPDATA%\LV2\`, depending on installation), and restart MOD Desktop. Keep only one installed bundle for the URI.

**Important for Windows:** The custom GUI's TTL registration must include `modgui:screenshot <modgui/screenshot.png>` and `modgui:thumbnail <modgui/thumbnail.png>`, **and both PNG files must actually exist**. The full GUI was observed to crash Windows MOD Desktop during plugin-list loading when these assets were missing. Adding both assets and declarations resolved the startup failure in runtime testing. Keep these files in the source repository so the Windows, Linux and ARM64 workflows all package them.

### Using the monitor

Add **piStomp MIDI Monitor** (MIDI Utility), connect a MIDI source to its single MIDI input, and generate MIDI. The custom GUI displays hexadecimal data, decoded short messages, SysEx and relative timestamps. Adjust history limits in the host's settings controls. Expand **Display Filters** to select message types, channel and Hex / Decoded / Both; expand **Diagnostics** to inspect transport statistics. Both panels are collapsed by default, and opening them automatically reduces the history area. Use **Older 300 / Newer 300**, **Following Latest**, **Copy All**, and **Clear Log** as needed. The plugin itself has **no MIDI output**, so parallel routing is necessary to feed the same source to other effects.

## Current Limitations

- Maximum *implemented* SysEx event length is 65,536 bytes; the largest **runtime-tested** size is 8,192 bytes. Hosts must deliver a complete event upstream for it to be reconstructed.
- Bounded real-time transport storage can overflow under sufficiently demanding workloads. Queue drops and incomplete messages are reported.
- The history lives in the browser and is not saved between sessions. Its memory-budget setting is an **estimate**, not a full browser-heap limit.
- Very long SysEx hex lines require horizontal scrolling.
- When reviewing older history, expired entries remain visible in the unchanged text until the view refreshes; navigating then shows only currently retained records.
- Numerical output-port updates may lag behind the Atom/Patch history, depending on host UI polling.
- Host bypass and plugin restart can interrupt notification delivery; timestamps are relative to activation rather than wall-clock time.
- The floating-point MIDI message counter loses single-count precision after 16,777,216, although other diagnostics are not necessarily subject to that particular limit.
- The Hex / Decoded / Both options and filtering alter the visible history only; Copy All exports all retained records. Persistent file export/logging and user-defined saved filter presets are not implemented.
- Custom GUI functionality requires MOD/MODEP support. Linux x64 native runtime compatibility is not yet verified. The final v0.1.0 GUI changes have not yet been regression-tested on piStomp ARM64.

## Development History

### v0.0.1 — Proof of Concept

- LV2 MIDI input.
- Numerical message counter.
- Latest MIDI bytes.
- Initial custom MOD/MODEP interface.
- Basic MIDI monitoring.

### v0.0.2 — Native Atom Transport

- Native LV2 Atom/Patch transport.
- Batched MIDI event delivery.
- Bounded FIFO.
- Sequence numbering and gap detection.
- Repeated-notification diagnostics.
- C-side batch counter.
- Copy All, Clear Log and Follow Latest.
- Improved scrolling, text selection and review behaviour.
- Corrected empty Atom output-buffer handling.

### v0.0.3 — Human Interface Development

- Human-readable MIDI decoding.
- Note names and MIDI note numbers.
- Named common MIDI controllers.
- Program Change, Pitch Bend and Aftertouch decoding.
- Combined hexadecimal and decoded history entries.
- Interface and stylesheet cleanup.

### v0.0.4 — SysEx Support

- Versioned V1 MIDI transport protocol.
- Variable-length SysEx support.
- Bounded SysEx chunking and reassembly.
- SysEx validation and incomplete-message reporting.
- Queue-drop and unsupported-event diagnostics.
- Improved Atom output construction and buffer handling.
- Two-line SysEx history display.
- Successful SysEx testing at 8, 256, 4,096 and 8,192 bytes.
- Successful testing of mixed SysEx and short MIDI traffic.
- Display name updated to **piStomp Midi Monitor**.
- MODEP classification updated to **MIDI Utility**.

### v0.0.5 — Timestamped, Bounded Event History and Desktop Builds

- Structured, **whole-event** browser history: SysEx summary and payload are evicted together.
- Configurable limits with host control ports `history_events` (100–50,000) and `history_memory_mib` (4–64 MiB).
- 300-event windowed display, **Older 300 / Newer 300** navigation and review-safe scrolling.
- **Copy All** exports all retained records, including entries outside the visible window.
- Sample-frame timestamps and the **V2** transport protocol; V1 decoding retained for compatibility.
- Windows x64 and Linux x64 GitHub Actions builds alongside existing ARM64 build.
- Screenshot and thumbnail MOD GUI metadata/assets, required for successful startup on the tested Windows MOD Desktop version.
- Stress-tested 8 KiB SysEx repeat streams, 500 ms timestamps, history limit changes and live review during eviction.

### v0.1.0 — Filtering and Feature-Complete GUI

- Presentation-only filtering by Note On, Note Off (including velocity-zero Note On), CC, PC, Pitch Bend, Aftertouch, SysEx, System and Other.
- MIDI channel selection (All or 1–16), with channel-less messages unaffected by a channel filter.
- **Hex**, **Decoded** and **Both** display modes.
- Filter-aware 300-event navigation while **Copy All** continues to export all retained history.
- Independent collapsible **Diagnostics** and **Display Filters** sections, collapsed by default.
- Flexible history display automatically grows or shrinks as panels open or close without changing the overall 585px interface height.
- Removed the redundant “Live MIDI event monitor” diagnostics line.
- Retains the v0.0.5 DSP, LV2 port layout, V2 transport, memory limits, Windows MOD GUI image assets and all platform build workflows.

## Maintenance and Possible Future Work

v0.1.0 is intended as a **feature-complete initial release**. Future changes are expected to focus on bug fixes, cross-platform verification and performance rather than adding major monitoring functions. Possible refinements include:

- Regression testing of the v0.1.0 GUI on piStomp ARM64 and runtime verification on Linux x64.
- Testing SysEx messages larger than 8,192 bytes and more simultaneous mixed traffic.
- Optional log export or persistent logging if a concrete use case arises.
- More compact presentation of large SysEx payloads and an indication when reviewed events have expired from the buffer.

Display filtering deliberately operates on the existing retained history and never changes MIDI capture or the audio-thread transport. No LV2 DSP changes were required for the v0.1.0 GUI features.

## Compatibility

**Tested:** piStomp v3 running MODEP on Raspberry Pi 5 (ARM64); MOD Desktop on Windows x64 with the full custom GUI, including the screenshot and thumbnail assets.

**Built but not runtime-tested:** Linux x64. The MIDI core is standard C/LV2, but the full browser interface depends on MOD GUI hosting and should not be assumed available in every LV2 host.

The plugin URI and 11-port LV2 layout are consistent across the different target builds. Be sure to install the matching native binary for each platform.

## Plugin URI

The permanent plugin URI is:

```text
https://github.com/tothoseofus/Mod-Midi-Monitor-LV2
```

This URI identifies the plugin across supported LV2 hosts. It should remain stable for future releases, even if the source repository is moved or renamed.

**Compatibility note:** The change from the pre-release placeholder URI (`https://example.org/pistomp-midi-probe`) to this permanent URI makes LV2 hosts recognise it as a different plugin. Existing pedalboards referencing the placeholder must replace the old plugin instance and be saved again.

## Development and AI Assistance

Mod-Midi-Monitor-LV2 was developed with assistance from **OpenAI's ChatGPT**.

ChatGPT was used to assist with software architecture, C and JavaScript code generation, LV2 Atom/Patch integration, SysEx transport and reassembly, interface development, debugging and documentation.

Project requirements, design decisions, integration, testing and validation were directed and performed by the project maintainer, including runtime testing on piStomp v3 hardware running MODEP and Windows MOD Desktop.

AI-generated contributions have been reviewed and modified during development.

ChatGPT and OpenAI are not affiliated with, nor do they endorse, this project.

## Copyright and Licence

Copyright © 2026 Ken Spanks.

Mod-Midi-Monitor-LV2 is distributed under the **GNU General Public License version 3 or later (GPL-3.0-or-later)**.

See the [LICENSE](LICENSE) file for the complete licence terms.

Project maintainer: **Ken Spanks** ([GitHub: tothoseofus](https://github.com/tothoseofus)).

## Contributing

The project is currently under active development.

Bug reports, testing feedback and suggestions will be welcome when the repository is made available for external collaboration.

Areas of particular interest include MIDI decoding, SysEx compatibility, transport reliability, interface usability and cross-platform LV2 support.


## Building all targets and publishing releases

Use **Actions → Build All Targets → Run workflow** and choose a branch to build ARM64, Windows x64 and Linux x64 together. Individual ARM64 and desktop workflows remain available for manual runs. No builds run automatically on pushes to `main`.

To publish a release, update `VERSION` and `CHANGELOG.md`, commit to the release commit, and push a matching tag (for example `v0.1.0`). `Publish Release` validates the tag, builds all three targets and publishes a GitHub Release with three ZIP assets. ZIP filenames use the format `vVERSION-pistomp-midi-probe-PLATFORM-RUNNUMBER.zip`. The release uses that release workflow’s run number, shared across all three platforms. The publish job refuses to overwrite an existing release.

**GitHub web editor note:** Ensure the `.github/workflows/` folder is updated explicitly; folder uploads can miss dot-prefixed directories.
