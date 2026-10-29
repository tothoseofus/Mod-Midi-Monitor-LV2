# v0.0.5 history prototype — testing notes

This is a development branch snapshot; keep v0.0.4 as a fallback.

- Adds LV2 input ports 9 `history_events` (100–50,000, default 10,000) and 10 `history_memory_mib` (4–64, default 16).
- History retention is managed entirely in the MODEP browser; the audio-thread FIFO and Atom/Patch protocol are unchanged.
- Each complete or incomplete SysEx is stored as one record, displayed on two lines.
- The log shows a maximum of 300 retained events at a time; use **Older 300**, **Newer 300**, and **Follow Latest** to navigate.
- **Copy All** copies every retained event, not just the visible page. Clipboard API and legacy `execCommand` remain from v0.0.4.
- The memory budget estimates stored history payloads and JS overhead; it is not a hard limit on total browser heap consumption.
- Oldest records are evicted as limits are reached. Increases cannot restore already discarded records.

## Test on piStomp

1. Build with the existing ARM64 workflow, and load the new bundle.
2. Check that the two new controls appear in the MODEP plugin's settings panel. Confirm their changes reach the JavaScript instance (watch `Retained` counts and live evictions).
3. Run x42 generators until more than 300 and then 10,000 messages are received; use Older/Newer/Follow Latest.
4. Change the event limit to 1,000 then 20,000 during running traffic; verify that old events are evicted without any C-side transport gap.
5. Change memory budget while generating large SysEx messages. Verify the SysEx title and data always stay together.
6. Check Copy All includes entries not currently displayed, and that Clear Log resets only the browser history.
7. Test normal MIDI, large SysEx, and mixed events, comparing v0.0.4 counters and gaps.

## Known risk / requires runtime verification

MODEP's MOD GUI callback behaviour for **LV2 input-port changes** and availability of the host's settings cog must be confirmed on piStomp. The ports are declared as standard LV2 inputs, but the browser callback may not receive changes in all MODEP versions. If necessary, add a custom settingsTemplate or a host-independent parameter notification bridge after the initial test. The current build does not add a bespoke settingsTemplate.

The versioned C transport implementation is unchanged apart from the addition of two unconsumed control-port pointers.
