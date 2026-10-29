# Mod-Midi-Monitor-LV2

**A MIDI event and SysEx monitor for LV2 hosts, developed and tested on piStomp v3 running MODEP.**

**Current version:** `v0.0.4`

**Status:** Experimental — functional and under active development.

Mod-Midi-Monitor-LV2 provides a visual monitor for incoming MIDI messages, including System Exclusive (SysEx) messages. It captures MIDI events through an LV2 input port and displays them in a scrolling history within the MOD/MODEP custom plugin interface.

Unlike conventional LV2 control-port monitoring, which can miss intermediate events, this plugin uses **batched LV2 Atom/Patch notifications** to transfer MIDI events from the plugin to the browser interface.

The project is intended as a diagnostic and development tool for MIDI devices, software instruments, MIDI generators, controllers, configuration messages and audio-to-MIDI applications.

The plugin appears in MODEP as **piStomp Midi Monitor**, under the **MIDI Utility** category.

## Features

### MIDI Monitoring

- One MIDI input port.
- No MIDI output or audio ports.
- Captures incoming MIDI events without modifying or forwarding them.
- Displays raw MIDI messages in hexadecimal notation.
- Provides human-readable decoding of common MIDI messages.
- Supports complete SysEx messages, including large data dumps.
- Maintains an ordered MIDI message history.
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
#145  90 3C 64  | Note On   Ch 1  C4(60)  Vel 100
#146  80 3C 40  | Note Off  Ch 1  C4(60)  Rel Vel 64
#147  B0 01 7F  | CC  Ch 1  Modulation (1) = 127
#148  C1 09     | Program Change  Ch 2  Program 10
#149  E0 00 40  | Pitch Bend  Ch 1  Centre (8192)
#150  BF 7B 00  | CC  Ch 16  All Notes Off (123) = 0
```

The original hexadecimal bytes are retained alongside their decoded meaning.

### System Exclusive (SysEx) Support

Version 0.0.4 introduces **variable-length SysEx capture and reassembly**.

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
#220  90 3C 64  | Note On  Ch 1  C4(60)  Vel 100
#221  SysEx (256 bytes, complete)
      F0 7D 55 05 1F 44 69 0E 33 58 ... F7
#222  B0 01 40  | CC  Ch 1  Modulation (1) = 64
#223  80 3C 40  | Note Off  Ch 1  C4(60)  Rel Vel 64
```

The ellipsis in this example is illustrative. **The actual monitor displays every byte**, allowing the complete message to be copied and examined.

For incomplete SysEx messages, the monitor reports the number of bytes received, the expected length where known, and the reason reassembly could not be completed.

The 65,536-byte limit is an implementation limit, not a guarantee that every LV2 host can deliver a SysEx message of that size. Actual message capacity also depends on host buffers and available transport resources.

### MIDI History Interface

The custom MODEP interface provides:

- A scrolling MIDI message history.
- Automatic scrolling to the latest event.
- Protected history review when selecting or scrolling through existing messages.
- **Copy All** to copy the retained history.
- **Clear Log** to clear displayed history.
- **Follow Latest** to resume automatic scrolling.
- A live MIDI event counter.
- Display of the latest MIDI bytes.
- Atom/Patch transport diagnostics.
- SysEx completion, queue-drop and unsupported-event statistics.

During normal operation, the interface retains the most recent **100 history lines**.

When reviewing the log, it can retain up to **5,000 lines** to avoid immediately discarding information being examined.

The history is held in browser memory and is not automatically saved to disk.

SysEx messages currently occupy two history lines: a summary and the hexadecimal payload. Because history retention is line-based, these may occasionally be separated when the rolling history reaches its limit.

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
| Transport protocol | Versioned V1 |
| Transport mechanism | LV2 Atom/Patch |
| Queue capacity | 1,024 transport records |
| Short MIDI message length | 1–3 bytes |
| SysEx chunk payload | Up to 96 bytes |
| Maximum supported SysEx message | 65,536 bytes |
| Atom output buffer minimum requested | 4,096 bytes |
| Browser interface | MOD/MODEP custom JavaScript |

The C implementation uses bounded memory and avoids dynamic memory allocation in the real-time processing callback.

Large SysEx messages are divided into transport chunks and reassembled by JavaScript.

