/**
 * boss-midi-parser.ts - Minimal MIDI note extraction for boss attack schedules.
 *
 * Adapted from ModSynthTD's lightweight Type-0/Type-1 parser, but keeps only
 * normalized note events and tempo timing. No game-specific wave/audio systems.
 */

export interface BossMidiNoteEvent {
  timeMs: number;
  durationMs: number;
  beat: number;
  durationBeats: number;
  note: number;
  velocity: number;
  channel: number;
  trackName?: string;
  instrument?: number;
}

interface PendingNote {
  tick: number;
  velocity: number;
  trackName?: string;
  instrument?: number;
}

interface TempoEvent {
  tick: number;
  usPerQuarter: number;
}

const DEFAULT_US_PER_QUARTER = 500_000;

function readAscii(bytes: Uint8Array, start: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[start + i] ?? 0);
  return out;
}

function readVlq(bytes: Uint8Array, offset: number, limit: number): { value: number; bytesRead: number } {
  let value = 0;
  let bytesRead = 0;
  while (offset + bytesRead < limit && bytesRead < 4) {
    const b = bytes[offset + bytesRead];
    value = (value << 7) | (b & 0x7f);
    bytesRead++;
    if ((b & 0x80) === 0) break;
  }
  return { value, bytesRead };
}

function ticksToMs(tick: number, tempos: TempoEvent[], ppq: number): number {
  let ms = 0;
  let prevTick = 0;
  let tempo = DEFAULT_US_PER_QUARTER;
  for (const event of tempos) {
    if (event.tick > tick) break;
    ms += ((event.tick - prevTick) * tempo) / ppq / 1000;
    prevTick = event.tick;
    tempo = event.usPerQuarter;
  }
  ms += ((tick - prevTick) * tempo) / ppq / 1000;
  return ms;
}

export function parseBossMidi(buffer: ArrayBuffer): BossMidiNoteEvent[] {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (bytes.length < 14 || readAscii(bytes, 0, 4) !== 'MThd') {
    throw new Error('Not a MIDI file (missing MThd)');
  }
  const headerLen = view.getUint32(4, false);
  const numTracks = view.getUint16(10, false);
  const division = view.getUint16(12, false);
  if ((division & 0x8000) !== 0) throw new Error('SMPTE MIDI timecode is not supported');
  const ppq = division;
  const tempos: TempoEvent[] = [{ tick: 0, usPerQuarter: DEFAULT_US_PER_QUARTER }];
  const rawNotes: Array<{
    startTick: number; endTick: number; note: number; velocity: number; channel: number; trackName?: string; instrument?: number;
  }> = [];

  let fileOffset = 8 + headerLen;
  for (let trackIdx = 0; trackIdx < numTracks; trackIdx++) {
    if (fileOffset + 8 > bytes.length) break;
    const chunkId = readAscii(bytes, fileOffset, 4);
    const chunkLen = view.getUint32(fileOffset + 4, false);
    const trackEnd = Math.min(bytes.length, fileOffset + 8 + chunkLen);
    fileOffset += 8;
    if (chunkId !== 'MTrk') { fileOffset = trackEnd; continue; }

    let absTick = 0;
    let lastStatus = 0;
    let trackName: string | undefined;
    const instruments = new Map<number, number>();
    const pending = new Map<number, PendingNote>();

    while (fileOffset < trackEnd) {
      const delta = readVlq(bytes, fileOffset, trackEnd);
      fileOffset += delta.bytesRead;
      absTick += delta.value;
      if (fileOffset >= trackEnd) break;

      let status: number;
      if ((bytes[fileOffset] & 0x80) !== 0) {
        status = bytes[fileOffset++];
        if (status < 0xf0) lastStatus = status;
      } else {
        status = lastStatus;
      }
      if (status === 0) break;

      const type = status & 0xf0;
      const channel = status & 0x0f;
      if (status === 0xff) {
        const metaType = bytes[fileOffset++];
        const len = readVlq(bytes, fileOffset, trackEnd);
        fileOffset += len.bytesRead;
        if (metaType === 0x03) trackName = readAscii(bytes, fileOffset, len.value);
        if (metaType === 0x51 && len.value >= 3) {
          const usPerQuarter = (bytes[fileOffset] << 16) | (bytes[fileOffset + 1] << 8) | bytes[fileOffset + 2];
          tempos.push({ tick: absTick, usPerQuarter });
        }
        fileOffset += len.value;
        lastStatus = 0;
      } else if (status === 0xf0 || status === 0xf7) {
        const len = readVlq(bytes, fileOffset, trackEnd);
        fileOffset += len.bytesRead + len.value;
        lastStatus = 0;
      } else if (type === 0x80 || type === 0x90) {
        const note = bytes[fileOffset++];
        const velocity = bytes[fileOffset++];
        const key = note * 16 + channel;
        if (type === 0x80 || velocity === 0) {
          const on = pending.get(key);
          if (on && absTick > on.tick) {
            rawNotes.push({
              startTick: on.tick, endTick: absTick, note, velocity: on.velocity, channel,
              trackName: on.trackName, instrument: on.instrument,
            });
          }
          pending.delete(key);
        } else {
          pending.set(key, { tick: absTick, velocity, trackName, instrument: instruments.get(channel) });
        }
      } else if (type === 0xc0 || type === 0xd0) {
        const value = bytes[fileOffset++];
        if (type === 0xc0) instruments.set(channel, value);
      } else if (type === 0xa0 || type === 0xb0 || type === 0xe0) {
        fileOffset += 2;
      } else {
        break;
      }
    }
    fileOffset = trackEnd;
  }

  tempos.sort((a, b) => a.tick - b.tick);
  return rawNotes
    .map((n) => {
      const timeMs = ticksToMs(n.startTick, tempos, ppq);
      const endMs = ticksToMs(n.endTick, tempos, ppq);
      return {
        timeMs,
        durationMs: Math.max(1, endMs - timeMs),
        beat: n.startTick / ppq,
        durationBeats: (n.endTick - n.startTick) / ppq,
        note: n.note,
        velocity: n.velocity,
        channel: n.channel,
        trackName: n.trackName,
        instrument: n.instrument,
      };
    })
    .sort((a, b) => a.timeMs - b.timeMs || a.note - b.note);
}
