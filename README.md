# Mod-Midi-Monitor-LV2

**A MIDI event monitor for LV2 hosts, developed and tested on piStomp v3 running MODEP.**

**Current development version:** `v0.0.3-Human-Interface`

**Status:** Experimental — active development.

Mod-Midi-Monitor-LV2 provides a visual monitor for incoming MIDI messages. It captures MIDI events through an LV2 input port and displays them in a scrolling history within the MOD/MODEP custom plugin interface.

Unlike conventional LV2 control-port monitoring, which can miss intermediate messages, this plugin uses **batched LV2 Atom/Patch notifications** to transfer multiple MIDI events from the plugin to the browser interface.

The project is intended as a diagnostic and development tool for MIDI devices, software instruments, MIDI generators and audio-to-MIDI applications.

## Features

### MIDI Monitoring

- One MIDI input port.
- No MIDI output or audio ports.
- Captures incoming MIDI events without modifying or forwarding them.
- Displays raw MIDI messages in hexadecimal notation.
- Maintains an ordered message history.
- Assigns sequential numbers to captured MIDI events.
- Detects missing event sequences in the browser.
- Handles bursts of multiple MIDI messages.

### Human-Readable MIDI Display — v0.0.3

The current development branch introduces MIDI message decoding.

Supported message categories include:

- Note On and Note Off.
- Control Change (CC).
- Program Change (PC).
- Pitch Bend.
- Polyphonic Key Pressure (Polyphonic Aftertouch).
- Channel Pressure (Channel Aftertouch).
- Common MIDI system messages.

Note messages include both their musical note name and MIDI note number.

For example:

```text
#145  90 3C 64 | Note On Ch 1 C4(60) Vel 100
#146  80 3C 40 | Note Off Ch 1 C4(60) Rel Vel 64
#147  B0 01 7F | CC Ch 1 Modulation (1) = 127
#148  C1 09    | Program Change Ch 2 Program 10
#149  E0 00 40 | Pitch Bend Ch 1 Centre (8192)
```

The raw MIDI bytes remain available alongside their decoded meaning.

**Development note:** Human-readable decoding is being introduced in v0.0.3. Display-mode selection and event filtering are planned features and are not yet part of the established v0.0.2 implementation.

### MIDI History Interface

The custom MODEP interface provides:

- A scrolling MIDI message history.
- Automatic scrolling to the latest event.
- Protected history review when selecting or scrolling through existing messages.
- **Copy All** to copy the current history.
- **Clear Log** to clear displayed history.
- **Follow Latest** to resume automatic scrolling.
- A live MIDI event counter.
- Display of the latest MIDI bytes.
- Atom/Patch transport diagnostics.

During normal operation, the interface retains the most recent 100 history lines.

When reviewing the log, it can retain up to 5,000 lines to avoid immediately discarding the information being examined.

The log is stored in browser memory and is not automatically written to a file.

## How It Works

The plugin uses two separate mechanisms.

### 1. Numerical LV2 Control Outputs

Four numerical output ports provide:

- Total MIDI event count.
- Latest status byte.
- Latest data byte 1.
- Latest data byte 2.

These values provide basic diagnostics but should not be considered an event-by-event history. Multiple MIDI events can occur between browser control updates.

### 2. Native LV2 Atom/Patch Transport

The primary MIDI history uses an LV2 Atom output port.

Incoming short MIDI messages are assigned sequence numbers and placed into a bounded FIFO queue.

The plugin groups messages into batches and sends them as `patch:Set` notifications containing an `atom:String`.

MODEP forwards these notifications to the custom JavaScript interface, which parses them into individual history entries.

The current implementation uses:

| Parameter | Value |
|---|---|
| MIDI FIFO capacity | 512 short messages |
| Maximum events per batch | 32 |
| Current supported event length | 1–3 bytes |
| Atom output buffer minimum requested | 4096 bytes |
| Transport | LV2 Atom/Patch |
| Browser interface | MOD/MODEP custom JavaScript |

