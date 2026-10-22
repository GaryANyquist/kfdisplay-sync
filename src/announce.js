/*
 * Announces this service on the local network with mDNS / DNS-SD (type "_annaware-sync._tcp", like network printers),
 * so a register's Settings -> KFDisplay sync -> Find KFDisplay PC fills in this PC's address (2026-10-22). It says
 * only the PC's name and port; the sync key is still needed for everything. Windows must let node.exe receive UDP
 * 5353 (setup/install-startup.ps1 adds that rule). Never fatal: the address can always be typed.
 */
import os from 'node:os';

import { Bonjour } from 'bonjour-service';

export const SERVICE_TYPE = 'annaware-sync';

/** Starts announcing; returns a function that stops it. */
export function announce(port, name = `KFDisplay PC (${os.hostname()})`) {
  try {
    const bonjour = new Bonjour({}, (err) => console.error(`${new Date().toISOString()} announce: ${err?.message ?? err}`));
    bonjour.publish({ name, type: SERVICE_TYPE, port });
    return () => bonjour.unpublishAll(() => bonjour.destroy());
  } catch (err) {
    console.error(`${new Date().toISOString()} announce: ${err?.message ?? err}`);
    return () => {};
  }
}
