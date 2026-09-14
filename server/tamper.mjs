/**
 * Deliberately corrupt a COPY of a CooL receipt so verification fails.
 * Never mutate the original object. Matches the official CooL hackathon demo:
 * flip one hex digit of record.event.metadata_hash.
 */
export function tamperEvidenceCopy(evidence) {
  const copy = JSON.parse(JSON.stringify(evidence));
  const hash = copy?.record?.event?.metadata_hash;
  if (typeof hash !== "string" || hash.length === 0) {
    throw new Error("Cannot tamper: receipt has no metadata_hash to modify.");
  }
  const last = hash.slice(-1);
  const flipped = last === "0" ? "1" : "0";
  copy.record.event.metadata_hash = hash.slice(0, -1) + flipped;
  return copy;
}
