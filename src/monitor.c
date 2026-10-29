/*
 * Mod-Midi-Monitor-LV2
 * Copyright (C) 2026 tothoseofus
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <lv2/core/lv2.h>
#include <lv2/atom/atom.h>
#include <lv2/atom/forge.h>
#include <lv2/atom/util.h>
#include <lv2/urid/urid.h>
#include <lv2/midi/midi.h>
#include <lv2/patch/patch.h>

#define PLUGIN_URI "https://example.org/pistomp-midi-probe"
#define QUEUE_SIZE 1024u
#define CHUNK_BYTES 96u
#define MAX_SYSEX_BYTES 65536u
#define MAX_BATCH_RECORDS 32u
#define BATCH_TEXT_SIZE 1536u
#define ATOM_MARGIN 160u

enum { MIDI_IN=0, COUNT=1, STATUS=2, DATA1=3, DATA2=4,
       NOTIFY=5, BATCH_COUNT=6, QUEUE_DROPS=7, UNSUPPORTED=8, HISTORY_EVENTS=9, HISTORY_MEMORY_MIB=10 };
enum { REC_SHORT=1, REC_SYSEX=2, REC_REJECT=3 };

typedef struct {
    uint32_t sequence;
    uint32_t total;
    uint32_t offset;
    uint16_t length;
    uint8_t kind;
    uint8_t bytes[CHUNK_BYTES];
} MidiRecord;

typedef struct {
    const LV2_Atom_Sequence* midi;
    LV2_Atom_Sequence* notify;
    float *count,*status,*data1,*data2,*batch_count,*queue_drops_out,*unsupported_out;
    const float *history_events,*history_memory_mib;
    LV2_URID midi_urid,patch_set,patch_property,patch_value,batch_property;
    LV2_Atom_Forge forge;
    uint32_t num,sequence,batches_emitted,queue_drops,unsupported_events;
    uint8_t last_status,last_data1,last_data2;
    MidiRecord queue[QUEUE_SIZE];
    uint32_t head,tail,queued;
} Monitor;

static void record_push(Monitor* m, const MidiRecord* r) {
    m->queue[m->head] = *r;
    m->head = (m->head + 1u) % QUEUE_SIZE;
    ++m->queued;
}

static void queue_midi(Monitor* m, const uint8_t* bytes, uint32_t size) {
    const uint32_t sequence = ++m->sequence;
    if (!size) { ++m->unsupported_events; return; }
    const bool sysex = bytes[0] == 0xF0;
    MidiRecord r = {0};
    r.sequence = sequence;
    r.total = size;
    if (sysex && size <= MAX_SYSEX_BYTES) {
        const uint32_t needed = (size + CHUNK_BYTES - 1u) / CHUNK_BYTES;
        if (needed > QUEUE_SIZE - m->queued) {
            ++m->queue_drops; // One whole MIDI event dropped, never a partial SysEx.
            return;
        }
        for (uint32_t offset = 0; offset < size; offset += CHUNK_BYTES) {
            const uint32_t n = (size - offset < CHUNK_BYTES) ? size-offset : CHUNK_BYTES;
            r.kind = REC_SYSEX;
            r.offset = offset;
            r.length = (uint16_t)n;
            memcpy(r.bytes, bytes + offset, n);
            record_push(m, &r);
        }
        return;
    }
    if (sysex || size > 3) {
        ++m->unsupported_events;
        if (m->queued == QUEUE_SIZE) { ++m->queue_drops; return; }
        r.kind = REC_REJECT; // Explicit error marker, preserving sequence order.
        record_push(m, &r);
        return;
    }
    if (m->queued == QUEUE_SIZE) { ++m->queue_drops; return; }
    r.kind = REC_SHORT;
    r.length = (uint16_t)size;
    memcpy(r.bytes, bytes, size);
    record_push(m, &r);
}

/* Bounded decimal and hex formatting: no malloc, snprintf, or I/O in run(). */
static bool append_char(char* s, uint32_t* n, uint32_t cap, char c) {
    if (*n >= cap) return false;
    s[(*n)++] = c;
    return true;
}
static bool append_u32(char* s, uint32_t* n, uint32_t cap, uint32_t x) {
    char digits[10]; unsigned k=0;
    do { digits[k++] = (char)('0' + x%10u); x/=10u; } while (x && k<10);
    while (k) if (!append_char(s,n,cap,digits[--k])) return false;
    return true;
}
static bool append_hex(char* s, uint32_t* n, uint32_t cap,
                       const uint8_t* data, uint32_t size) {
    static const char hexdigits[] = "0123456789ABCDEF";
    for (uint32_t i=0; i<size; ++i) {
        if (!append_char(s,n,cap,hexdigits[data[i]>>4]) ||
            !append_char(s,n,cap,hexdigits[data[i]&15])) return false;
        if (i+1<size && !append_char(s,n,cap,' ')) return false;
    }
    return true;
}
static bool append_record(char* s, uint32_t* n, uint32_t cap, const MidiRecord* r) {
    const char kind = r->kind==REC_SHORT?'M':r->kind==REC_SYSEX?'S':'X';
    if (!append_char(s,n,cap,kind) || !append_char(s,n,cap,',') ||
        !append_u32(s,n,cap,r->sequence) || !append_char(s,n,cap,',')) return false;
    if (r->kind==REC_SYSEX) {
        if (!append_u32(s,n,cap,r->offset) || !append_char(s,n,cap,',') ||
            !append_u32(s,n,cap,r->total) || !append_char(s,n,cap,',')) return false;
    } else if (r->kind==REC_REJECT) {
        if (!append_u32(s,n,cap,r->total)) return false;
    }
    if (r->kind!=REC_REJECT && !append_hex(s,n,cap,r->bytes,r->length)) return false;
    return append_char(s,n,cap,'\n');
}

