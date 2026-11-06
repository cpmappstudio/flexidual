/**
 * A 42-second MP4 container with one AVC track and one fragmented sample.
 * Generated with MP4Box's public init/addTrack/addSample/getBuffer APIs.
 * Keep the bytes static: importing the full writer in parser tests also registers
 * its box parsers globally, masking failures in the restricted `simple` build.
 * This fixture exercises container metadata, not video decoding.
 */
export function trackedMp4() {
  return new Uint8Array(
    Buffer.from(
      "AAAAFGZ0eXBpc280AAAAAGlzbzQAAAJobW9vdgAAAChtdmV4AAAAIHRyZXgAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAABsbXZoZAAAAAAAAAAAAAAAAAAAA+gAAKQQAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAHMdHJhawAAAFx0a2hkAAAABwAAAAAAAAAAAAAAAQAAAAAAAKQQAAAAAAAAAAAAAAAAAQAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAFAAAABQAAAAAABaG1kaWEAAAAgbWRoZAAAAAAAAAAAAAAAAAAAA+gAAKQQAAAAAAAAAD1oZGxyAAAAAAAAAAB2aWRlAAAAAAAAAAAAAAAAVHJhY2sgY3JlYXRlZCB3aXRoIE1QNEJveC5qcwAAAAARZWxuZwAAAABmci1GUgAAAPJtaW5mAAAAFHZtaGQAAAAAAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAACyc3RibAAAAGZzdHNkAAAAAAAAAAEAAABWYXZjMQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAFAAUAASAAAAEgAAAAAAAAAAQ9hdmMxIENvbXByZXNzb3IAAAAAAAAAAAAAAAAAAAAAABj//wAAABBzdHRzAAAAAAAAAAAAAAAQc3RzYwAAAAAAAAAAAAAAEHN0Y28AAAAAAAAAAAAAABRzdHN6AAAAAAAAAAAAAAAAAAAAZG1vb2YAAAAQbWZoZAAAAAAAAAABAAAATHRyYWYAAAAQdGZoZAACAAAAAAABAAAAEHRmZHQAAAAAAAAAAAAAACR0cnVuAAAPAQAAAAEAAABsAACkEAAAAAUCAAAAAAAAAAAAAA1tZGF0AAAAAWU=",
      "base64",
    ),
  );
}

/** Untrusted sample counts must never be expanded just to read the duration. */
export function sampleHeavyMp4() {
  const bytes = trackedMp4();
  const data = Buffer.from(bytes.buffer);
  const sizeTable = data.indexOf("stsz");
  data.writeUInt32BE(1, sizeTable + 8);
  data.writeUInt32BE(1_500_000, sizeTable + 12);
  return bytes;
}

/** No usable duration: a zero movie timescale cannot be used for percentages. */
export function invalidDurationMp4() {
  const bytes = trackedMp4();
  const data = Buffer.from(bytes.buffer);
  data.writeUInt32BE(0, data.indexOf("mvhd") + 16);
  return bytes;
}