Each SysEx message receives one MIDI event sequence number, regardless of how many transport chunks are needed.

### Versioned Transport Records

Short MIDI records use a format such as:

```text
V1
M,145,90 3C 64
M,146,80 3C 40
```

SysEx messages use chunk records with the event sequence, byte offset and declared total length:

```text
V1
S,147,0,8,F0 7D 01 02
S,147,4,8,03 04 05 F7
```

In this example, both chunks belong to event `#147`.

The browser reconstructs the original eight-byte SysEx message and displays it as a single MIDI event.

The protocol also provides reporting for unsupported messages.

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

Development and runtime testing have been performed on:

- **Hardware:** piStomp v3, Raspberry Pi 5 (ARM64).
- **Software:** MODEP on piStomp OS.
- **MIDI sources:** x42 MIDI Generator and a purpose-built LV2 SysEx Test Generator.

### Short MIDI Stress Testing

The monitor has been tested using multiple simultaneous x42 MIDI Generator instances.

Testing included:

- Note On and Note Off events.
- Control Change messages.
- Multiple MIDI channels.
- Dense MIDI bursts.
- Simultaneous MIDI generators at high event rates.
- Continuous monitoring over tens of thousands of messages.

One test using four MIDI Generators exceeded **35,000 MIDI events with no reported sequence gaps**, while another test using five generators recorded more than **26,000 events with no detected transport gaps or replays**.

These tests provide encouraging evidence of reliable short-message delivery in the tested environment, but do not establish guaranteed lossless transport under all workloads.

### SysEx Testing — v0.0.4

A separate LV2 SysEx Test Generator was developed to provide deterministic test messages.

The following scenarios were tested:

| Test | Message size | Result |
|---|---|---|
| Small SysEx | 8 bytes | Passed |
| Medium SysEx | 256 bytes | Passed |
| Large SysEx | 4,096 bytes | Passed |
| Large SysEx | 8,192 bytes | Passed |
| Mixed MIDI and SysEx | 256-byte SysEx with Note On, CC and Note Off | Passed |

Testing demonstrated:

- Complete SysEx reconstruction through the Atom/Patch transport.
- Preservation of hexadecimal message contents.
- Correct `F0` and `F7` delimiters.
- Correct message lengths.
- Correct deterministic payload patterns.
- Preservation of event order relative to short MIDI messages.
- No reported transport gaps or incomplete SysEx messages in the completed test sequence.

In one test, all **20 MIDI events**, including **11 SysEx messages**, were received and displayed, with zero reported transport gaps.

The test confirmed successful operation with SysEx messages up to **8,192 bytes** on the tested piStomp configuration.

Messages larger than 8,192 bytes remain unverified in runtime testing, despite the higher implementation limit.

### Bypass Behaviour

When plugins are switched off or on, MODEP may generate MIDI cleanup messages, including:

- CC 123 — All Notes Off.
- CC 120 — All Sound Off.

These messages may be generated across all 16 MIDI channels.

During monitor bypass transitions, cleanup events can be counted by the C plugin without their Atom/Patch notifications reaching the browser.

This can produce sequence gaps, sometimes in multiples of 32 messages.

The monitor retains these gap reports rather than hiding them.

An earlier development version exhibited repeated Patch notifications because of incorrect empty Atom output-buffer handling. This was corrected in v0.0.2.

## Building

The project is designed to be built using **GitHub Actions**, without requiring a local Linux development environment or compilation directly on the piStomp.

### GitHub Actions

1. Open the repository's **Actions** tab.
2. Select the ARM64 LV2 build workflow.
3. Run the workflow against the desired branch.
4. Download the generated build artifact.
5. Extract the `.lv2` plugin bundle from the artifact.

The workflow produces a native ARM64 LV2 plugin for the Raspberry Pi 5.

The bundle contains the compiled shared library, LV2 metadata and MOD GUI resources.

### Installation on piStomp

Copy the generated `.lv2` folder into the piStomp user plugin directory.

For standard installations:

```text
/home/pistomp/data/.lv2/
```

Restart or rescan the LV2 host as required.

If replacing an earlier installed version, remove and re-add the plugin to the pedalboard if the interface or plugin metadata does not refresh correctly.