/* Conservatively bound the complete forge construction by the port capacity.
 * Exact internal Atom padding is handled by LV2's forge, not by guesswork. */
static bool write_batch(Monitor* m, uint32_t capacity) {
    if (!m->notify || !m->queued || capacity < sizeof(LV2_Atom_Sequence)+ATOM_MARGIN) return false;
    char text[BATCH_TEXT_SIZE];
    uint32_t used=0, records=0, index=m->tail;
    if (!append_char(text,&used,sizeof(text),'V') ||
        !append_char(text,&used,sizeof(text),'1') ||
        !append_char(text,&used,sizeof(text),'\n')) return false;
    const uint32_t max_text = (capacity > ATOM_MARGIN) ? capacity-ATOM_MARGIN : 0;
    const uint32_t text_limit = max_text < sizeof(text)-1 ? max_text : (uint32_t)sizeof(text)-1;
    while (records < MAX_BATCH_RECORDS && records < m->queued) {
        uint32_t previous = used;
        if (!append_record(text,&used,text_limit,&m->queue[index])) {
            used=previous;
            break;
        }
        ++records;
        index=(index+1u)%QUEUE_SIZE;
    }
    if (!records) return false;
    lv2_atom_forge_set_buffer(&m->forge,(uint8_t*)m->notify,capacity);
    LV2_Atom_Forge_Frame sequence_frame,object_frame;
    bool ok = lv2_atom_forge_sequence_head(&m->forge,&sequence_frame,0)!=0;
    if (ok) ok = lv2_atom_forge_frame_time(&m->forge,0)!=0;
    if (ok) ok = lv2_atom_forge_object(&m->forge,&object_frame,0,m->patch_set)!=0;
    if (ok) ok = lv2_atom_forge_key(&m->forge,m->patch_property)!=0;
    if (ok) ok = lv2_atom_forge_urid(&m->forge,m->batch_property)!=0;
    if (ok) ok = lv2_atom_forge_key(&m->forge,m->patch_value)!=0;
    if (ok) ok = lv2_atom_forge_string(&m->forge,text,used)!=0;
    if (ok) {
        lv2_atom_forge_pop(&m->forge,&object_frame);
        lv2_atom_forge_pop(&m->forge,&sequence_frame);
        m->tail=(m->tail+records)%QUEUE_SIZE;
        m->queued-=records;
        ++m->batches_emitted;
    }
    return ok;
}

