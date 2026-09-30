import { useEffect, useRef, useState } from 'react';

/**
 * A test/probe result that belongs to the input it was produced for.
 *
 * A probe is slow (a TLS handshake, an IMAP login, an S3 round-trip) and the form stays
 * editable while it runs. Setting the result when the request LANDS attached its answer to
 * whatever the form held by then: "Connection OK" under a bucket, URL or issuer nobody tested
 * (platform cards #522/#524, found again on the workspace cards). Keyed by the input it tested,
 * a result counts only while the form still holds exactly that input.
 *
 * `currentKey` is the serialised input the form holds NOW; pass the same serialisation to `keep`
 * for the input the probe was sent with. `isCurrent` answers the same question for side effects
 * (an alert) that fire once at landing rather than rendering from state.
 */
export const useResultFor = <T>(currentKey: string) => {
  const [record, setRecord] = useState<{ value: T; key: string } | null>(null);
  const latestKey = useRef(currentKey);
  useEffect(() => {
    latestKey.current = currentKey;
  }, [currentKey]);

  return {
    result: record?.key === currentKey ? record.value : null,
    keep: (value: T, key: string) => setRecord({ value, key }),
    clear: () => setRecord(null),
    isCurrent: (key: string) => latestKey.current === key,
  };
};