The C implementation uses bounded memory and performs no dynamic memory allocation in the real-time processing callback.

### Sequence Tracking

Every incoming MIDI event receives a sequence number.

The browser uses these numbers to detect discontinuities, for example:

```text
#350 B8 7B 00
#351 B9 7B 00
! 32 MIDI events missing before #384
#384 90 3C 64
```

A sequence gap indicates events that were numbered by the plugin but not accepted into the displayed history.

It does not, by itself, establish whether the cause was a plugin bypass transition, output delivery failure or another transport issue.

## Transport Diagnostics

The plugin includes diagnostic counters for investigating MIDI delivery.

| Counter | Purpose |
|---|---|
| Messages | Total MIDI events received by the C plugin |
| C batches emitted | Number of batches successfully written to the LV2 output buffer |
| Batch events | MIDI records accepted by the JavaScript interface |
| Transport gaps | Missing sequence numbers detected in received records |
| Repeated batches | Repeated Atom/Patch notification values detected by the interface |

The C batch counter does not confirm browser receipt. It indicates that the plugin successfully constructed the corresponding output batch.

## Testing

Development and runtime testing have been performed on:

- **Hardware:** piStomp v3, Raspberry Pi 5 (ARM64).
- **Software:** MODEP on piStomp OS.
- **MIDI sources:** x42 MIDI Generator, with additional MIDI application testing planned.

### Native Transport Testing

Testing of the v0.0.2 transport demonstrated:

- Correct reception of individual MIDI messages.
- Successful transfer of batched events to the custom GUI.
- Consecutive event numbering during extended MIDI Generator operation.
- Successful capture of dense MIDI message bursts.
- More than 6,500 received events in extended testing, with no additional sequence gaps observed during normal operation.
- Detection of missing sequences associated with monitor bypass transitions.

These results are encouraging but do not constitute a guarantee of lossless event transport under every possible workload.

### Bypass Behaviour

When the monitor is switched off or on, MODEP may generate MIDI cleanup messages, including:

- CC 123 — All Notes Off.
- CC 120 — All Sound Off.

These may be issued across all 16 MIDI channels.

During bypass transitions, messages can be counted by the plugin without their corresponding Atom/Patch batches reaching the browser.

This can produce sequence gaps, often in multiples of 32 messages.

The monitor deliberately retains these diagnostics rather than hiding the missing sequence numbers.

An earlier development version also exhibited repeated Patch notifications due to incorrect empty Atom output-buffer handling. This was corrected before the v0.0.2 milestone.

## Building

The project is designed to be built using **GitHub Actions**, without requiring a local Linux development environment or a compiler installed on the piStomp.

### GitHub Actions

1. Open the repository's **Actions** tab.
2. Select the ARM64 LV2 build workflow.
3. Run the workflow against the desired branch.
4. Download the generated build artifact.
5. Extract the LV2 bundle from the artifact.

The workflow builds a native ARM64 LV2 plugin for the Raspberry Pi 5.

The resulting bundle contains the compiled shared library, LV2 metadata and MOD GUI resources.

### Installation on piStomp

Copy the generated `.lv2` bundle into the piStomp user plugin directory.

For standard installations:

```text
/home/pistomp/data/.lv2/
```

Restart or rescan the LV2 host as required.

If replacing an earlier installed version, remove the old plugin instance from the pedalboard and add the updated version if the interface or plugin metadata does not refresh correctly.

### Using the Monitor

1. Add **piStomp MIDI Monitor** to a MODEP pedalboard.
2. Connect a MIDI source to its MIDI input.
3. Generate MIDI messages.
4. Observe the incoming MIDI events in the history window.
5. Use Copy All, Clear Log and Follow Latest as required.

The plugin is a monitor only. It does not provide a MIDI output port.

Where supported by the host, the same MIDI source can be connected in parallel to other plugins.

## Current Limitations