static LV2_Handle instantiate(const LV2_Descriptor* descriptor,double rate,
                              const char* bundle,const LV2_Feature* const* features) {
    (void)descriptor;(void)rate;(void)bundle;
    LV2_URID_Map* map=NULL;
    for (int i=0;features && features[i];++i)
        if (!strcmp(features[i]->URI,LV2_URID__map)) {
            map=(LV2_URID_Map*)features[i]->data;break;
        }
    if (!map) return NULL;
    Monitor* m=(Monitor*)calloc(1,sizeof(*m));
    if (!m) return NULL;
    m->midi_urid=map->map(map->handle,LV2_MIDI__MidiEvent);
    m->patch_set=map->map(map->handle,LV2_PATCH__Set);
    m->patch_property=map->map(map->handle,LV2_PATCH__property);
    m->patch_value=map->map(map->handle,LV2_PATCH__value);
    m->batch_property=map->map(map->handle,PLUGIN_URI "#lastMidi");
    lv2_atom_forge_init(&m->forge,map);
    return (LV2_Handle)m;
}
static void connect_port(LV2_Handle instance,uint32_t port,void* data) {
    Monitor* m=(Monitor*)instance;
    switch (port) {
        case MIDI_IN:m->midi=(const LV2_Atom_Sequence*)data;break;
        case COUNT:m->count=(float*)data;break;
        case STATUS:m->status=(float*)data;break;
        case DATA1:m->data1=(float*)data;break;
        case DATA2:m->data2=(float*)data;break;
        case NOTIFY:m->notify=(LV2_Atom_Sequence*)data;break;
        case BATCH_COUNT:m->batch_count=(float*)data;break;
        case QUEUE_DROPS:m->queue_drops_out=(float*)data;break;
        case UNSUPPORTED:m->unsupported_out=(float*)data;break;
        case HISTORY_EVENTS:m->history_events=(const float*)data;break;
        case HISTORY_MEMORY_MIB:m->history_memory_mib=(const float*)data;break;
    }
}
static void activate(LV2_Handle instance) {(void)instance;}
static void run(LV2_Handle instance,uint32_t n_samples) {
    (void)n_samples;
    Monitor* m=(Monitor*)instance;
    const uint32_t capacity=m->notify?m->notify->atom.size:0;
    if (m->midi) LV2_ATOM_SEQUENCE_FOREACH(m->midi,ev) {
        if (ev->body.type!=m->midi_urid || !ev->body.size) continue;
        const uint8_t* bytes=(const uint8_t*)(ev+1);
        ++m->num;
        m->last_status=bytes[0];
        m->last_data1=ev->body.size>1?bytes[1]:0;
        m->last_data2=ev->body.size>2?bytes[2]:0;
        queue_midi(m,bytes,ev->body.size);
    }
    bool written=false;
    if (m->notify && m->queued) written=write_batch(m,capacity);
    if (m->notify && !written && capacity>=sizeof(LV2_Atom_Sequence)) {
        m->notify->atom.type=m->forge.Sequence;
        m->notify->atom.size=sizeof(LV2_Atom_Sequence_Body);
        m->notify->body.unit=0;
        m->notify->body.pad=0;
    }
    if (m->count) *m->count=(float)m->num;
    if (m->status) *m->status=(float)m->last_status;
    if (m->data1) *m->data1=(float)m->last_data1;
    if (m->data2) *m->data2=(float)m->last_data2;
    if (m->batch_count) *m->batch_count=(float)m->batches_emitted;
    if (m->queue_drops_out) *m->queue_drops_out=(float)m->queue_drops;
    if (m->unsupported_out) *m->unsupported_out=(float)m->unsupported_events;
}
static void deactivate(LV2_Handle instance) {(void)instance;}
static void cleanup(LV2_Handle instance) {free(instance);}
static const void* extension_data(const char* uri) {(void)uri;return NULL;}
static const LV2_Descriptor descriptor={PLUGIN_URI,instantiate,connect_port,activate,
                                       run,deactivate,cleanup,extension_data};
LV2_SYMBOL_EXPORT const LV2_Descriptor* lv2_descriptor(uint32_t index) {
    return index==0?&descriptor:NULL;
}
