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

#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#include <lv2/core/lv2.h>
#include <lv2/atom/atom.h>
#include <lv2/atom/forge.h>
#include <lv2/atom/util.h>
#include <lv2/urid/urid.h>
#include <lv2/midi/midi.h>
#include <lv2/patch/patch.h>

#define PLUGIN_URI "https://example.org/pistomp-midi-probe"

#define QUEUE_SIZE 512
#define MAX_BATCH 32
#define BATCH_TEXT_SIZE 1024
#define MIN_NOTIFY_CAPACITY 2048

enum {
    MIDI_IN = 0,
    COUNT = 1,
    STATUS = 2,
    DATA1 = 3,
    DATA2 = 4,
    NOTIFY = 5,
    BATCH_COUNT = 6
};

typedef struct {
    uint32_t sequence;
    uint8_t size;
    uint8_t bytes[3];
} MidiRecord;

typedef struct {
    const LV2_Atom_Sequence* midi;
    LV2_Atom_Sequence* notify;

    float* count;
    float* status;
    float* data1;
    float* data2;
    // Diagnostic: number of batches actually emitted
    float* batch_count;
    uint32_t batches_emitted;

    LV2_URID midi_urid;
    LV2_URID patch_set;
    LV2_URID patch_property;
    LV2_URID patch_value;
    LV2_URID batch_property;

    LV2_Atom_Forge forge;

    uint32_t num;
    uint32_t sequence;
    uint32_t queue_drops;
    uint32_t unsupported_events;

    uint8_t last_status;
    uint8_t last_data1;
    uint8_t last_data2;

    MidiRecord queue[QUEUE_SIZE];
    uint32_t head;
    uint32_t tail;
    uint32_t queued;
} Monitor;

/* Add a short MIDI message to the bounded FIFO. */
static void queue_midi(Monitor* m,
                       const uint8_t* bytes,
                       uint32_t size)
{
    /* Every received MIDI event gets a sequence number. */
    ++m->sequence;

    if (size == 0 || size > 3) {
        ++m->unsupported_events;
        return;
    }

    if (m->queued >= QUEUE_SIZE) {
        ++m->queue_drops;
        return;
    }

    MidiRecord* r = &m->queue[m->head];

    r->sequence = m->sequence;
    r->size = (uint8_t)size;
    r->bytes[0] = bytes[0];
    r->bytes[1] = size > 1 ? bytes[1] : 0;
    r->bytes[2] = size > 2 ? bytes[2] : 0;

    m->head = (m->head + 1) % QUEUE_SIZE;
    ++m->queued;
}

/* Emit a single batch as a patch:Set atom:String. */
static bool write_batch(Monitor* m)
{
    if (!m->notify || m->queued == 0) {
        return false;
    }

    char text[BATCH_TEXT_SIZE];

    size_t used = 0;
    uint32_t records = 0;

    /* Format records without removing them yet. */
    uint32_t index = m->tail;

    while (records < MAX_BATCH &&
           records < m->queued) {

        const MidiRecord* r = &m->queue[index];
        int written;

        if (r->size == 1) {
            written = snprintf(
                text + used,
                sizeof(text) - used,
                "%u,%02X\n",
                r->sequence,
                r->bytes[0]
            );
        } else if (r->size == 2) {
            written = snprintf(
                text + used,
                sizeof(text) - used,
                "%u,%02X %02X\n",
                r->sequence,
                r->bytes[0],
                r->bytes[1]
            );
        } else {
            written = snprintf(
                text + used,
                sizeof(text) - used,
                "%u,%02X %02X %02X\n",
                r->sequence,
                r->bytes[0],
                r->bytes[1],
                r->bytes[2]
            );
        }

        if (written < 0 ||
            (size_t)written >= sizeof(text) - used) {
            break;
        }

        used += (size_t)written;
        ++records;

        index = (index + 1) % QUEUE_SIZE;
    }

    if (records == 0) {
        return false;
    }

    /* The host provides the output capacity in atom.size. */
    uint32_t capacity = m->notify->atom.size;

    if (capacity < MIN_NOTIFY_CAPACITY) {
        return false;
    }

    /* Initialise the Atom output sequence. */
    lv2_atom_forge_set_buffer(
        &m->forge,
        (uint8_t*)m->notify,
        capacity
    );

    LV2_Atom_Forge_Frame sequence_frame;

    lv2_atom_forge_sequence_head(
        &m->forge,
        &sequence_frame,
        0
    );

    lv2_atom_forge_frame_time(&m->forge, 0);

    LV2_Atom_Forge_Frame object_frame;

    lv2_atom_forge_object(
        &m->forge,
        &object_frame,
        0,
        m->patch_set
    );

    lv2_atom_forge_key(
        &m->forge,
        m->patch_property
    );

    lv2_atom_forge_urid(
        &m->forge,
        m->batch_property
    );

    lv2_atom_forge_key(
        &m->forge,
        m->patch_value
    );

    LV2_Atom_Forge_Ref result =
        lv2_atom_forge_string(
            &m->forge,
            text,
            (uint32_t)used
        );

    if (result == 0) {
        /*
         * The output was insufficient.
         * Leave the FIFO intact for the next block.
         */
        lv2_atom_forge_set_buffer(
            &m->forge,
            (uint8_t*)m->notify,
            capacity
        );

        LV2_Atom_Forge_Frame empty_frame;
        lv2_atom_forge_sequence_head(
            &m->forge,
            &empty_frame,
            0
        );
        lv2_atom_forge_pop(&m->forge, &empty_frame);
        return false;
    }

    lv2_atom_forge_pop(&m->forge, &object_frame);
    lv2_atom_forge_pop(&m->forge, &sequence_frame);

    /* Remove events only after constructing the batch. */
    m->tail = (m->tail + records) % QUEUE_SIZE;
    m->queued -= records;

    return true;
}

