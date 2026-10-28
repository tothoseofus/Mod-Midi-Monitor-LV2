# piStomp MIDI Monitor — transport probe (experimental)

This is **stage 1**, not a full MIDI logger. It has one MIDI input, no MIDI output, no audio ports, and four output controls: message count and the last three message bytes. It tests whether piStomp MODEP's browser receives monitored output-control updates. Do not use it to conclude that arbitrary Atom event streaming to the browser works.

## Building without local Linux

Create a GitHub repository, upload the contents of this folder (including `.github/workflows/build.yml`) and run Actions → Build ARM64 LV2 probe → Run workflow. Download the `pistomp-midi-probe-aarch64` artifact, unzip it and install the enclosed `.lv2` folder in your piStomp user LV2 directory (`/home/pistomp/data/.lv2/` in standard installations). Restart/rescan the LV2 host as required.

The GitHub ARM64 runner compiles native aarch64 ELF. It requires no Linux machine on your desk. It has **not yet been compiled or runtime-tested** on piStomp.

## Testing

1. Add the plugin to a MODEP pedalboard.
2. Route a MIDI source's output to the plugin's input while retaining any other existing output connections.
3. Trigger a few MIDI notes or controller messages.
4. Check whether the count rises and whether the browser shows the latest status and data bytes.
5. Check the four output-control values separately if the custom GUI does not update.

## Reading the results

- Count increases + browser updates: numerical monitored-output path works.
- Count increases but browser does not update: investigate MOD GUI registration/JS subscription and event callbacks.
- Count stays at zero: investigate MIDI routing, LV2 input events, plugin loading.
- This prototype does not deliver a complete per-message log; polling output controls can miss intermediate values.

## Technical caveats

The floating-point message counter loses single-increment precision beyond 16,777,216 messages. MIDI SysEx counts as one event but the first three bytes only are presented. The latest message bytes are updated separately in the GUI and should **not** be interpreted as an atomic snapshot of one event. The number of monitoring callbacks and their frequency are host-dependent.

The plugin URI is currently a development placeholder (`https://example.org/pistomp-midi-probe`); set a permanent URI before public release.

### Development and AI Assistance

Mod-Midi-Monitor-LV2 was developed with assistance from **OpenAI's ChatGPT**.

ChatGPT was used to assist with software architecture, C and JavaScript code generation, LV2 Atom/Patch integration, interface development, debugging, and documentation.

Project requirements, design decisions, integration, testing, and validation were directed and performed by the project maintainer, including testing on piStomp v3 hardware running MODEP.

AI-generated contributions have been reviewed and modified during development. The project is maintained and distributed under the GNU General Public License v3.0 or later.

ChatGPT and OpenAI are not affiliated with, nor do they endorse, this project.

## Copyright and Licence

Copyright © 2026 tothoseofus.

Mod-Midi-Monitor-LV2 is distributed under the GNU General Public License version 3 or later (GPL-3.0-or-later).

See the [LICENSE](LICENSE) file for the complete licence terms.

Project maintainer: [tothoseofus](https://github.com/tothoseofus).

This project was developed with assistance from OpenAI's ChatGPT.