- Full SysEx message logging is not yet implemented.
- The current batch protocol supports MIDI messages of 1–3 bytes.
- SysEx and other longer MIDI events may be counted without being transferred into the history.
- The displayed history is held in browser memory rather than persistent storage.
- The host may deliver output-control updates at a lower rate than incoming MIDI events.
- Atom/Patch delivery may be interrupted during bypass transitions.
- Events can be lost if the bounded queue or host notification path cannot keep up.
- The floating-point MIDI count output has single-integer precision only up to 16,777,216.
- MIDI transport timestamps are not yet included in the event history.
- Human-readable note octave notation uses MIDI note 60 = C4.

## Development Roadmap

### v0.0.1 — Proof of Concept

- LV2 MIDI input.
- Numerical message counter.
- Latest MIDI bytes.
- Custom MOD/MODEP interface.
- Basic scrolling history.

### v0.0.2 — Native Atom Transport

- LV2 Atom/Patch output.
- Batched MIDI event delivery.
- Bounded FIFO queue.
- Event sequence numbering.
- Transport-gap detection.
- Repeated notification handling.
- C-side batch counter.
- Copy All, Clear Log and Follow Latest.
- Improved history selection and scrolling.

### v0.0.3 — Human Interface (In Development)

Planned and ongoing work:

- Human-readable MIDI message decoding.
- Note names and MIDI note numbers.
- Named MIDI controllers.
- Pitch Bend and Aftertouch decoding.
- Hexadecimal / Decoded / Combined display modes.
- MIDI event-type filters.
- Improved interface organisation and readability.

Future filtering options are intended to include Note On, Note Off, CC, PC, Pitch Bend, Aftertouch and system messages.

Filtering should operate at the display level wherever practical, allowing captured messages to remain available independently of the currently selected filters.

### Future Development

Potential future improvements include:

- MIDI channel filtering.
- Full SysEx message support.
- MIDI event timestamps.
- Optional export or persistent logging.
- Further transport stress testing.
- Enhanced diagnostics for FIFO overflow and unsupported events.
- Testing on additional LV2 hosts and platforms.

## Compatibility

The plugin is intended for LV2-compatible hosts, with primary development and testing conducted on piStomp v3 running MODEP.

The MIDI monitoring core is written in portable C using LV2 interfaces. The custom graphical interface relies on MOD/MODEP GUI facilities.

Compatibility with other ARM64 or x86-64 LV2 hosts depends on their support for the relevant LV2 features and custom GUI integration.

The current GitHub Actions workflow targets the ARM64 piStomp environment.

## Plugin URI

The plugin currently uses the development URI:

```text
https://example.org/pistomp-midi-probe
```

This is a placeholder identifier and should be replaced with a permanent URI before public release.

Changing the URI may cause LV2 hosts to treat the plugin as a different plugin, potentially affecting existing pedalboards.

## Development and AI Assistance

Mod-Midi-Monitor-LV2 was developed with assistance from **OpenAI's ChatGPT**.

ChatGPT was used to assist with software architecture, C and JavaScript code generation, LV2 Atom/Patch integration, interface development, debugging and documentation.

Project requirements, design decisions, integration, testing and validation were directed and performed by the project maintainer, including testing on piStomp v3 hardware running MODEP.

AI-generated contributions have been reviewed and modified during development.

ChatGPT and OpenAI are not affiliated with, nor do they endorse, this project.

## Copyright and Licence

Copyright © 2026 tothoseofus.

Mod-Midi-Monitor-LV2 is distributed under the **GNU General Public License version 3 or later (GPL-3.0-or-later)**.

See the [LICENSE](LICENSE) file for the complete licence terms.

Project maintainer: [tothoseofus](https://github.com/tothoseofus).

## Contributing

The project is currently under active development.

Bug reports, testing feedback and suggestions are welcome when the repository is made available for external collaboration.

Particular areas of interest include MIDI message decoding, transport reliability, cross-platform LV2 compatibility and usability improvements.