static LV2_Handle instantiate(
    const LV2_Descriptor* descriptor,
    double rate,
    const char* bundle,
    const LV2_Feature* const* features)
{
    (void)descriptor;
    (void)rate;
    (void)bundle;

    LV2_URID_Map* map = NULL;

    for (int i = 0; features && features[i]; ++i) {
        if (!strcmp(features[i]->URI, LV2_URID__map)) {
            map = (LV2_URID_Map*)features[i]->data;
            break;
        }
    }

    if (!map) return NULL;

    Monitor* m = (Monitor*)calloc(1, sizeof(Monitor));
    if (!m) return NULL;

    m->midi_urid =
        map->map(map->handle, LV2_MIDI__MidiEvent);

    m->patch_set =
        map->map(map->handle, LV2_PATCH__Set);

    m->patch_property =
        map->map(map->handle, LV2_PATCH__property);

    m->patch_value =
        map->map(map->handle, LV2_PATCH__value);

    m->batch_property =
        map->map(map->handle, PLUGIN_URI "#lastMidi");

    lv2_atom_forge_init(&m->forge, map);

    return (LV2_Handle)m;
}

static void connect_port(
    LV2_Handle instance,
    uint32_t port,
    void* data)
{
    Monitor* m = (Monitor*)instance;

    switch (port) {
        case MIDI_IN:
            m->midi = (const LV2_Atom_Sequence*)data;
            break;
        case COUNT:
            m->count = (float*)data;
            break;
        case STATUS:
            m->status = (float*)data;
            break;
        case DATA1:
            m->data1 = (float*)data;
            break;
        case DATA2:
            m->data2 = (float*)data;
            break;
        case NOTIFY:
            m->notify = (LV2_Atom_Sequence*)data;
            break;
        case BATCH_COUNT:
            m->batch_count = (float*)data;
            break;
        default:
            break;
    }
}

static void activate(LV2_Handle instance)
{
    (void)instance;
}


static void run(LV2_Handle instance, uint32_t n_samples)
{
    (void)n_samples;

    Monitor* m = (Monitor*)instance;

    /*
     * The host supplies the Atom output buffer
     * capacity at the start of each run().
     *
     * Save it before writing anything.
     */
    uint32_t capacity = 0;

    if (m->notify) {
        capacity = m->notify->atom.size;
    }

    // ----------------------------------------
    // Process incoming MIDI
    // ----------------------------------------

    if (m->midi) {
        LV2_ATOM_SEQUENCE_FOREACH(m->midi, ev) {

            if (ev->body.type != m->midi_urid ||
                ev->body.size == 0) {
                continue;
            }

            const uint8_t* bytes =
                (const uint8_t*)(ev + 1);

            ++m->num;

            m->last_status = bytes[0];

            m->last_data1 =
                ev->body.size > 1 ? bytes[1] : 0;

            m->last_data2 =
                ev->body.size > 2 ? bytes[2] : 0;

            queue_midi(m, bytes, ev->body.size);
        }
    }

    // ----------------------------------------
    // Write Atom/Patch output
    // ----------------------------------------

    bool batch_written = false;

    if (m->notify &&
        m->queued > 0 &&
        capacity >= MIN_NOTIFY_CAPACITY) {

        // write_batch() reads the host's capacity
        // from notify->atom.size and replaces it
        // with the size of the forged sequence.

        batch_written = write_batch(m);

        if (batch_written) {
            ++m->batches_emitted;
        }
    }

    /*
     * CRITICAL:
     *
     * If no batch was written, explicitly
     * initialise an EMPTY Atom sequence.
     *
     * Never leave atom.size set to the original
     * buffer capacity.
     */
    if (m->notify && !batch_written &&
        capacity >= sizeof(LV2_Atom_Sequence_Body)) {

        m->notify->atom.type = m->forge.Sequence;

        m->notify->atom.size =
            sizeof(LV2_Atom_Sequence_Body);

        m->notify->body.unit = 0;
        m->notify->body.pad = 0;
    }

    // ----------------------------------------
    // Existing numerical control outputs
    // ----------------------------------------

    if (m->count) {
        *m->count = (float)m->num;
    }

    if (m->status) {
        *m->status = (float)m->last_status;
    }

    if (m->data1) {
        *m->data1 = (float)m->last_data1;
    }

    if (m->data2) {
        *m->data2 = (float)m->last_data2;
    }

    // ----------------------------------------
    // New diagnostic output
    // ----------------------------------------

    if (m->batch_count) {
        *m->batch_count =
            (float)m->batches_emitted;
    }
}


static void deactivate(LV2_Handle instance)
{
    (void)instance;
}

static void cleanup(LV2_Handle instance)
{
    free(instance);
}

static const void* extension_data(const char* uri)
{
    (void)uri;
    return NULL;
}

static const LV2_Descriptor descriptor = {
    PLUGIN_URI,
    instantiate,
    connect_port,
    activate,
    run,
    deactivate,
    cleanup,
    extension_data
};

LV2_SYMBOL_EXPORT
const LV2_Descriptor* lv2_descriptor(uint32_t index)
{
    return index == 0 ? &descriptor : NULL;
}
