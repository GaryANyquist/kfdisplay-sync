/*
 * Lets registers find this PC (2026-10-22), two ways, so a register's Settings -> KFDisplay sync -> Find KFDisplay PC
 * fills in the address:
 *  - mDNS / DNS-SD (type "_annaware-sync._tcp", like network printers), which works when the tablets and this PC are on
 *    the same kind of link;
 *  - a UDP broadcast answer on FIND_PORT, for networks whose access point doesn't pass multicast between Wi-Fi and
 *    wired (Gary's): a register broadcasts "annaware-find annaware-sync" and this answers it directly with the name
 *    and port. Broadcasts cross where multicast doesn't (DHCP works the same way).
 * Both say only the PC's name and port; the sync key is still needed for everything. Windows must let node.exe
 * receive UDP 5353 and FIND_PORT (setup/install-startup.ps1 adds those rules). Never fatal: the address can be typed.
 */
import dgram from 'node:dgram';
import os from 'node:os';

import { Bonjour } from 'bonjour-service';

export const SERVICE_TYPE = 'annaware-sync';
export const FIND_PORT = 8789;
export const FIND_REQUEST = `annaware-find ${SERVICE_TYPE}`;

const log = (what, err) => console.error(`${new Date().toISOString()} ${what}: ${err?.message ?? err}`);

/** The reply to a find request, or null when the request isn't one for this service. Exported for the tests. */
export function findReply(request, info) {
  if (String(request).trim() !== FIND_REQUEST) return null;
  return JSON.stringify({ service: SERVICE_TYPE, name: info.name, port: info.port });
}

/** Starts announcing; returns a function that stops it. */
export function announce(port, name = `KFDisplay PC (${os.hostname()})`, findPort = FIND_PORT) {
  const stops = [];
  try {
    const bonjour = new Bonjour({}, (err) => log('announce', err));
    bonjour.publish({ name, type: SERVICE_TYPE, port });
    stops.push(() => bonjour.unpublishAll(() => bonjour.destroy()));
  } catch (err) {
    log('announce', err);
  }
  try {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    socket.on('message', (msg, from) => {
      const reply = findReply(msg.toString('utf8'), { name, port });
      if (reply) socket.send(reply, from.port, from.address);
    });
    socket.on('error', (err) => log('find', err));
    socket.bind(findPort);
    stops.push(() => socket.close());
  } catch (err) {
    log('find', err);
  }
  return () => stops.forEach((s) => s());
}
