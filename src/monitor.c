#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <lv2/core/lv2.h>
#include <lv2/atom/atom.h>
#include <lv2/atom/forge.h>
#include <lv2/atom/util.h>
#include <lv2/urid/urid.h>
#include <lv2/midi/midi.h>
#include <lv2/patch/patch.h>
#include <stdio.h>
#include <stdbool.h>

#define PLUGIN_URI "https://example.org/pistomp-midi-probe"
enum {
    MIDI_IN = 0,
    COUNT = 1,
    STATUS = 2,
    DATA1 = 3,
    DATA2 = 4,
    NOTIFY = 5
};

typedef struct {
    // Existing MIDI input
    const LV2_Atom_Sequence* midi;

    // Existing numerical output controls
    float *count, *status, *data1, *data2;

    // New Atom notification output
    LV2_Atom_Sequence* notify;

    // MIDI event type
    LV2_URID midi_urid;

    // Atom Forge
    LV2_Atom_Forge forge;

    // Patch message identifiers
    LV2_URID patch_set;
    LV2_URID patch_property;
    LV2_URID patch_value;
    LV2_URID last_midi_property;

    // Existing MIDI statistics
    uint32_t num;
    uint8_t last_status, last_data1, last_data2;

} Monitor;

static LV2_Handle instantiate(const LV2_Descriptor *d, double rate, const char *bundle,
                               const LV2_Feature* const* features) {
  (void)d; (void)rate; (void)bundle;
  LV2_URID_Map* map = NULL;
  for (int i=0; features && features[i]; i++) {
    if (!strcmp(features[i]->URI, LV2_URID__map)) map=(LV2_URID_Map*)features[i]->data;
  }
  if (!map) return NULL;
  Monitor* m=(Monitor*)calloc(1,sizeof(Monitor));
  if (!m) return NULL;
  
  // Existing MIDI event URID
  m->midi_urid =
      map->map(map->handle, LV2_MIDI__MidiEvent);

  // Initialise Atom Forge
  lv2_atom_forge_init(&m->forge, map);

  // Map Patch URIs
  m->patch_set =
      map->map(map->handle, LV2_PATCH__Set);

  m->patch_property =
      map->map(map->handle, LV2_PATCH__property);

  m->patch_value =
      map->map(map->handle, LV2_PATCH__value);

  // Our custom Patch property
  m->last_midi_property =
      map->map(
          map->handle,
          PLUGIN_URI "#lastMidi"
      );

  return m;

}
static void connect_port(LV2_Handle instance, uint32_t port, void* data) {
  Monitor* m=(Monitor*)instance;
  switch(port) {
  case MIDI_IN: m->midi=(const LV2_Atom_Sequence*)data; break;
  case COUNT: m->count=(float*)data; break;
  case STATUS: m->status=(float*)data; break;
  case DATA1: m->data1=(float*)data; break;
  case DATA2: m->data2=(float*)data; break;
  case NOTIFY: m->notify = (LV2_Atom_Sequence*)data; break;
  }
}


static void send_midi_patch(Monitor* m, uint8_t status, uint8_t data1, uint8_t data2)
{
    // Format MIDI bytes as hexadecimal text.
    // No dynamic memory allocation.
    char message[16];

    snprintf(message, sizeof(message),
             "%02X %02X %02X",
             status, data1, data2);

    // Timestamp notification at the start of the block.
    lv2_atom_forge_frame_time(&m->forge, 0);

    // Begin patch:Set object.
    LV2_Atom_Forge_Frame obj;

    lv2_atom_forge_object(
        &m->forge,
        &obj,
        0,
        m->patch_set
    );

    // patch:property = our lastMidi URI
    lv2_atom_forge_key(
        &m->forge,
        m->patch_property
    );

    lv2_atom_forge_urid(
        &m->forge,
        m->last_midi_property
    );

    // patch:value = hexadecimal string
    lv2_atom_forge_key(
        &m->forge,
        m->patch_value
    );

    lv2_atom_forge_string(
        &m->forge,
        message,
        (uint32_t)strlen(message)
    );

    // Finish the Patch object.
    lv2_atom_forge_pop(&m->forge, &obj);
}

static void activate(LV2_Handle instance) { (void)instance; }

static void run(LV2_Handle instance, uint32_t n_samples)
{
    (void)n_samples;

    Monitor* m = (Monitor*)instance;

    // -----------------------------------
    // 1. Prepare Atom output sequence
    // -----------------------------------

    LV2_Atom_Forge_Frame sequence_frame;
    bool notify_ready = false;

    if (m->notify) {

        // For an Atom output port, the host supplies
        // the available buffer capacity in atom.size.
        const uint32_t capacity = m->notify->atom.size;

        // The smoke test needs a small bounded buffer.
        // Reserve enough space for the Patch object.
        if (capacity >= 256) {

            lv2_atom_forge_set_buffer(
                &m->forge,
                (uint8_t*)m->notify,
                capacity
            );

            lv2_atom_forge_sequence_head(
                &m->forge,
                &sequence_frame,
                0
            );

            notify_ready = true;

        } else {
            // Initialise an empty sequence where possible.
            // No notification will be generated.
            if (capacity >= sizeof(LV2_Atom_Sequence)) {
                m->notify->atom.type = m->forge.Sequence;
                m->notify->atom.size =
                    sizeof(LV2_Atom_Sequence_Body);
                m->notify->body.unit = 0;
                m->notify->body.pad = 0;
            }
        }
    }

    // -----------------------------------
    // 2. Process MIDI input
    // -----------------------------------

    bool received_midi = false;

    if (m->midi) {

        LV2_ATOM_SEQUENCE_FOREACH(m->midi, ev) {

            if (ev->body.type != m->midi_urid ||
                ev->body.size == 0) {
                continue;
            }

            const uint8_t* b =
                (const uint8_t*)(ev + 1);

            // Existing MIDI message counter.
            m->num++;

            m->last_status = b[0];

            m->last_data1 =
                ev->body.size > 1 ? b[1] : 0;

            m->last_data2 =
                ev->body.size > 2 ? b[2] : 0;

            received_midi = true;
        }
    }

    // -----------------------------------
    // 3. Send Atom/Patch notification
    // -----------------------------------

    if (received_midi && notify_ready) {

        send_midi_patch(
            m,
            m->last_status,
            m->last_data1,
            m->last_data2
        );
    }

    // Finalise the Atom output sequence.
    if (notify_ready) {
        lv2_atom_forge_pop(
            &m->forge,
            &sequence_frame
        );
    }

    // -----------------------------------
    // 4. Update existing numerical ports
    // -----------------------------------

    if (m->count)
        *m->count = (float)m->num;

    if (m->status)
        *m->status = (float)m->last_status;

    if (m->data1)
        *m->data1 = (float)m->last_data1;

    if (m->data2)
        *m->data2 = (float)m->last_data2;
}

static void deactivate(LV2_Handle instance) { (void)instance; }
static void cleanup(LV2_Handle instance) { free(instance); }
static const void* extension_data(const char* uri) { (void)uri; return NULL; }
static const LV2_Descriptor descriptor={ PLUGIN_URI, instantiate, connect_port,
  activate, run, deactivate, cleanup, extension_data };
LV2_SYMBOL_EXPORT const LV2_Descriptor* lv2_descriptor(uint32_t index) {
  return index==0 ? &descriptor : NULL;
}
