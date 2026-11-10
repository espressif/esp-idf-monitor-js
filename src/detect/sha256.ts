const SHA_LINE = /ELF file SHA256:\s+([a-fA-F0-9]+)/;

/**
 * Pull the flashed digest out of a chip line.
 * @param {string} line Chip line.
 * @returns {string | null} The hex digest, or null when the line is not the SHA-256 banner.
 */
export function flashedSha256(line: string): string | null {
  const match = SHA_LINE.exec(line);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Whether the flashed digest is contained in any local ELF digest.
 * esp-idf-monitor hashes each file and checks that the printed digest is a substring.
 * @param {string} flashed Digest printed by the chip.
 * @param {string[]} built Digests of the loaded ELF files.
 * @returns {{ match: boolean, built?: string }} The first local digest that contains `flashed`.
 */
export function compareSha256(flashed: string, built: string[]): { match: boolean; built?: string } {
  const needle = flashed.toLowerCase();
  const hit = built.find((digest) => digest.toLowerCase().includes(needle));
  return hit ? { match: true, built: hit } : { match: false };
}
