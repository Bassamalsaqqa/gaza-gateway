import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {writeZipArchive} from '../../tools/hostpapa-release/production-upgrade/ZipKit.mjs';

test('private delivery ZIP declares Unix owner-only file permissions', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gaza-private-kit-'));
  try {
    const archive = path.join(directory, 'kit.zip');
    writeZipArchive([{path:'production-upgrade-runner.php', content:Buffer.from('<?php // synthetic')}], archive);
    const bytes = fs.readFileSync(archive);
    const central = bytes.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
    assert.ok(central > 0);
    assert.equal(bytes.readUInt16LE(central + 4) >> 8, 3);
    assert.equal(bytes.readUInt32LE(central + 38) >>> 16, 0o100600);
  } finally {
    fs.rmSync(directory, {recursive:true});
  }
});