### Using the Monitor

1. Add **piStomp Midi Monitor** from MODEP's **MIDI Utility** category.
2. Connect a MIDI source to the monitor's MIDI input.
3. Generate ordinary MIDI or SysEx messages.
4. Observe the messages in the history window.
5. Use Copy All, Clear Log and Follow Latest as required.

The plugin is a monitor only. It does not provide a MIDI output port.

Where supported by the host, the same MIDI source can be routed in parallel to other plugins.

## Current Limitations

- SysEx messages are supported up to an implementation maximum of 65,536 bytes; the largest successfully tested message is 8,192 bytes.
- The host must deliver the complete incoming MIDI event to the plugin. Messages rejected or truncated upstream cannot be reconstructed.
- The bounded transport queue can overflow under sufficiently demanding workloads.
- Incomplete SysEx data is reported rather than silently treated as a valid complete message.
- The browser history is held in memory and is not persistent.
- Large SysEx dumps can produce very long hexadecimal lines, requiring horizontal scrolling.
- SysEx summaries and payloads are stored as separate history lines.
- Numerical output-control updates can temporarily lag behind Atom/Patch history updates.
- Atom/Patch delivery can be interrupted during plugin bypass transitions.
- The floating-point MIDI message counter loses single-increment precision beyond 16,777,216.
- MIDI timestamps are not yet included in the history.
- Display modes, event-type filtering and channel filtering are not yet implemented.
- Custom GUI functionality depends on MOD/MODEP host support.

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

## Planned Development

Future improvements may include:

- Hexadecimal / Decoded / Combined display modes.
- Event-type filtering for Note On, Note Off, CC, PC, Pitch Bend, Aftertouch, SysEx and system messages.
- MIDI channel filtering.
- Structured history storage to keep complete SysEx messages together.
- Expandable SysEx entries and individual-message copying.
- More efficient presentation of large SysEx dumps.
- MIDI event timestamps.
- Optional log export and persistent logging.
- More extensive stress testing of concurrent SysEx and short MIDI traffic.
- Testing of messages larger than 8,192 bytes.
- Additional LV2 host and platform compatibility testing.

Where practical, filtering should operate on stored events rather than discarding them during capture, so changing the display filters does not permanently lose diagnostic data.

## Compatibility

The plugin is intended for LV2-compatible hosts, with primary development and testing conducted on **piStomp v3 running MODEP on Raspberry Pi 5**.

The MIDI monitoring core is written in C using LV2 interfaces.

The custom graphical interface relies on MOD/MODEP GUI facilities. Other LV2 hosts may load the plugin without providing the same browser-based interface.

Compatibility with additional ARM64, Linux x86-64 or Windows environments has not yet been established through runtime testing.

The current GitHub Actions workflow targets the ARM64 piStomp environment.

## Plugin URI

The plugin currently uses the URI:

```text
https://example.org/pistomp-midi-probe
```

This is a development placeholder and should be replaced with a permanent URI before public distribution.

Changing the URI may cause LV2 hosts to recognise the plugin as a different plugin, potentially affecting existing pedalboards.

## Development and AI Assistance

Mod-Midi-Monitor-LV2 was developed with assistance from **OpenAI's ChatGPT**.

ChatGPT was used to assist with software architecture, C and JavaScript code generation, LV2 Atom/Patch integration, SysEx transport and reassembly, interface development, debugging and documentation.

Project requirements, design decisions, integration, testing and validation were directed and performed by the project maintainer, including runtime testing on piStomp v3 hardware running MODEP.

AI-generated contributions have been reviewed and modified during development.

ChatGPT and OpenAI are not affiliated with, nor do they endorse, this project.

## Copyright and Licence

Copyright © 2026 tothoseofus.

Mod-Midi-Monitor-LV2 is distributed under the **GNU General Public License version 3 or later (GPL-3.0-or-later)**.

See the [LICENSE](LICENSE) file for the complete licence terms.

Project maintainer: [tothoseofus](https://github.com/tothoseofus).

## Contributing

The project is currently under active development.

Bug reports, testing feedback and suggestions will be welcome when the repository is made available for external collaboration.

Areas of particular interest include MIDI decoding, SysEx compatibility, transport reliability, interface usability and cross-platform LV2 support.
