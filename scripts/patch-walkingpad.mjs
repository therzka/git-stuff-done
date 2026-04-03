#!/usr/bin/env node
/**
 * Post-install patch for walkingpad-js.
 *
 * The KS-BLC2 (KingSmith C2) advertises both FTMS (1826) and standard (FE00)
 * BLE services. walkingpad-js detects FTMS first and uses FTMS commands for
 * speed control — but the C2's FTMS implementation ignores SET_TARGET_SPEED.
 * The standard protocol (used by ph4-walkingpad) works correctly.
 *
 * This script patches the built dist file to:
 *  1. Prefer standard protocol when both FTMS and standard services exist.
 *  2. Always discover standard-service characteristics (so the correct
 *     write/notify chars are used when standard protocol is selected).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = resolve(__dirname, '..', 'node_modules', 'walkingpad-js', 'dist', 'walkingpad-js.js');

if (!existsSync(distPath)) {
  console.log('[patch-walkingpad] walkingpad-js not installed, skipping');
  process.exit(0);
}

let src = readFileSync(distPath, 'utf8');
let patchCount = 0;

// --- Patch 1: detectProtocol — prefer standard when both services exist ---
const oldDetect = `function detectProtocol(serviceUuids) {
  for (const uuid of serviceUuids) {
    if (isFtmsServiceUuid(uuid)) {
      return "ftms";
    }
  }
  return "standard";
}`;

const newDetect = `function detectProtocol(serviceUuids) {
  let hasFtms = false;
  let hasStandard = false;
  for (const uuid of serviceUuids) {
    if (isFtmsServiceUuid(uuid)) hasFtms = true;
    const n = uuid.toLowerCase();
    if (n.includes("fe00") || n.includes("fff0")) hasStandard = true;
  }
  if (hasStandard) return "standard";
  if (hasFtms) return "ftms";
  return "standard";
}`;

if (src.includes(oldDetect)) {
  src = src.replace(oldDetect, newDetect);
  patchCount++;
  console.log('[patch-walkingpad] ✓ Patched detectProtocol (prefer standard)');
} else if (src.includes('hasStandard')) {
  console.log('[patch-walkingpad] detectProtocol already patched');
} else {
  console.warn('[patch-walkingpad] ⚠ Could not find detectProtocol to patch');
}

// --- Patch 2: discoverWalkingPad — always discover standard characteristics ---
const oldDiscover = `if ((uuidMatches(uuid, GATT_STANDARD_SERVICE_FE00) || uuidMatches(uuid, GATT_STANDARD_SERVICE_FFF0)) && (!writeChar || !notifyChar)) {
      for (const c of chars) {
        if (!writeChar && (c.properties.write || c.properties.writeWithoutResponse)) {
          writeChar = c;
        }
        if (!notifyChar && c.properties.notify) {
          notifyChar = c;
        }
      }
    }`;

const newDiscover = `if (uuidMatches(uuid, GATT_STANDARD_SERVICE_FE00) || uuidMatches(uuid, GATT_STANDARD_SERVICE_FFF0)) {
      for (const c of chars) {
        if (c.properties.write || c.properties.writeWithoutResponse) {
          writeChar = c;
        }
        if (c.properties.notify) {
          notifyChar = c;
        }
      }
    }`;

if (src.includes(oldDiscover)) {
  src = src.replace(oldDiscover, newDiscover);
  patchCount++;
  console.log('[patch-walkingpad] ✓ Patched discoverWalkingPad (standard chars override FTMS)');
} else if (!src.includes('&& (!writeChar || !notifyChar)')) {
  console.log('[patch-walkingpad] discoverWalkingPad already patched');
} else {
  console.warn('[patch-walkingpad] ⚠ Could not find discoverWalkingPad to patch');
}

// --- Patch 3: Fix speed command opcode (0x03 → 0x01) ---
// walkingpad-js uses opcode 3 for SET_SPEED but the actual KingSmith protocol
// (confirmed by ph4-walkingpad) uses opcode 1. Opcode 3 is a config command.
const oldSpeedOp = 'var STANDARD_CMD_SET_SPEED_OP = 3;';
const newSpeedOp = 'var STANDARD_CMD_SET_SPEED_OP = 1;';

if (src.includes(oldSpeedOp)) {
  src = src.replace(oldSpeedOp, newSpeedOp);
  patchCount++;
  console.log('[patch-walkingpad] ✓ Patched STANDARD_CMD_SET_SPEED_OP (3 → 1)');
} else if (src.includes('STANDARD_CMD_SET_SPEED_OP = 1')) {
  console.log('[patch-walkingpad] STANDARD_CMD_SET_SPEED_OP already patched');
} else {
  console.warn('[patch-walkingpad] ⚠ Could not find STANDARD_CMD_SET_SPEED_OP to patch');
}

if (patchCount > 0) {
  writeFileSync(distPath, src, 'utf8');
  console.log(`[patch-walkingpad] Wrote ${patchCount} patch(es) to ${distPath}`);
} else {
  console.log('[patch-walkingpad] No patches needed');
}
