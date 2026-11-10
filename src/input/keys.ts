import { KeyLetters } from "../types.js";

/** Control characters produced from the configured letters. */
export interface ResolvedKeys {
  /** Ctrl combination that arms the menu. */
  menu: string;
  /** Ctrl combination that exits. */
  exit: string;
  /** Ctrl combination that hard-resets the chip. */
  reset: string;
  /** Ctrl combination that requests a flash. */
  flash: string;
  /** Ctrl combination that requests an app flash. Plain `a` / `A` also work inside the menu. */
  appFlash: string;
  /** Ctrl combination that requests a full flash. Plain `e` / `E` also work inside the menu. */
  flashAll: string;
  /** Ctrl combination that toggles chip output. */
  output: string;
  /** Ctrl combination that toggles log capture. */
  log: string;
  /** Ctrl combination that toggles timestamps. Plain `i` / `I` also work inside the menu. */
  timestamps: string;
  /** Ctrl combination that resets into the bootloader. */
  bootloader: string;
  /** Ctrl combination that exits from the menu. Plain `x` / `X` also work inside the menu. */
  exitMenu: string;
  /** When true, the control bytes above run without the menu key. Plain letters still need it. */
  skipMenu: boolean;
}

const DEFAULT_LETTERS = {
  menuKey: "T",
  exitKey: "]",
  chipResetKey: "R",
  flashKey: "F",
  appFlashKey: "A",
  flashAllKey: "E",
  outputKey: "Y",
  logKey: "L",
  timestampKey: "I",
  bootloaderKey: "P",
  exitMenuKey: "X",
};

/**
 * Convert a menu letter to the C0 control byte esp-idf-monitor matches.
 * Unsupported letters fall back to the default.
 * @param {string | undefined} letter Configured letter.
 * @param {string} fallback Letter used when `letter` is missing or not in `A-Z` / `[\]^_`.
 * @returns {string} One control character.
 */
export function keyToControl(letter: string | undefined, fallback: string): string {
  const chosen = letter && letter.length === 1 ? letter : fallback;
  let code = chosen.toUpperCase().charCodeAt(0) - "@".charCodeAt(0);
  if (code < 1 || code > 32) {
    code = fallback.toUpperCase().charCodeAt(0) - "@".charCodeAt(0);
  }
  return String.fromCharCode(code);
}

/**
 * Resolve letters to the control characters the parser compares against.
 * @param {KeyLetters | undefined} letters Partial overrides.
 * @returns {ResolvedKeys} Control characters and the skip-menu flag.
 */
export function resolveKeys(letters: KeyLetters | undefined): ResolvedKeys {
  const source = letters ?? {};
  return {
    menu: keyToControl(source.menuKey, DEFAULT_LETTERS.menuKey),
    exit: keyToControl(source.exitKey, DEFAULT_LETTERS.exitKey),
    reset: keyToControl(source.chipResetKey, DEFAULT_LETTERS.chipResetKey),
    flash: keyToControl(source.flashKey, DEFAULT_LETTERS.flashKey),
    appFlash: keyToControl(source.appFlashKey, DEFAULT_LETTERS.appFlashKey),
    flashAll: keyToControl(source.flashAllKey, DEFAULT_LETTERS.flashAllKey),
    output: keyToControl(source.outputKey, DEFAULT_LETTERS.outputKey),
    log: keyToControl(source.logKey, DEFAULT_LETTERS.logKey),
    timestamps: keyToControl(source.timestampKey, DEFAULT_LETTERS.timestampKey),
    bootloader: keyToControl(source.bootloaderKey, DEFAULT_LETTERS.bootloaderKey),
    exitMenu: keyToControl(source.exitMenuKey, DEFAULT_LETTERS.exitMenuKey),
    skipMenu: source.skipMenuKey === true,
  };
}

/**
 * Human description of a key, in the style of miniterm (`Ctrl+T`).
 * @param {string} key One character.
 * @returns {string} Printable description.
 */
export function describeKey(key: string): string {
  const code = key.charCodeAt(0);
  if (code >= 1 && code <= 31) {
    return `Ctrl+${String.fromCharCode(code + 64)}`;
  }
  return key;
}
