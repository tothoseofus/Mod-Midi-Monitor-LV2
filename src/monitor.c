#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <lv2/core/lv2.h>
#include <lv2/atom/atom.h>
#include <lv2/atom/util.h>
#include <lv2/urid/urid.h>
#include <lv2/midi/midi.h>

#define PLUGIN_URI "https://example.org/pistomp-midi-probe"
enum { MIDI_IN=0, COUNT=1, STATUS=2, DATA1=3, DATA2=4 };
typedef struct {
  const LV2_Atom_Sequence* midi;
  float *count, *status, *data1, *data2;
  LV2_URID midi_urid;
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
  m->midi_urid=map->map(map->handle, LV2_MIDI__MidiEvent);
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
  }
}
static void activate(LV2_Handle instance) { (void)instance; }
static void run(LV2_Handle instance, uint32_t n_samples) {
  (void)n_samples;
  Monitor* m=(Monitor*)instance;
  if (m->midi) {
    LV2_ATOM_SEQUENCE_FOREACH(m->midi, ev) {
      if (ev->body.type != m->midi_urid || ev->body.size == 0) continue;
      const uint8_t* b=(const uint8_t*)(ev+1);
      m->num++;
      m->last_status=b[0];
      m->last_data1=ev->body.size>1 ? b[1] : 0;
      m->last_data2=ev->body.size>2 ? b[2] : 0;
    }
  }
  if(m->count) *m->count=(float)m->num;
  if(m->status) *m->status=(float)m->last_status;
  if(m->data1) *m->data1=(float)m->last_data1;
  if(m->data2) *m->data2=(float)m->last_data2;
}
static void deactivate(LV2_Handle instance) { (void)instance; }
static void cleanup(LV2_Handle instance) { free(instance); }
static const void* extension_data(const char* uri) { (void)uri; return NULL; }
static const LV2_Descriptor descriptor={ PLUGIN_URI, instantiate, connect_port,
  activate, run, deactivate, cleanup, extension_data };
LV2_SYMBOL_EXPORT const LV2_Descriptor* lv2_descriptor(uint32_t index) {
  return index==0 ? &descriptor : NULL;
}
