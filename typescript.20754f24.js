/**
 * Tiny typed pub/sub. Deliberately not Node's `events`, so the browser bundle needs no polyfill.
 */ class $c1309904089df315$export$5a07c6a245aa8bb4 {
    constructor(){
        this.handlers = new Map();
    }
    /**
     * Subscribe to one event.
     * @param {keyof Events} event Event id.
     * @param {Function} handler Called with the payload.
     * @returns {void}
     */ on(event, handler) {
        var _a;
        const set = (_a = this.handlers.get(event)) !== null && _a !== void 0 ? _a : new Set();
        set.add(handler);
        this.handlers.set(event, set);
    }
    /**
     * Remove a subscription. The handler must be the same function that was passed to {@link on}.
     * @param {keyof Events} event Event id.
     * @param {Function} handler Handler to remove.
     * @returns {void}
     */ off(event, handler) {
        var _a;
        (_a = this.handlers.get(event)) === null || _a === void 0 || _a.delete(handler);
    }
    /**
     * Subscribe to the next occurrence only.
     * @param {keyof Events} event Event id.
     * @param {Function} handler Called once with the payload.
     * @returns {void}
     */ once(event, handler) {
        const wrapped = (payload)=>{
            this.off(event, wrapped);
            handler(payload);
        };
        this.on(event, wrapped);
    }
    /**
     * Call every subscriber. Exceptions from one handler do not stop the others.
     * @param {keyof Events} event Event id.
     * @param {Events[K]} payload Event payload.
     * @returns {void}
     */ emit(event, payload) {
        const set = this.handlers.get(event);
        if (!set) return;
        for (const handler of [
            ...set
        ])handler(payload);
    }
}


const $3a995f8f333ef543$var$ADDRESS = /0x[0-9a-fA-F]{8}/g;
class $3a995f8f333ef543$export$760ec62712ebcab {
    /**
     * @param {LoadedElf[]} elves Application ELFs followed by the ROM ELF, if any.
     */ constructor(elves){
        this.elves = elves;
        this.tail = "";
    }
    /**
     * Scan text, optionally keeping the last 9 characters for the next unfinished fragment.
     * @param {string} text New text.
     * @param {boolean} finished When true, the tail is included and then cleared.
     * @returns {AddressFrame[]} Resolved addresses in the portion that is safe to scan.
     */ push(text, finished) {
        const combined = this.tail + text;
        if (!finished) {
            const limit = Math.max(0, combined.length - 9);
            this.tail = combined.slice(limit);
            return this.addressesIn(combined.slice(0, limit));
        }
        this.tail = "";
        return this.addressesIn(combined);
    }
    /**
     * Resolve every `0x` word of exactly 8 hex digits.
     * @param {string} text Chip text.
     * @returns {AddressFrame[]} Frames whose address landed in an executable section.
     */ addressesIn(text) {
        const frames = [];
        for (const match of text.matchAll($3a995f8f333ef543$var$ADDRESS)){
            const address = Number.parseInt(match[0], 16);
            const frame = this.lookup(address);
            if (frame) frames.push(frame);
        }
        return frames;
    }
    /**
     * Look up one address.
     * @param {number} address Program counter.
     * @returns {AddressFrame | null} The frame, or null when no executable section contains it.
     */ lookup(address) {
        for (const elf of this.elves){
            const hit = elf.ranges.some((range)=>address >= range.start && address < range.end);
            if (!hit) continue;
            const containing = elf.symbols.filter((symbol)=>symbol.size > 0 && address >= symbol.value && address < symbol.value + symbol.size).sort((left, right)=>right.value - left.value)[0];
            const nearest = elf.symbols.filter((symbol)=>symbol.value <= address).sort((left, right)=>right.value - left.value)[0];
            const symbol = containing !== null && containing !== void 0 ? containing : nearest;
            if (symbol) {
                const location = elf.rom ? undefined : $3a995f8f333ef543$var$lineAt(elf.lines, address);
                return {
                    address: address,
                    func: symbol.name,
                    path: elf.rom ? "ROM" : location === null || location === void 0 ? void 0 : location.path,
                    line: location === null || location === void 0 ? void 0 : location.line
                };
            }
            if (elf.rom) return {
                address: address,
                func: "??",
                path: "ROM"
            };
            return null;
        }
        return null;
    }
}
/**
 * Find the line-table row that covers an address.
 * @param {LineInterval[]} lines Intervals ordered by start address.
 * @param {number} address Program counter.
 * @returns {LineInterval | undefined} The covering row, when the address falls in one.
 */ function $3a995f8f333ef543$var$lineAt(lines, address) {
    let low = 0;
    let high = lines.length - 1;
    let found;
    while(low <= high){
        const mid = Math.floor((low + high) / 2);
        const row = lines[mid];
        if (row.start <= address) {
            found = row;
            low = mid + 1;
        } else high = mid - 1;
    }
    if (found && address < found.end) return found;
    return undefined;
}
function $3a995f8f333ef543$export$9ab766ce7f4c1f3c(frame) {
    const address = `0x${frame.address.toString(16).padStart(8, "0")}`;
    if (frame.path && frame.line !== undefined) return `${address}: ${frame.func} at ${frame.path}:${frame.line}`;
    if (frame.path) return `${address}: ${frame.func} at ${frame.path}`;
    return `${address}: ${frame.func}`;
}


const $683d3888e3057d3e$var$DW_AT_STMT_LIST = 0x10;
const $683d3888e3057d3e$var$DW_AT_COMP_DIR = 0x1b;
const $683d3888e3057d3e$var$DW_FORM_ADDR = 0x01;
const $683d3888e3057d3e$var$DW_FORM_BLOCK2 = 0x03;
const $683d3888e3057d3e$var$DW_FORM_BLOCK4 = 0x04;
const $683d3888e3057d3e$var$DW_FORM_DATA2 = 0x05;
const $683d3888e3057d3e$var$DW_FORM_DATA4 = 0x06;
const $683d3888e3057d3e$var$DW_FORM_DATA8 = 0x07;
const $683d3888e3057d3e$var$DW_FORM_STRING = 0x08;
const $683d3888e3057d3e$var$DW_FORM_BLOCK = 0x09;
const $683d3888e3057d3e$var$DW_FORM_BLOCK1 = 0x0a;
const $683d3888e3057d3e$var$DW_FORM_DATA1 = 0x0b;
const $683d3888e3057d3e$var$DW_FORM_FLAG = 0x0c;
const $683d3888e3057d3e$var$DW_FORM_SDATA = 0x0d;
const $683d3888e3057d3e$var$DW_FORM_STRP = 0x0e;
const $683d3888e3057d3e$var$DW_FORM_UDATA = 0x0f;
const $683d3888e3057d3e$var$DW_FORM_REF_ADDR = 0x10;
const $683d3888e3057d3e$var$DW_FORM_REF1 = 0x11;
const $683d3888e3057d3e$var$DW_FORM_REF2 = 0x12;
const $683d3888e3057d3e$var$DW_FORM_REF4 = 0x13;
const $683d3888e3057d3e$var$DW_FORM_REF8 = 0x14;
const $683d3888e3057d3e$var$DW_FORM_REF_UDATA = 0x15;
const $683d3888e3057d3e$var$DW_FORM_INDIRECT = 0x16;
const $683d3888e3057d3e$var$DW_FORM_SEC_OFFSET = 0x17;
const $683d3888e3057d3e$var$DW_FORM_EXPRLOC = 0x18;
const $683d3888e3057d3e$var$DW_FORM_FLAG_PRESENT = 0x19;
const $683d3888e3057d3e$var$DW_FORM_STRX = 0x1a;
const $683d3888e3057d3e$var$DW_FORM_ADDRX = 0x1b;
const $683d3888e3057d3e$var$DW_FORM_REF_SUP4 = 0x1c;
const $683d3888e3057d3e$var$DW_FORM_STRP_SUP = 0x1d;
const $683d3888e3057d3e$var$DW_FORM_DATA16 = 0x1e;
const $683d3888e3057d3e$var$DW_FORM_LINE_STRP = 0x1f;
const $683d3888e3057d3e$var$DW_FORM_REF_SIG8 = 0x20;
const $683d3888e3057d3e$var$DW_FORM_IMPLICIT_CONST = 0x21;
const $683d3888e3057d3e$var$DW_FORM_LOCLISTX = 0x22;
const $683d3888e3057d3e$var$DW_FORM_RNGLISTX = 0x23;
const $683d3888e3057d3e$var$DW_FORM_REF_SUP8 = 0x24;
const $683d3888e3057d3e$var$DW_FORM_STRX1 = 0x25;
const $683d3888e3057d3e$var$DW_FORM_STRX2 = 0x26;
const $683d3888e3057d3e$var$DW_FORM_STRX3 = 0x27;
const $683d3888e3057d3e$var$DW_FORM_STRX4 = 0x28;
const $683d3888e3057d3e$var$DW_FORM_ADDRX1 = 0x29;
const $683d3888e3057d3e$var$DW_FORM_ADDRX2 = 0x2a;
const $683d3888e3057d3e$var$DW_FORM_ADDRX3 = 0x2b;
const $683d3888e3057d3e$var$DW_FORM_ADDRX4 = 0x2c;
const $683d3888e3057d3e$var$DW_LNCT_PATH = 0x1;
const $683d3888e3057d3e$var$DW_LNCT_DIRECTORY_INDEX = 0x2;
const $683d3888e3057d3e$var$DW_LNS_COPY = 1;
const $683d3888e3057d3e$var$DW_LNS_ADVANCE_PC = 2;
const $683d3888e3057d3e$var$DW_LNS_ADVANCE_LINE = 3;
const $683d3888e3057d3e$var$DW_LNS_SET_FILE = 4;
const $683d3888e3057d3e$var$DW_LNS_SET_COLUMN = 5;
const $683d3888e3057d3e$var$DW_LNS_NEGATE_STMT = 6;
const $683d3888e3057d3e$var$DW_LNS_SET_BASIC_BLOCK = 7;
const $683d3888e3057d3e$var$DW_LNS_CONST_ADD_PC = 8;
const $683d3888e3057d3e$var$DW_LNS_FIXED_ADVANCE_PC = 9;
const $683d3888e3057d3e$var$DW_LNS_SET_PROLOGUE_END = 10;
const $683d3888e3057d3e$var$DW_LNS_SET_EPILOGUE_BEGIN = 11;
const $683d3888e3057d3e$var$DW_LNS_SET_ISA = 12;
const $683d3888e3057d3e$var$DW_LNE_END_SEQUENCE = 1;
const $683d3888e3057d3e$var$DW_LNE_SET_ADDRESS = 2;
const $683d3888e3057d3e$var$DW_LNE_DEFINE_FILE = 3;
const $683d3888e3057d3e$var$DW_LNE_SET_DISCRIMINATOR = 4;
function $683d3888e3057d3e$export$97756d394f96f606(bytes) {
    try {
        return $683d3888e3057d3e$var$collectLines(bytes);
    } catch  {
        return [];
    }
}
/**
 * Walk every line-number program in the image.
 * @param {Uint8Array} bytes ELF image.
 * @returns {LineInterval[]} Parsed intervals. Malformed units are skipped.
 */ function $683d3888e3057d3e$var$collectLines(bytes) {
    var _a;
    const image = $683d3888e3057d3e$var$elfLayout(bytes);
    if (!image) return [];
    const line = image.sections.get(".debug_line");
    if (!line || line.size <= 0) return [];
    const strings = image.sections.get(".debug_str");
    const lineStrings = image.sections.get(".debug_line_str");
    let directories = new Map();
    try {
        directories = $683d3888e3057d3e$var$compilationDirectories(bytes, image.little, image.sections);
    } catch  {
        directories = new Map();
    }
    const cursor = new $683d3888e3057d3e$var$Cursor(bytes, image.little, line.offset, line.offset + line.size);
    const intervals = [];
    while(cursor.offset + 4 <= cursor.limit){
        const unitStart = cursor.offset;
        const length = cursor.u32();
        if (length === 0xffffffff) {
            const wide = cursor.u64();
            if (!Number.isSafeInteger(wide) || unitStart + 12 + wide > cursor.limit) break;
            cursor.offset = unitStart + 12 + wide;
            continue;
        }
        const unitEnd = unitStart + 4 + length;
        if (length < 4 || unitEnd > cursor.limit) break;
        const saved = cursor.limit;
        cursor.limit = unitEnd;
        try {
            const relative = unitStart - line.offset;
            $683d3888e3057d3e$var$parseLineUnit(cursor, image.addressSize, (_a = directories.get(relative)) !== null && _a !== void 0 ? _a : "", bytes, strings, lineStrings, intervals);
        } catch  {
        // This compilation unit does not contribute locations.
        }
        cursor.limit = saved;
        cursor.offset = unitEnd;
    }
    return $683d3888e3057d3e$var$orderLines(intervals);
}
/**
 * Parse one DWARF 4 or DWARF 5 line-number unit.
 * @param {Cursor} cursor Positioned just after the unit length.
 * @param {number} elfAddressSize Address width of the ELF, used by DWARF 4.
 * @param {string} compDir Compilation directory for DWARF 4 directory index 0.
 * @param {Uint8Array} bytes ELF bytes, for string sections.
 * @param {Slice | undefined} strings `.debug_str`, when present.
 * @param {Slice | undefined} lineStrings `.debug_line_str`, when present.
 * @param {LineInterval[]} intervals Rows appended for this unit.
 * @returns {void}
 */ function $683d3888e3057d3e$var$parseLineUnit(cursor, elfAddressSize, compDir, bytes, strings, lineStrings, intervals) {
    const version = cursor.u16();
    let addressSize = elfAddressSize;
    let segmentSize = 0;
    if (version === 5) {
        addressSize = cursor.u8();
        segmentSize = cursor.u8();
    } else if (version !== 4) return;
    const headerLength = cursor.u32();
    const programStart = cursor.offset + headerLength;
    if (programStart > cursor.limit) throw new Error("line header overruns its unit");
    const minInstruction = cursor.u8() || 1;
    const maxOperations = cursor.u8() || 1;
    const defaultIsStmt = cursor.u8() !== 0;
    const lineBase = cursor.s8();
    const lineRange = cursor.u8();
    const opcodeBase = cursor.u8();
    if (lineRange === 0 || opcodeBase < 1 || programStart < cursor.offset) throw new Error("line header is not usable");
    const operandCounts = [];
    for(let index = 1; index < opcodeBase; index += 1)operandCounts.push(cursor.u8());
    const includeDirs = [];
    const files = [];
    if (version === 4) {
        includeDirs.push(compDir);
        while(cursor.offset < programStart && cursor.peek() !== 0)includeDirs.push(cursor.cstring());
        cursor.u8();
        files.push({
            name: "",
            directory: 0
        });
        while(cursor.offset < programStart && cursor.peek() !== 0){
            const name = cursor.cstring();
            const directory = cursor.uleb();
            cursor.uleb();
            cursor.uleb();
            files.push({
                name: name,
                directory: directory
            });
        }
        cursor.u8();
    } else {
        $683d3888e3057d3e$var$readEntries(cursor, addressSize, bytes, strings, lineStrings, true, includeDirs, files);
        $683d3888e3057d3e$var$readEntries(cursor, addressSize, bytes, strings, lineStrings, false, includeDirs, files);
    }
    if (cursor.offset > programStart) throw new Error("line header does not match its length");
    cursor.offset = programStart;
    $683d3888e3057d3e$var$runProgram(cursor, {
        version: version,
        addressSize: addressSize,
        segmentSize: segmentSize,
        minInstruction: minInstruction,
        maxOperations: maxOperations,
        defaultIsStmt: defaultIsStmt,
        lineBase: lineBase,
        lineRange: lineRange,
        opcodeBase: opcodeBase,
        operandCounts: operandCounts,
        directories: includeDirs,
        files: files
    }, intervals);
}
/**
 * Execute a line-number program and append one interval per emitted row.
 * @param {Cursor} cursor Start of the opcode stream.
 * @param {ProgramHeader} header Registers and file table for this unit.
 * @param {LineInterval[]} intervals Destination.
 * @returns {void}
 */ function $683d3888e3057d3e$var$runProgram(cursor, header, intervals) {
    var _a;
    const reset = ()=>({
            address: 0,
            opIndex: 0,
            file: header.version >= 5 ? 0 : 1,
            line: 1
        });
    let state = reset();
    let open = null;
    const advance = (operationAdvance)=>{
        state.address += header.minInstruction * Math.floor((state.opIndex + operationAdvance) / header.maxOperations);
        state.opIndex = (state.opIndex + operationAdvance) % header.maxOperations;
    };
    const emit = (endSequence)=>{
        if (open && state.address > open.address) {
            const path = $683d3888e3057d3e$var$sourcePath(header, open.file);
            if (path) intervals.push({
                start: open.address,
                end: state.address,
                path: path,
                line: open.line
            });
        }
        open = endSequence ? null : {
            address: state.address,
            opIndex: state.opIndex,
            file: state.file,
            line: state.line
        };
    };
    while(cursor.offset < cursor.limit){
        const opcode = cursor.u8();
        if (opcode === 0) {
            const length = cursor.uleb();
            const extendedEnd = cursor.offset + length;
            if (extendedEnd > cursor.limit) throw new Error("extended opcode overruns its unit");
            const extended = cursor.u8();
            if (extended === $683d3888e3057d3e$var$DW_LNE_END_SEQUENCE) {
                emit(true);
                state = reset();
            } else if (extended === $683d3888e3057d3e$var$DW_LNE_SET_ADDRESS) {
                if (header.segmentSize) cursor.skip(header.segmentSize);
                state.address = cursor.address(header.addressSize);
                state.opIndex = 0;
            } else if (extended === $683d3888e3057d3e$var$DW_LNE_DEFINE_FILE) {
                const name = cursor.cstring();
                const directory = cursor.uleb();
                cursor.uleb();
                cursor.uleb();
                header.files.push({
                    name: name,
                    directory: directory
                });
            } else if (extended === $683d3888e3057d3e$var$DW_LNE_SET_DISCRIMINATOR) cursor.uleb();
            cursor.offset = extendedEnd;
            continue;
        }
        if (opcode < header.opcodeBase) {
            switch(opcode){
                case $683d3888e3057d3e$var$DW_LNS_COPY:
                    emit(false);
                    break;
                case $683d3888e3057d3e$var$DW_LNS_ADVANCE_PC:
                    advance(cursor.uleb());
                    break;
                case $683d3888e3057d3e$var$DW_LNS_ADVANCE_LINE:
                    state.line += cursor.sleb();
                    break;
                case $683d3888e3057d3e$var$DW_LNS_SET_FILE:
                    state.file = cursor.uleb();
                    break;
                case $683d3888e3057d3e$var$DW_LNS_SET_COLUMN:
                    cursor.uleb();
                    break;
                case $683d3888e3057d3e$var$DW_LNS_NEGATE_STMT:
                case $683d3888e3057d3e$var$DW_LNS_SET_BASIC_BLOCK:
                case $683d3888e3057d3e$var$DW_LNS_SET_PROLOGUE_END:
                case $683d3888e3057d3e$var$DW_LNS_SET_EPILOGUE_BEGIN:
                    break;
                case $683d3888e3057d3e$var$DW_LNS_CONST_ADD_PC:
                    advance(Math.floor((255 - header.opcodeBase) / header.lineRange));
                    break;
                case $683d3888e3057d3e$var$DW_LNS_FIXED_ADVANCE_PC:
                    state.address += cursor.u16();
                    state.opIndex = 0;
                    break;
                case $683d3888e3057d3e$var$DW_LNS_SET_ISA:
                    cursor.uleb();
                    break;
                default:
                    {
                        const count = (_a = header.operandCounts[opcode - 1]) !== null && _a !== void 0 ? _a : 0;
                        for(let index = 0; index < count; index += 1)cursor.uleb();
                    }
            }
            continue;
        }
        const adjusted = opcode - header.opcodeBase;
        advance(Math.floor(adjusted / header.lineRange));
        state.line += header.lineBase + adjusted % header.lineRange;
        emit(false);
    }
}
/**
 * Read a DWARF 5 directory or file table.
 * @param {Cursor} cursor Header cursor.
 * @param {number} addressSize Address width used by `DW_FORM_addr` entries.
 * @param {Uint8Array} bytes ELF bytes.
 * @param {Slice | undefined} strings `.debug_str`.
 * @param {Slice | undefined} lineStrings `.debug_line_str`.
 * @param {boolean} directories True for the directory table.
 * @param {string[]} includeDirs Directory paths, appended when `directories` is true.
 * @param {SourceFile[]} files File entries, appended when `directories` is false.
 * @returns {void}
 */ function $683d3888e3057d3e$var$readEntries(cursor, addressSize, bytes, strings, lineStrings, directories, includeDirs, files) {
    const formats = [];
    const formatCount = cursor.u8();
    for(let index = 0; index < formatCount; index += 1)formats.push({
        content: cursor.uleb(),
        form: cursor.uleb()
    });
    const count = cursor.uleb();
    for(let index = 0; index < count; index += 1){
        let name = "";
        let directory = 0;
        for (const format of formats){
            const value = cursor.form(format.form, addressSize, bytes, strings, lineStrings);
            if (format.content === $683d3888e3057d3e$var$DW_LNCT_PATH && typeof value === "string") name = value;
            else if (format.content === $683d3888e3057d3e$var$DW_LNCT_DIRECTORY_INDEX && typeof value === "number") directory = value;
        }
        if (directories) includeDirs.push(name);
        else files.push({
            name: name,
            directory: directory
        });
    }
}
/**
 * Join a file entry with its directory the way addr2line prints it.
 * An absolute file name is kept. Relative names are not normalized.
 * @param {ProgramHeader} header File and directory tables.
 * @param {number} index File register value.
 * @returns {string} The path, or empty when the index is not in the table.
 */ function $683d3888e3057d3e$var$sourcePath(header, index) {
    var _a;
    const file = header.files[index];
    if (!(file === null || file === void 0 ? void 0 : file.name)) return "";
    if (file.name.startsWith("/") || /^[A-Za-z]:[\\/]/.test(file.name)) return file.name;
    const directory = (_a = header.directories[file.directory]) !== null && _a !== void 0 ? _a : "";
    if (!directory) return file.name;
    const separator = directory.endsWith("/") || directory.endsWith("\\") ? "" : "/";
    return `${directory}${separator}${file.name}`;
}
/**
 * Map each DWARF 4 line program to the compile unit's `DW_AT_comp_dir`.
 * Only the root DIE of each unit is read. A unit that cannot be skipped is ignored.
 * @param {Uint8Array} bytes ELF bytes.
 * @param {boolean} little True for a little-endian image.
 * @param {Map<string, Slice>} sections Named sections.
 * @returns {Map<number, string>} `.debug_line` offset to compilation directory.
 */ function $683d3888e3057d3e$var$compilationDirectories(bytes, little, sections) {
    const found = new Map();
    const info = sections.get(".debug_info");
    const abbrevSection = sections.get(".debug_abbrev");
    if (!info || !abbrevSection || info.size <= 0) return found;
    const strings = sections.get(".debug_str");
    const lineStrings = sections.get(".debug_line_str");
    const cursor = new $683d3888e3057d3e$var$Cursor(bytes, little, info.offset, info.offset + info.size);
    const tables = new Map();
    while(cursor.offset + 4 <= cursor.limit){
        const unitStart = cursor.offset;
        const length = cursor.u32();
        if (length === 0xffffffff) {
            const wide = cursor.u64();
            if (!Number.isSafeInteger(wide) || unitStart + 12 + wide > cursor.limit) break;
            cursor.offset = unitStart + 12 + wide;
            continue;
        }
        const unitEnd = unitStart + 4 + length;
        if (length < 7 || unitEnd > cursor.limit) break;
        const savedLimit = cursor.limit;
        cursor.limit = unitEnd;
        try {
            const version = cursor.u16();
            let abbrevOffset = 0;
            let addressSize = 4;
            if (version === 5) {
                cursor.u8();
                addressSize = cursor.u8();
                abbrevOffset = cursor.u32();
            } else if (version >= 2 && version <= 4) {
                abbrevOffset = cursor.u32();
                addressSize = cursor.u8();
            } else throw new Error("unsupported compile-unit version");
            const absolute = abbrevSection.offset + abbrevOffset;
            let table = tables.get(absolute);
            if (!table) {
                table = $683d3888e3057d3e$var$readAbbreviations(bytes, little, absolute, abbrevSection.offset + abbrevSection.size);
                tables.set(absolute, table);
            }
            const code = cursor.uleb();
            const abbrev = code === 0 ? undefined : table.get(code);
            let compDir;
            let stmtList;
            if (abbrev) for (const attribute of abbrev.attributes){
                if (attribute.form === $683d3888e3057d3e$var$DW_FORM_IMPLICIT_CONST) {
                    if (attribute.name === $683d3888e3057d3e$var$DW_AT_STMT_LIST) stmtList = attribute.constant;
                    continue;
                }
                const value = cursor.form(attribute.form, addressSize, bytes, strings, lineStrings);
                if (attribute.name === $683d3888e3057d3e$var$DW_AT_COMP_DIR && typeof value === "string") compDir = value;
                else if (attribute.name === $683d3888e3057d3e$var$DW_AT_STMT_LIST && typeof value === "number") stmtList = value;
            }
            if (compDir && stmtList !== undefined) found.set(stmtList, compDir);
        } catch  {
        // This unit has no usable compilation directory.
        }
        cursor.limit = savedLimit;
        cursor.offset = unitEnd;
    }
    return found;
}
/**
 * Read one abbreviation table, ending at the zero code.
 * @param {Uint8Array} bytes ELF bytes.
 * @param {boolean} little True for a little-endian image.
 * @param {number} offset File offset of the first abbreviation.
 * @param {number} end Exclusive end of `.debug_abbrev`.
 * @returns {Map<number, Abbrev>} Abbreviation code to attributes.
 */ function $683d3888e3057d3e$var$readAbbreviations(bytes, little, offset, end) {
    const cursor = new $683d3888e3057d3e$var$Cursor(bytes, little, offset, end);
    const table = new Map();
    let code = cursor.uleb();
    while(code !== 0){
        cursor.uleb();
        cursor.u8();
        const attributes = [];
        let name = cursor.uleb();
        let form = cursor.uleb();
        while(name !== 0 || form !== 0){
            const attribute = {
                name: name,
                form: form
            };
            if (form === $683d3888e3057d3e$var$DW_FORM_IMPLICIT_CONST) attribute.constant = cursor.sleb();
            attributes.push(attribute);
            name = cursor.uleb();
            form = cursor.uleb();
        }
        table.set(code, {
            attributes: attributes
        });
        code = cursor.uleb();
    }
    return table;
}
/**
 * Drop empty rows and keep the last row when two start at the same address.
 * @param {LineInterval[]} intervals Unordered rows from every unit.
 * @returns {LineInterval[]} Rows ordered by start address.
 */ function $683d3888e3057d3e$var$orderLines(intervals) {
    const sorted = [
        ...intervals
    ].sort((left, right)=>left.start - right.start || left.end - right.end);
    const ordered = [];
    for (const interval of sorted){
        if (interval.end <= interval.start || !interval.path) continue;
        const previous = ordered[ordered.length - 1];
        if (previous && previous.start === interval.start) ordered[ordered.length - 1] = interval;
        else ordered.push(interval);
    }
    return ordered;
}
/**
 * Section offsets needed to find DWARF tables.
 * @param {Uint8Array} bytes ELF image.
 * @returns {{ little: boolean, addressSize: number, sections: Map<string, Slice> } | null} Layout, or null.
 */ function $683d3888e3057d3e$var$elfLayout(bytes) {
    if (bytes.length < 52 || bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c || bytes[3] !== 0x46) return null;
    const elf64 = bytes[4] === 2;
    if (bytes[4] !== 1 && !elf64) return null;
    const little = bytes[5] !== 2;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const readU16 = (offset)=>view.getUint16(offset, little);
    const readU32 = (offset)=>view.getUint32(offset, little);
    const readAddr = (offset)=>{
        if (!elf64) return readU32(offset);
        const low = little ? view.getUint32(offset, true) : view.getUint32(offset + 4, false);
        const high = little ? view.getUint32(offset + 4, true) : view.getUint32(offset, false);
        return high * 0x100000000 + low;
    };
    const shoff = readAddr(elf64 ? 40 : 32);
    const shentsize = readU16(elf64 ? 58 : 46);
    const shnum = readU16(elf64 ? 60 : 48);
    const shstrndx = readU16(elf64 ? 62 : 50);
    if (shoff <= 0 || shnum === 0 || shstrndx >= shnum || shentsize < (elf64 ? 64 : 40)) return null;
    if (shoff + shnum * shentsize > bytes.length) return null;
    const readSection = (index)=>{
        const base = shoff + index * shentsize;
        if (elf64) return {
            name: readU32(base),
            offset: readAddr(base + 24),
            size: readAddr(base + 32)
        };
        return {
            name: readU32(base),
            offset: readU32(base + 16),
            size: readU32(base + 20)
        };
    };
    const names = readSection(shstrndx);
    const sections = new Map();
    for(let index = 0; index < shnum; index += 1){
        const section = readSection(index);
        const name = $683d3888e3057d3e$var$readCString(bytes, names.offset + section.name, names.offset + names.size);
        if (name && !sections.has(name)) sections.set(name, {
            offset: section.offset,
            size: section.size
        });
    }
    return {
        little: little,
        addressSize: elf64 ? 8 : 4,
        sections: sections
    };
}
/**
 * Bounds-checked cursor over an ELF image.
 */ class $683d3888e3057d3e$var$Cursor {
    /**
     * @param {Uint8Array} bytes Image bytes.
     * @param {boolean} little True when multi-byte values are little-endian.
     * @param {number} offset First byte to read.
     * @param {number} limit Exclusive end.
     */ constructor(bytes, little, offset, limit){
        this.bytes = bytes;
        this.little = little;
        this.offset = offset;
        this.limit = limit;
    }
    /**
     * @returns {number} The next byte, without consuming it.
     */ peek() {
        this.need(1);
        return this.bytes[this.offset];
    }
    /**
     * @returns {number} The next unsigned byte.
     */ u8() {
        this.need(1);
        const value = this.bytes[this.offset];
        this.offset += 1;
        return value;
    }
    /**
     * @returns {number} The next signed byte.
     */ s8() {
        const value = this.u8();
        return value < 128 ? value : value - 256;
    }
    /**
     * @returns {number} The next unsigned 16-bit value.
     */ u16() {
        this.need(2);
        const view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
        const value = view.getUint16(this.offset, this.little);
        this.offset += 2;
        return value;
    }
    /**
     * @returns {number} The next unsigned 32-bit value.
     */ u32() {
        this.need(4);
        const view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
        const value = view.getUint32(this.offset, this.little);
        this.offset += 4;
        return value;
    }
    /**
     * @returns {number} The next unsigned 64-bit value, when it fits in a safe integer.
     */ u64() {
        const first = this.u32();
        const second = this.u32();
        return this.little ? second * 0x100000000 + first : first * 0x100000000 + second;
    }
    /**
     * @param {number} size Address width in bytes. 4 and 8 are accepted.
     * @returns {number} The address.
     */ address(size) {
        if (size === 8) return this.u64();
        if (size === 4) return this.u32();
        if (size === 2) return this.u16();
        throw new Error("unsupported address size");
    }
    /**
     * @param {number} count Bytes to move past.
     * @returns {void}
     */ skip(count) {
        this.need(count);
        this.offset += count;
    }
    /**
     * @returns {number} An unsigned LEB128.
     */ uleb() {
        let value = 0;
        let factor = 1;
        let byte = 0;
        do {
            byte = this.u8();
            value += (byte & 0x7f) * factor;
            factor *= 128;
        }while (byte >= 0x80);
        return value;
    }
    /**
     * @returns {number} A signed LEB128.
     */ sleb() {
        let value = 0;
        let factor = 1;
        let byte = 0;
        do {
            byte = this.u8();
            value += (byte & 0x7f) * factor;
            factor *= 128;
        }while (byte >= 0x80);
        if ((byte & 0x40) !== 0) value -= factor;
        return value;
    }
    /**
     * @returns {string} A NUL-terminated string.
     */ cstring() {
        const start = this.offset;
        while(this.offset < this.limit && this.bytes[this.offset] !== 0)this.offset += 1;
        if (this.offset >= this.limit) throw new Error("string is truncated");
        const value = new TextDecoder("utf-8").decode(this.bytes.subarray(start, this.offset));
        this.offset += 1;
        return value;
    }
    /**
     * Consume one attribute form.
     * @param {number} formCode DWARF form code.
     * @param {number} addressSize Width of a `DW_FORM_addr` value.
     * @param {Uint8Array} bytes ELF bytes.
     * @param {Slice | undefined} strings `.debug_str`.
     * @param {Slice | undefined} lineStrings `.debug_line_str`.
     * @returns {string | number | undefined} A string, a number, or nothing for forms with no scalar.
     */ form(formCode, addressSize, bytes, strings, lineStrings) {
        switch(formCode){
            case $683d3888e3057d3e$var$DW_FORM_ADDR:
                return this.address(addressSize);
            case $683d3888e3057d3e$var$DW_FORM_DATA1:
            case $683d3888e3057d3e$var$DW_FORM_FLAG:
            case $683d3888e3057d3e$var$DW_FORM_REF1:
            case $683d3888e3057d3e$var$DW_FORM_STRX1:
            case $683d3888e3057d3e$var$DW_FORM_ADDRX1:
                return this.u8();
            case $683d3888e3057d3e$var$DW_FORM_DATA2:
            case $683d3888e3057d3e$var$DW_FORM_REF2:
            case $683d3888e3057d3e$var$DW_FORM_STRX2:
            case $683d3888e3057d3e$var$DW_FORM_ADDRX2:
                return this.u16();
            case $683d3888e3057d3e$var$DW_FORM_STRX3:
            case $683d3888e3057d3e$var$DW_FORM_ADDRX3:
                {
                    const first = this.u8();
                    const second = this.u8();
                    const third = this.u8();
                    return this.little ? first | second << 8 | third << 16 : first << 16 | second << 8 | third;
                }
            case $683d3888e3057d3e$var$DW_FORM_DATA4:
            case $683d3888e3057d3e$var$DW_FORM_REF4:
            case $683d3888e3057d3e$var$DW_FORM_SEC_OFFSET:
            case $683d3888e3057d3e$var$DW_FORM_STRP_SUP:
            case $683d3888e3057d3e$var$DW_FORM_REF_SUP4:
            case $683d3888e3057d3e$var$DW_FORM_STRX4:
            case $683d3888e3057d3e$var$DW_FORM_ADDRX4:
                return this.u32();
            case $683d3888e3057d3e$var$DW_FORM_DATA8:
            case $683d3888e3057d3e$var$DW_FORM_REF8:
            case $683d3888e3057d3e$var$DW_FORM_REF_SIG8:
            case $683d3888e3057d3e$var$DW_FORM_REF_SUP8:
                return this.u64();
            case $683d3888e3057d3e$var$DW_FORM_DATA16:
                this.skip(16);
                return undefined;
            case $683d3888e3057d3e$var$DW_FORM_STRING:
                return this.cstring();
            case $683d3888e3057d3e$var$DW_FORM_STRP:
                return $683d3888e3057d3e$var$stringAt(bytes, strings, this.u32());
            case $683d3888e3057d3e$var$DW_FORM_LINE_STRP:
                return $683d3888e3057d3e$var$stringAt(bytes, lineStrings, this.u32());
            case $683d3888e3057d3e$var$DW_FORM_BLOCK1:
                this.skip(this.u8());
                return undefined;
            case $683d3888e3057d3e$var$DW_FORM_BLOCK2:
                this.skip(this.u16());
                return undefined;
            case $683d3888e3057d3e$var$DW_FORM_BLOCK4:
                this.skip(this.u32());
                return undefined;
            case $683d3888e3057d3e$var$DW_FORM_BLOCK:
            case $683d3888e3057d3e$var$DW_FORM_EXPRLOC:
                this.skip(this.uleb());
                return undefined;
            case $683d3888e3057d3e$var$DW_FORM_UDATA:
            case $683d3888e3057d3e$var$DW_FORM_REF_UDATA:
            case $683d3888e3057d3e$var$DW_FORM_STRX:
            case $683d3888e3057d3e$var$DW_FORM_ADDRX:
            case $683d3888e3057d3e$var$DW_FORM_LOCLISTX:
            case $683d3888e3057d3e$var$DW_FORM_RNGLISTX:
                return this.uleb();
            case $683d3888e3057d3e$var$DW_FORM_SDATA:
                return this.sleb();
            case $683d3888e3057d3e$var$DW_FORM_REF_ADDR:
                return this.u32();
            case $683d3888e3057d3e$var$DW_FORM_INDIRECT:
                return this.form(this.uleb(), addressSize, bytes, strings, lineStrings);
            case $683d3888e3057d3e$var$DW_FORM_FLAG_PRESENT:
            case $683d3888e3057d3e$var$DW_FORM_IMPLICIT_CONST:
                return undefined;
            default:
                throw new Error("unsupported DWARF form");
        }
    }
    /**
     * @param {number} count Bytes required.
     * @returns {void}
     */ need(count) {
        if (this.offset < 0 || count < 0 || this.offset + count > this.limit) throw new Error("DWARF data is truncated");
    }
}
/**
 * Read a NUL-terminated string that must end inside `end`.
 * @param {Uint8Array} bytes Image bytes.
 * @param {number} offset First byte.
 * @param {number} end Exclusive end.
 * @returns {string} The string, or empty when the offset is outside the section.
 */ function $683d3888e3057d3e$var$readCString(bytes, offset, end) {
    if (offset < 0 || offset >= end || offset >= bytes.length) return "";
    let stop = offset;
    const last = Math.min(end, bytes.length);
    while(stop < last && bytes[stop] !== 0)stop += 1;
    return new TextDecoder("utf-8").decode(bytes.subarray(offset, stop));
}
/**
 * Resolve an offset into a DWARF string section.
 * @param {Uint8Array} bytes Image bytes.
 * @param {Slice | undefined} section String section.
 * @param {number} relative Offset from the start of the section.
 * @returns {string} The string, or empty when the offset is outside the section.
 */ function $683d3888e3057d3e$var$stringAt(bytes, section, relative) {
    if (!section) return "";
    return $683d3888e3057d3e$var$readCString(bytes, section.offset + relative, section.offset + section.size);
}


/** USB product id of the on-chip USB-Serial-JTAG bridge. */ const $72ac21d1510dfdd7$export$2f0304870961b486 = 0x1001;
class $72ac21d1510dfdd7$export$2d93515331bae263 extends Error {
    /**
     * @param {string} message What went wrong.
     */ constructor(message){
        super(message);
        this.name = "MonitorError";
    }
}
class $72ac21d1510dfdd7$export$3ce8012b5e409885 extends $72ac21d1510dfdd7$export$2d93515331bae263 {
    /**
     * @param {number} timeoutSeconds How long the caller was willing to wait.
     */ constructor(timeoutSeconds){
        super(`expect timed out after ${timeoutSeconds}s`);
        /** Process-style status a script runner can surface. */ this.code = 110;
        this.name = "ExpectTimeoutError";
    }
}


const $6992e0dc3956a534$var$SHF_EXECINSTR = 0x4;
const $6992e0dc3956a534$var$SHT_SYMTAB = 2;
const $6992e0dc3956a534$var$SHT_STRTAB = 3;
function $6992e0dc3956a534$export$5002bf0f162fa76a(data) {
    if (data instanceof Uint8Array) return data;
    return new Uint8Array(data);
}
async function $6992e0dc3956a534$export$4eacf6229f17c532(bytes) {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const digest = await crypto.subtle.digest("SHA-256", copy);
    return [
        ...new Uint8Array(digest)
    ].map((byte)=>byte.toString(16).padStart(2, "0")).join("");
}
async function $6992e0dc3956a534$export$cb034a18878e2a2f(name, data, rom = false) {
    const bytes = $6992e0dc3956a534$export$5002bf0f162fa76a(data);
    const parsed = $6992e0dc3956a534$export$726012a0f9594f47(bytes);
    return {
        name: name,
        ranges: parsed.ranges,
        symbols: parsed.symbols,
        sha256: await $6992e0dc3956a534$export$4eacf6229f17c532(bytes),
        rom: rom,
        lines: rom ? [] : (0, $683d3888e3057d3e$export$97756d394f96f606)(bytes)
    };
}
function $6992e0dc3956a534$export$726012a0f9594f47(bytes) {
    if (bytes.length < 52 || bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c || bytes[3] !== 0x46) throw new (0, $72ac21d1510dfdd7$export$2d93515331bae263)("Not an ELF file");
    const elf64 = bytes[4] === 2;
    if (bytes[4] !== 1 && !elf64) throw new (0, $72ac21d1510dfdd7$export$2d93515331bae263)("Unsupported ELF class");
    const little = bytes[5] !== 2;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const readU16 = (offset)=>view.getUint16(offset, little);
    const readU32 = (offset)=>view.getUint32(offset, little);
    const readU64 = (offset)=>{
        const low = little ? view.getUint32(offset, true) : view.getUint32(offset + 4, false);
        const high = little ? view.getUint32(offset + 4, true) : view.getUint32(offset, false);
        return high * 0x100000000 + low;
    };
    const readAddr = elf64 ? readU64 : (offset)=>readU32(offset);
    const shoff = readAddr(elf64 ? 40 : 32);
    const shentsize = readU16(elf64 ? 58 : 46);
    const shnum = readU16(elf64 ? 60 : 48);
    const headerBytes = shoff + shnum * shentsize;
    if (shoff <= 0 || shentsize < (elf64 ? 64 : 40) || headerBytes > bytes.length) throw new (0, $72ac21d1510dfdd7$export$2d93515331bae263)("ELF section headers are truncated");
    const sections = [];
    for(let index = 0; index < shnum; index += 1){
        const base = shoff + index * shentsize;
        if (elf64) sections.push({
            type: readU32(base + 4),
            flags: readAddr(base + 8),
            addr: readAddr(base + 16),
            offset: readAddr(base + 24),
            size: readAddr(base + 32),
            link: readU32(base + 40),
            entsize: readAddr(base + 56)
        });
        else sections.push({
            type: readU32(base + 4),
            flags: readU32(base + 8),
            addr: readU32(base + 12),
            offset: readU32(base + 16),
            size: readU32(base + 20),
            link: readU32(base + 24),
            entsize: readU32(base + 36)
        });
    }
    const ranges = sections.filter((section)=>(section.flags & $6992e0dc3956a534$var$SHF_EXECINSTR) !== 0 && section.size > 0).map((section)=>({
            start: section.addr,
            end: section.addr + section.size
        }));
    const symbols = [];
    for (const section of sections){
        if (section.type !== $6992e0dc3956a534$var$SHT_SYMTAB) continue;
        const strings = sections[section.link];
        if (!strings || strings.type !== $6992e0dc3956a534$var$SHT_STRTAB) continue;
        const step = section.entsize || (elf64 ? 24 : 16);
        for(let offset = 0; offset + step <= section.size; offset += step){
            const at = section.offset + offset;
            if (at + step > bytes.length) break;
            const nameOffset = readU32(at);
            const info = bytes[elf64 ? at + 4 : at + 12];
            const value = elf64 ? readAddr(at + 8) : readU32(at + 4);
            const size = elf64 ? readAddr(at + 16) : readU32(at + 8);
            const shndx = readU16(elf64 ? at + 6 : at + 14);
            if (shndx === 0 || nameOffset === 0) continue;
            const name = $6992e0dc3956a534$var$readCString(bytes, strings.offset + nameOffset);
            if (!name) continue;
            // STT_SECTION (3) is not a callable symbol. Everything else can label an address.
            if ((info & 0xf) === 3) continue;
            symbols.push({
                name: name,
                value: value,
                size: size
            });
        }
    }
    return {
        ranges: ranges,
        symbols: symbols
    };
}
/**
 * Read a NUL-terminated ASCII string. Non-ASCII bytes stop the string.
 * @param {Uint8Array} bytes File bytes.
 * @param {number} offset Start index.
 * @returns {string} The string, or empty when it is missing.
 */ function $6992e0dc3956a534$var$readCString(bytes, offset) {
    let end = offset;
    while(end < bytes.length && bytes[end] !== 0)end += 1;
    return new TextDecoder("utf-8").decode(bytes.subarray(offset, end));
}


const $e07a1b05df0bcdef$var$DEFAULT_LETTERS = {
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
    exitMenuKey: "X"
};
function $e07a1b05df0bcdef$export$61969f0f4a11e0e5(letter, fallback) {
    const chosen = letter && letter.length === 1 ? letter : fallback;
    let code = chosen.toUpperCase().charCodeAt(0) - "@".charCodeAt(0);
    if (code < 1 || code > 32) code = fallback.toUpperCase().charCodeAt(0) - "@".charCodeAt(0);
    return String.fromCharCode(code);
}
function $e07a1b05df0bcdef$export$af3bf6ce06df51c0(letters) {
    const source = letters !== null && letters !== void 0 ? letters : {};
    return {
        menu: $e07a1b05df0bcdef$export$61969f0f4a11e0e5(source.menuKey, $e07a1b05df0bcdef$var$DEFAULT_LETTERS.menuKey),
        exit: $e07a1b05df0bcdef$export$61969f0f4a11e0e5(source.exitKey, $e07a1b05df0bcdef$var$DEFAULT_LETTERS.exitKey),
        reset: $e07a1b05df0bcdef$export$61969f0f4a11e0e5(source.chipResetKey, $e07a1b05df0bcdef$var$DEFAULT_LETTERS.chipResetKey),
        flash: $e07a1b05df0bcdef$export$61969f0f4a11e0e5(source.flashKey, $e07a1b05df0bcdef$var$DEFAULT_LETTERS.flashKey),
        appFlash: $e07a1b05df0bcdef$export$61969f0f4a11e0e5(source.appFlashKey, $e07a1b05df0bcdef$var$DEFAULT_LETTERS.appFlashKey),
        flashAll: $e07a1b05df0bcdef$export$61969f0f4a11e0e5(source.flashAllKey, $e07a1b05df0bcdef$var$DEFAULT_LETTERS.flashAllKey),
        output: $e07a1b05df0bcdef$export$61969f0f4a11e0e5(source.outputKey, $e07a1b05df0bcdef$var$DEFAULT_LETTERS.outputKey),
        log: $e07a1b05df0bcdef$export$61969f0f4a11e0e5(source.logKey, $e07a1b05df0bcdef$var$DEFAULT_LETTERS.logKey),
        timestamps: $e07a1b05df0bcdef$export$61969f0f4a11e0e5(source.timestampKey, $e07a1b05df0bcdef$var$DEFAULT_LETTERS.timestampKey),
        bootloader: $e07a1b05df0bcdef$export$61969f0f4a11e0e5(source.bootloaderKey, $e07a1b05df0bcdef$var$DEFAULT_LETTERS.bootloaderKey),
        exitMenu: $e07a1b05df0bcdef$export$61969f0f4a11e0e5(source.exitMenuKey, $e07a1b05df0bcdef$var$DEFAULT_LETTERS.exitMenuKey),
        skipMenu: source.skipMenuKey === true
    };
}
function $e07a1b05df0bcdef$export$1893214c154a1b90(key) {
    const code = key.charCodeAt(0);
    if (code >= 1 && code <= 31) return `Ctrl+${String.fromCharCode(code + 64)}`;
    return key;
}


const $fbf1986ca065a802$var$VERSION = "0.1.0";
class $fbf1986ca065a802$export$1361cef77c86af7d {
    /**
     * @param {ResolvedKeys} keys Control characters to match.
     * @param {EolMode} eol Line ending applied to device-bound input.
     */ constructor(keys, eol){
        this.keys = keys;
        this.menuArmed = false;
        this.translate = eol === "CRLF" ? (value)=>value.replace(/\n/g, "\r\n") : eol === "LF" ? (value)=>value.replace(/\r/g, "\n") : (value)=>value.replace(/\n/g, "\r");
    }
    /**
     * Parse one character.
     * @param {string} key Character from the terminal.
     * @returns {ParsedKey} Device bytes, a local command, or the menu being armed.
     */ parse(key) {
        if (this.menuArmed || this.keys.skipMenu && this.isCommandKey(key)) {
            this.menuArmed = false;
            return this.menuKey(key);
        }
        if (key === this.keys.menu) {
            this.menuArmed = true;
            return {
                kind: "arm"
            };
        }
        if (key === this.keys.exit) return {
            kind: "command",
            action: "exit"
        };
        return {
            kind: "bytes",
            data: this.translate(key)
        };
    }
    /**
     * Help text printed for Ctrl+T then Ctrl+H.
     * @returns {string} Help text without a trailing newline.
     */ helpText() {
        const row = (name, label)=>`    ${name.padEnd(14)} ${label}`;
        const lines = [
            `esp-idf-monitor-js (${$fbf1986ca065a802$var$VERSION}) - ESP-IDF monitor`,
            "",
            `    ${(0, $e07a1b05df0bcdef$export$1893214c154a1b90)(this.keys.exit).padEnd(8)} Exit program`,
            `    ${(0, $e07a1b05df0bcdef$export$1893214c154a1b90)(this.keys.menu).padEnd(8)} Menu escape key, followed by:`,
            "    Menu keys:",
            row((0, $e07a1b05df0bcdef$export$1893214c154a1b90)(this.keys.menu), "Send the menu character itself to remote"),
            row((0, $e07a1b05df0bcdef$export$1893214c154a1b90)(this.keys.exit), "Send the exit character itself to remote"),
            row((0, $e07a1b05df0bcdef$export$1893214c154a1b90)(this.keys.reset), "Reset target board via RTS line"),
            row((0, $e07a1b05df0bcdef$export$1893214c154a1b90)(this.keys.flash), "Build & flash project"),
            row(`${(0, $e07a1b05df0bcdef$export$1893214c154a1b90)(this.keys.appFlash)} (or A)`, "Build & flash app only"),
            row(`${(0, $e07a1b05df0bcdef$export$1893214c154a1b90)(this.keys.flashAll)} (or E)`, "Build & full flash project"),
            row((0, $e07a1b05df0bcdef$export$1893214c154a1b90)(this.keys.output), "Toggle output display"),
            row((0, $e07a1b05df0bcdef$export$1893214c154a1b90)(this.keys.log), "Toggle saving output into file"),
            row(`${(0, $e07a1b05df0bcdef$export$1893214c154a1b90)(this.keys.timestamps)} (or I)`, "Toggle printing timestamps"),
            row((0, $e07a1b05df0bcdef$export$1893214c154a1b90)(this.keys.bootloader), "Reset target into bootloader"),
            row(`${(0, $e07a1b05df0bcdef$export$1893214c154a1b90)(this.keys.exitMenu)} (or X)`, "Exit program")
        ];
        if (this.keys.skipMenu) lines.push("", "Commands can be executed without pressing the menu escape key.");
        return lines.join("\n");
    }
    /**
     * Control bytes that `skipMenuKey` promotes out of the menu.
     * Plain letters are intentionally absent.
     * @param {string} key Character to test.
     * @returns {boolean} True when the character is a command control byte.
     */ isCommandKey(key) {
        return [
            this.keys.reset,
            this.keys.flash,
            this.keys.appFlash,
            this.keys.flashAll,
            this.keys.output,
            this.keys.log,
            this.keys.timestamps,
            this.keys.bootloader,
            this.keys.exitMenu
        ].includes(key);
    }
    /**
     * Handle the character that follows the menu key.
     * @param {string} key Character to handle.
     * @returns {ParsedKey} The command or the bytes to forward.
     */ menuKey(key) {
        if (key === this.keys.menu || key === this.keys.exit) return {
            kind: "command",
            action: "forward-menu-key",
            key: key
        };
        if (key === "\x08" || key === "h" || key === "H" || key === "?") return {
            kind: "command",
            action: "help"
        };
        if (key === this.keys.reset) return {
            kind: "command",
            action: "reset"
        };
        if (key === this.keys.flash) return {
            kind: "command",
            action: "flash"
        };
        if (key === this.keys.appFlash || key === "a" || key === "A") return {
            kind: "command",
            action: "app-flash"
        };
        if (key === this.keys.flashAll || key === "e" || key === "E") return {
            kind: "command",
            action: "flash-all"
        };
        if (key === this.keys.output) return {
            kind: "command",
            action: "output"
        };
        if (key === this.keys.log) return {
            kind: "command",
            action: "log"
        };
        if (key === this.keys.timestamps || key === "i" || key === "I") return {
            kind: "command",
            action: "timestamps"
        };
        if (key === this.keys.bootloader) return {
            kind: "command",
            action: "bootloader"
        };
        if (key === this.keys.exitMenu || key === "x" || key === "X") return {
            kind: "command",
            action: "exit"
        };
        return {
            kind: "command",
            action: "unknown",
            key: key
        };
    }
}



const $fb1facad86c86ec6$var$AUTO_COLOR = /^(I|W|E) \([\d:. -]+\)/;
const $fb1facad86c86ec6$var$COLOR = {
    I: "\u001b[0;32m",
    W: "\u001b[0;33m",
    E: "\u001b[0;31m"
};
const $fb1facad86c86ec6$var$RESET = "\u001b[0m";
class $fb1facad86c86ec6$export$a3cf7111e6b6bc75 {
    /**
     * @param {boolean} enabled When false, the fragment is returned unchanged.
     */ constructor(enabled){
        this.enabled = enabled;
        this.open = false;
    }
    /**
     * Color one fragment. The fragment may end with a newline.
     * @param {string} fragment Chip text.
     * @returns {string} The same text, with ANSI color wrapped around a matching log line.
     */ apply(fragment) {
        if (!this.enabled) return fragment;
        const newlineAt = fragment.search(/\r\n|\n|\r/);
        const body = newlineAt === -1 ? fragment : fragment.slice(0, newlineAt);
        const ending = newlineAt === -1 ? "" : fragment.slice(newlineAt);
        if (!this.open) {
            const match = $fb1facad86c86ec6$var$AUTO_COLOR.exec(body);
            if (!match) return fragment;
            const color = $fb1facad86c86ec6$var$COLOR[match[1]];
            if (ending) return `${color}${body}${$fb1facad86c86ec6$var$RESET}${ending}`;
            this.open = true;
            return `${color}${body}`;
        }
        if (ending) {
            this.open = false;
            return `${body}${$fb1facad86c86ec6$var$RESET}${ending}`;
        }
        return fragment;
    }
}
function $fb1facad86c86ec6$export$bfe4ac50319c1d9b(date, format) {
    const pad = (value, width = 2)=>value.toString().padStart(width, "0");
    return format.replace(/%Y|%m|%d|%H|%M|%S|%f|%%/g, (token)=>{
        switch(token){
            case "%Y":
                return String(date.getFullYear());
            case "%m":
                return pad(date.getMonth() + 1);
            case "%d":
                return pad(date.getDate());
            case "%H":
                return pad(date.getHours());
            case "%M":
                return pad(date.getMinutes());
            case "%S":
                return pad(date.getSeconds());
            case "%f":
                return pad(date.getMilliseconds(), 3);
            default:
                return "%";
        }
    });
}
class $fb1facad86c86ec6$export$b2378f19390bb131 {
    /**
     * @param {boolean} enabled Start enabled or not. {@link setEnabled} toggles it later.
     * @param {string} format Timestamp format.
     * @param {function(): Date} now Clock. Tests can freeze it.
     */ constructor(enabled, format, now = ()=>new Date()){
        this.enabled = enabled;
        this.format = format;
        this.now = now;
        this.atStart = true;
    }
    /**
     * Turn timestamps on or off. The next chip line is treated as a new line.
     * @param {boolean} enabled Whether to prefix lines.
     * @returns {void}
     */ setEnabled(enabled) {
        this.enabled = enabled;
        this.atStart = true;
    }
    /**
     * A monitor status line ended, so the next chip byte starts a line.
     * @returns {void}
     */ forceStart() {
        this.atStart = true;
    }
    /**
     * Prefix timestamps onto a fragment.
     * @param {string} fragment Chip text that may contain newlines.
     * @returns {string} Fragment, with a timestamp inserted at each line start when enabled.
     */ apply(fragment) {
        if (!this.enabled) {
            this.track(fragment);
            return fragment;
        }
        let out = "";
        for(let index = 0; index < fragment.length;){
            if (this.atStart) {
                out += `${$fb1facad86c86ec6$export$bfe4ac50319c1d9b(this.now(), this.format)} `;
                this.atStart = false;
            }
            const rest = fragment.slice(index);
            const newlineAt = rest.search(/\r\n|\n|\r/);
            if (newlineAt === -1) {
                out += rest;
                break;
            }
            const separator = rest.startsWith("\r\n", newlineAt) ? 2 : 1;
            out += rest.slice(0, newlineAt + separator);
            index += newlineAt + separator;
            this.atStart = true;
        }
        return out;
    }
    /**
     * Keep line-start tracking even while timestamps are off, so enabling them mid-line waits.
     * @param {string} fragment Chip text.
     * @returns {void}
     */ track(fragment) {
        if (fragment.length === 0) return;
        this.atStart = /[\r\n]$/.test(fragment);
    }
}


const $bb7cc78af024654d$var$LEVEL = {
    N: 0,
    E: 1,
    W: 2,
    I: 3,
    D: 4,
    V: 5,
    "*": 5,
    "": 5
};
/**
 * ESP-IDF log prefix. The optional ANSI run is accepted so a colored line can be re-filtered.
 * Group 1 is the level, group 2 is the tag.
 */ // The CSI byte is the ANSI color ESP-IDF may already have written.
// eslint-disable-next-line no-control-regex
const $bb7cc78af024654d$var$LOG_LINE = /^(?:\u001b\[[01];?\d+m?)?([EWIDV]) (?:\([^)]+\) )?([^:]+): /;
class $bb7cc78af024654d$export$da8a3f0a8c341966 {
    /**
     * @param {string} printFilter Space-separated `tag` or `tag:LEVEL` rules. Empty shows everything.
     */ constructor(printFilter){
        this.limits = new Map();
        const items = printFilter.split(/\s+/).filter((item)=>item.length > 0);
        if (items.length === 0) {
            this.limits.set("*", $bb7cc78af024654d$var$LEVEL.V);
            return;
        }
        for (const item of items){
            const parts = item.split(":");
            if (parts.length === 1) {
                this.limits.set(parts[0], $bb7cc78af024654d$var$LEVEL.V);
                continue;
            }
            if (parts.length !== 2 || parts[0].length === 0) throw new Error(`Invalid print filter: ${item}`);
            const level = $bb7cc78af024654d$var$LEVEL[parts[1].toUpperCase()];
            if (level === undefined) throw new Error(`Unknown level in print filter: ${item}`);
            this.limits.set(parts[0], level);
        }
    }
    /**
     * Whether a line should be written to the terminal.
     * A non-log line is shown only when `*` is above `N`. An unknown tag uses `*`, which
     * defaults to `N` when the filter listed tags and did not mention `*`.
     * @param {string} line Chip line without its trailing newline.
     * @returns {boolean} True when the line is visible.
     */ match(line) {
        var _a, _b;
        const found = $bb7cc78af024654d$var$LOG_LINE.exec(line);
        if (found) {
            const level = $bb7cc78af024654d$var$LEVEL[found[1]];
            const tag = found[2];
            const limit = this.limits.has(tag) ? this.limits.get(tag) : (_a = this.limits.get("*")) !== null && _a !== void 0 ? _a : $bb7cc78af024654d$var$LEVEL.N;
            return limit >= level;
        }
        return ((_b = this.limits.get("*")) !== null && _b !== void 0 ? _b : $bb7cc78af024654d$var$LEVEL.N) > $bb7cc78af024654d$var$LEVEL.N;
    }
}


/**
 * Assemble serial bytes into lines. A partial line is flushed after `flushIntervalMs`
 * unless a core dump is in progress, because espcoredump treats a blank line as the end.
 */ class $1e8d6b77916ce4af$export$847279c81ebe76ec {
    /**
     * @param {LineSink} sink Consumer of complete lines.
     * @param {number} flushIntervalMs Quiet time before a partial line is shown.
     * @param {function(): boolean} coredumpActive When true, the partial-line flush is held back.
     */ constructor(sink, flushIntervalMs, coredumpActive){
        this.sink = sink;
        this.flushIntervalMs = flushIntervalMs;
        this.coredumpActive = coredumpActive;
        this.decoder = new TextDecoder("utf-8", {
            fatal: true
        });
        this.pending = "";
        this.failures = 0;
        this.timer = null;
    }
    /**
     * Append a serial chunk.
     * @param {Uint8Array} bytes Raw bytes.
     * @returns {void}
     */ push(bytes) {
        let text;
        try {
            text = this.decoder.decode(bytes, {
                stream: true
            });
            this.failures = 0;
        } catch  {
            this.failures += 1;
            if (this.failures >= 3) {
                this.sink.decodeWarning();
                this.failures = 0;
            }
            this.decoder = new TextDecoder("utf-8", {
                fatal: true
            });
            text = new TextDecoder("utf-8").decode(bytes);
        }
        if (text.length === 0) return;
        this.pending += text;
        if (this.pending.startsWith("\u001b[5n")) {
            this.emit(this.pending, false);
            this.pending = "";
            this.clearTimer();
            return;
        }
        this.drain();
        this.armTimer();
    }
    /**
     * Drop a pending flush. Called when the monitor stops.
     * @returns {void}
     */ dispose() {
        this.clearTimer();
    }
    /**
     * Emit every complete line, keeping a trailing fragment that has no newline.
     * @returns {void}
     */ drain() {
        while(this.pending.length > 0){
            const match = /\r\n|\n|\r/.exec(this.pending);
            if (!match) return;
            const end = match.index + match[0].length;
            const line = this.pending.slice(0, end);
            this.pending = this.pending.slice(end);
            this.sink.push(line, true);
        }
        this.clearTimer();
    }
    /**
     * Schedule a flush of the current partial line.
     * @returns {void}
     */ armTimer() {
        this.clearTimer();
        if (this.pending.length === 0 || this.coredumpActive()) return;
        this.timer = setTimeout(()=>{
            this.timer = null;
            if (this.pending.length === 0 || this.coredumpActive()) return;
            const line = this.pending;
            this.pending = "";
            this.sink.push(line, false);
        }, this.flushIntervalMs);
    }
    /**
     * Cancel the partial-line timer.
     * @returns {void}
     */ clearTimer() {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
    /**
     * Forward one fragment.
     * @param {string} fragment Text to emit.
     * @param {boolean} newline Whether it ends a line.
     * @returns {void}
     */ emit(fragment, newline) {
        this.sink.push(fragment, newline);
    }
}


const $ab1cf83523ffae04$var$START = "================= CORE DUMP START =================";
const $ab1cf83523ffae04$var$END = "================= CORE DUMP END =================";
const $ab1cf83523ffae04$var$PROMPT = "Press Enter to print core dump to UART...";
class $ab1cf83523ffae04$export$e278254a2882fea3 {
    constructor(){
        /** True while the body is being captured. The line buffer must not flush a partial line. */ this.active = false;
        this.body = [];
        this.announced = 0;
    }
    /**
     * Feed one stripped line.
     * @param {string} line Line without its newline.
     * @returns {CoredumpStep | null} The transition, or null when this line is ordinary output.
     */ push(line) {
        if (line.includes($ab1cf83523ffae04$var$PROMPT)) return {
            kind: "prompt"
        };
        if (line.includes($ab1cf83523ffae04$var$START)) {
            this.active = true;
            this.body = [];
            this.announced = 0;
            return {
                kind: "start"
            };
        }
        if (!this.active) return null;
        if (line.includes($ab1cf83523ffae04$var$END)) {
            this.active = false;
            const base64 = this.body.join("");
            this.body = [];
            return {
                kind: "end",
                base64: base64
            };
        }
        this.body.push(line.trim());
        const bytes = this.body.join("").length;
        let progress;
        if (bytes >= this.announced + 1024) {
            this.announced = Math.floor(bytes / 1024) * 1024;
            progress = this.announced;
        }
        return {
            kind: "body",
            progress: progress
        };
    }
}


const $f5e221d42fc7f458$var$PACKET = /\$(T..)#([0-9a-fA-F]{2})/;
class $f5e221d42fc7f458$export$cfbb7deb9042d67a {
    constructor(){
        this.tail = "";
    }
    /**
     * Feed the next chip line.
     * @param {string} text New text.
     * @returns {{ packet: string } | { malformed: true } | null} A valid packet, a bad checksum, or nothing.
     */ push(text) {
        const combined = this.tail + text;
        this.tail = "";
        const match = $f5e221d42fc7f458$var$PACKET.exec(combined);
        if (!match) {
            this.tail = combined.slice(-6);
            return null;
        }
        let sum = 0;
        for (const char of match[1])sum = sum + char.charCodeAt(0) & 0xff;
        if (sum !== Number.parseInt(match[2], 16)) return {
            malformed: true
        };
        return {
            packet: match[0]
        };
    }
}


const $c4bc0c8280f86fcc$var$PANIC_START = /Core\s*\d+ register dump:/;
class $c4bc0c8280f86fcc$export$d754ec89af93b99d {
    constructor(){
        /** True while stack-dump lines should be hidden. */ this.suppressing = false;
        this.reading = false;
        this.lines = [];
    }
    /**
     * Feed one stripped line.
     * @param {string} line Line without its newline.
     * @returns {"start" | "done" | null} `start` on the register-dump line, `done` on the blank line that ends it.
     */ push(line) {
        if (!this.reading) {
            if (!$c4bc0c8280f86fcc$var$PANIC_START.test(line)) return null;
            this.reading = true;
            this.suppressing = false;
            this.lines = [
                line
            ];
            return "start";
        }
        if (line.length === 0) {
            this.reading = false;
            this.suppressing = false;
            return "done";
        }
        if (line.includes("Stack memory:")) this.suppressing = true;
        this.lines.push(line);
        return null;
    }
    /**
     * Text captured since the register dump, not including the terminating blank line.
     * @returns {string} Joined lines.
     */ text() {
        return this.lines.join("\n");
    }
}


const $1154f44d02ebc126$var$SHA_LINE = /ELF file SHA256:\s+([a-fA-F0-9]+)/;
function $1154f44d02ebc126$export$5d04e55b7c5f01e6(line) {
    const match = $1154f44d02ebc126$var$SHA_LINE.exec(line);
    return match ? match[1].toLowerCase() : null;
}
function $1154f44d02ebc126$export$60b435ea269b00(flashed, built) {
    const needle = flashed.toLowerCase();
    const hit = built.find((digest)=>digest.toLowerCase().includes(needle));
    return hit ? {
        match: true,
        built: hit
    } : {
        match: false
    };
}



async function $dfd7bf1a3e4e1c69$export$4ff35e5b1175d6f6(control) {
    await control.setSignals({
        requestToSend: true
    });
    await control.sleep(5);
    await control.setSignals({
        requestToSend: false
    });
}
async function $dfd7bf1a3e4e1c69$export$d9f205f0beeb787e(control, enterBootSetMs, enterBootUnsetMs) {
    await control.setSignals({
        dataTerminalReady: false,
        requestToSend: true
    });
    await control.sleep(enterBootSetMs);
    await control.setSignals({
        dataTerminalReady: true,
        requestToSend: false
    });
    await control.sleep(enterBootUnsetMs);
    await control.setSignals({
        dataTerminalReady: false,
        requestToSend: false
    });
}
async function $dfd7bf1a3e4e1c69$export$a90b023028ab6c70(control) {
    await control.setSignals({
        requestToSend: false
    });
    await control.setSignals({
        dataTerminalReady: false
    });
    await control.sleep(100);
    await control.setSignals({
        dataTerminalReady: true
    });
    await control.setSignals({
        requestToSend: false
    });
    await control.sleep(100);
    await control.setSignals({
        requestToSend: true
    });
    await control.setSignals({
        dataTerminalReady: false
    });
    await control.setSignals({
        requestToSend: true
    });
    await control.sleep(100);
    await control.setSignals({
        requestToSend: false
    });
    await control.setSignals({
        dataTerminalReady: false
    });
}
async function $dfd7bf1a3e4e1c69$export$c631d2ae9f82788d(control, sequence) {
    const steps = sequence.split("|").filter((step)=>step.length > 0);
    if (steps.length === 0) return false;
    for (const step of steps){
        if (/^D[01]$/.test(step)) await control.setSignals({
            dataTerminalReady: step[1] === "1"
        });
        else if (/^R[01]$/.test(step)) await control.setSignals({
            requestToSend: step[1] === "1"
        });
        else if (/^U[01],[01]$/.test(step)) {
            const [dtr, rts] = step.slice(1).split(",");
            await control.setSignals({
                dataTerminalReady: dtr === "1",
                requestToSend: rts === "1"
            });
        } else if (/^W(?:\d+|\d*\.\d+)$/.test(step)) await control.sleep(Number.parseFloat(step.slice(1)) * 1000);
        else return false;
    }
    return true;
}
function $dfd7bf1a3e4e1c69$export$6197b97fc3d0a397(target) {
    if (target.toLowerCase() === "esp32") return {
        enterBootSetMs: 1300,
        enterBootUnsetMs: 450
    };
    return {
        enterBootSetMs: 100,
        enterBootUnsetMs: 50
    };
}
async function $dfd7bf1a3e4e1c69$export$806071a39b8bb76a(control, target, productId, custom) {
    if (custom) {
        const ok = await $dfd7bf1a3e4e1c69$export$c631d2ae9f82788d(control, custom);
        return ok ? "custom" : "invalid";
    }
    if (productId === (0, $72ac21d1510dfdd7$export$2f0304870961b486)) {
        await $dfd7bf1a3e4e1c69$export$a90b023028ab6c70(control);
        return "bootloader";
    }
    const delays = $dfd7bf1a3e4e1c69$export$6197b97fc3d0a397(target);
    await $dfd7bf1a3e4e1c69$export$d9f205f0beeb787e(control, delays.enterBootSetMs, delays.enterBootUnsetMs);
    return "bootloader";
}



const $43aed50567359e70$var$encoder = new TextEncoder();
const $43aed50567359e70$var$LOOKBACK = 1024;
const $43aed50567359e70$var$GDB_CONTINUE = "+$c#63";
class $43aed50567359e70$export$994cc3c82a007a0 {
    /**
     * @param {IDFMonitorOptions} options Port, terminal, and the monitor settings.
     */ constructor(options){
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        this.events = new (0, $c1309904089df315$export$5a07c6a245aa8bb4)();
        this.panic = new (0, $c4bc0c8280f86fcc$export$d754ec89af93b99d)();
        this.coredump = new (0, $ab1cf83523ffae04$export$e278254a2882fea3)();
        this.gdb = new (0, $f5e221d42fc7f458$export$cfbb7deb9042d67a)();
        this.outputEnabled = true;
        this.logCapture = null;
        this.digests = [];
        this.decoder = null;
        this.keySubscription = null;
        this.writeQueue = Promise.resolve();
        this.lookback = [];
        this.waiter = null;
        this.state = "idle";
        this.stopRequested = false;
        this.paused = false;
        this.connectedOnce = false;
        this.coldFailures = 0;
        this.exitEmitted = false;
        this.loopPromise = Promise.resolve();
        this.pauseGate = Promise.resolve();
        this.resolvePause = ()=>undefined;
        this.readySettled = false;
        this.port = options.port;
        this.terminal = options.terminal;
        this.baudRate = (_a = options.baudRate) !== null && _a !== void 0 ? _a : 115200;
        this.target = (_b = options.target) !== null && _b !== void 0 ? _b : "esp32";
        this.elfFiles = (_c = options.elfFiles) !== null && _c !== void 0 ? _c : [];
        this.romElf = options.romElf;
        this.noReset = options.noReset === true;
        this.eol = options.eol === "CRLF" ? "\r\n" : options.eol === "LF" ? "\n" : "\r";
        this.decodeAddresses = options.decodeAddresses !== false;
        this.decodePanic = options.decodePanic === "backtrace";
        this.decodeCoredumps = options.decodeCoredumps !== "disable";
        this.encrypted = options.encrypted === true;
        this.reconnectDelayMs = ((_d = options.reconnectDelay) !== null && _d !== void 0 ? _d : 0.5) * 1000;
        this.openPortAttempts = (_e = options.openPortAttempts) !== null && _e !== void 0 ? _e : 1;
        this.customReset = options.customResetSequence;
        this.customHardReset = options.customHardResetSequence;
        this.wait = (_f = options.sleep) !== null && _f !== void 0 ? _f : (ms)=>new Promise((resolve)=>setTimeout(resolve, ms));
        this.timestampsEnabled = options.timestamps === true;
        this.parser = new (0, $fbf1986ca065a802$export$1361cef77c86af7d)((0, $e07a1b05df0bcdef$export$af3bf6ce06df51c0)(options.keys), (_g = options.eol) !== null && _g !== void 0 ? _g : "CR");
        this.matcher = new (0, $bb7cc78af024654d$export$da8a3f0a8c341966)((_h = options.printFilter) !== null && _h !== void 0 ? _h : "");
        this.colorizer = new (0, $fb1facad86c86ec6$export$a3cf7111e6b6bc75)(options.autoColor !== false);
        this.stamper = new (0, $fb1facad86c86ec6$export$b2378f19390bb131)(this.timestampsEnabled, (_j = options.timestampFormat) !== null && _j !== void 0 ? _j : "%Y-%m-%d %H:%M:%S");
        this.lines = new (0, $1e8d6b77916ce4af$export$847279c81ebe76ec)({
            push: (fragment, newline)=>this.handleFragment(fragment, newline),
            decodeWarning: ()=>{
                this.events.emit("decode-warning", {});
                this.note("Serial data is not valid UTF-8. Check the baud rate and the crystal frequency.");
            }
        }, (_k = options.flushIntervalMs) !== null && _k !== void 0 ? _k : 100, ()=>this.coredump.active);
        this.resetReady();
    }
    /**
     * Subscribe to a monitor event.
     * @param {K} event Event id.
     * @param {Function} handler Called with the payload.
     * @returns {IDFMonitor} This monitor, so subscriptions can be chained.
     */ on(event, handler) {
        this.events.on(event, handler);
        return this;
    }
    /**
     * Remove a subscription created with {@link on}.
     * @param {K} event Event id.
     * @param {Function} handler The same function that was registered.
     * @returns {IDFMonitor} This monitor.
     */ off(event, handler) {
        this.events.off(event, handler);
        return this;
    }
    /**
     * Subscribe to the next occurrence of an event.
     * @param {K} event Event id.
     * @param {Function} handler Called once.
     * @returns {IDFMonitor} This monitor.
     */ once(event, handler) {
        this.events.once(event, handler);
        return this;
    }
    /**
     * Open the port if it is closed, optionally hard-reset the chip, and start reading.
     * Resolves when the first open succeeds.
     * @returns {Promise<void>} Resolves when chip bytes can be received.
     */ async start() {
        var _a;
        if (this.state !== "idle") throw new (0, $72ac21d1510dfdd7$export$2d93515331bae263)("Monitor is already started");
        this.state = "running";
        this.stopRequested = false;
        this.paused = false;
        this.exitEmitted = false;
        this.connectedOnce = false;
        this.coldFailures = 0;
        try {
            await this.loadImages();
        } catch (error) {
            this.state = "idle";
            throw error;
        }
        this.keySubscription = this.terminal.onData((data)=>this.onTerminalData(data));
        this.loopPromise = this.readLoop(true);
        try {
            await this.ready;
        } catch (error) {
            (_a = this.keySubscription) === null || _a === void 0 || _a.dispose();
            this.keySubscription = null;
            this.state = "idle";
            throw error;
        }
    }
    /**
     * Stop reading, unsubscribe the terminal, and close the port.
     * @returns {Promise<void>} Resolves when the port is closed.
     */ async stop() {
        var _a, _b;
        if (this.state === "stopped") return;
        this.stopRequested = true;
        this.paused = false;
        this.state = "stopped";
        (_a = this.keySubscription) === null || _a === void 0 || _a.dispose();
        this.keySubscription = null;
        this.lines.dispose();
        this.clearExpect();
        try {
            await ((_b = this.reader) === null || _b === void 0 ? void 0 : _b.cancel());
        } catch  {
        // The in-flight read rejects when the reader is cancelled.
        }
        try {
            await this.port.close();
        } catch  {
        // Closing an already closed port is the end state we wanted.
        }
        this.settleReady();
        this.events.emit("close", {});
        this.emitExit(0);
    }
    /**
     * Hard-reset the chip through RTS.
     * @returns {Promise<void>} Resolves when the pulse has finished.
     */ async reset() {
        await this.performHardReset();
    }
    /**
     * Reset the chip into the download bootloader.
     * @returns {Promise<void>} Resolves when the sequence has finished.
     */ async bootloader() {
        await this.performBootloader();
    }
    /**
     * Write text to the device, followed by the configured end-of-line.
     * @param {string} text Characters to send. The end-of-line is added.
     * @returns {Promise<void>} Resolves when the bytes are written.
     */ async send(text) {
        await this.writeDevice($43aed50567359e70$var$encoder.encode(text + this.eol));
    }
    /**
     * Wait until a chip line matches. Recent lines are checked before new ones.
     * The pattern is tested against the line with its newline removed, so `$` matches the end.
     * @param {string | RegExp} pattern Regular expression. A string is compiled with `new RegExp`.
     * @param {number} [timeoutSeconds] When set, the promise rejects with {@link ExpectTimeoutError}.
     * @returns {Promise<string>} The matching line without its newline.
     */ expect(pattern, timeoutSeconds) {
        const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
        if (timeoutSeconds !== undefined && (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 0)) throw new (0, $72ac21d1510dfdd7$export$2d93515331bae263)("Invalid expect timeout");
        for (const line of this.lookback){
            if (regex.test(line)) return Promise.resolve(line);
        }
        return new Promise((resolve, reject)=>{
            if (this.waiter) {
                reject(new (0, $72ac21d1510dfdd7$export$2d93515331bae263)("Another expect is already waiting"));
                return;
            }
            const waiter = {
                regex: regex,
                resolve: (line)=>{
                    if (waiter.timer) clearTimeout(waiter.timer);
                    this.waiter = null;
                    resolve(line);
                }
            };
            if (timeoutSeconds !== undefined) waiter.timer = setTimeout(()=>{
                if (this.waiter !== waiter) return;
                this.waiter = null;
                this.events.emit("exit", {
                    code: 110
                });
                reject(new (0, $72ac21d1510dfdd7$export$3ce8012b5e409885)(timeoutSeconds));
            }, timeoutSeconds * 1000);
            this.waiter = waiter;
        });
    }
    /**
     * Pause the caller. Command-stream scripts use this between `send` and `expect`.
     * @param {number} seconds How long to wait.
     * @returns {Promise<void>} Resolves when the wait is over.
     */ sleep(seconds) {
        return this.wait(seconds * 1000);
    }
    /**
     * Show or hide chip text. Status lines are still written.
     * @returns {boolean} True when chip text is visible.
     */ toggleOutput() {
        this.outputEnabled = !this.outputEnabled;
        this.events.emit("output-toggle", {
            enabled: this.outputEnabled
        });
        this.note(this.outputEnabled ? "Output enabled" : "Output disabled");
        return this.outputEnabled;
    }
    /**
     * Turn line timestamps on or off.
     * @returns {boolean} True when timestamps are written.
     */ toggleTimestamps() {
        this.timestampsEnabled = !this.timestampsEnabled;
        this.stamper.setEnabled(this.timestampsEnabled);
        this.events.emit("timestamps-toggle", {
            enabled: this.timestampsEnabled
        });
        this.note(this.timestampsEnabled ? "Timestamps enabled" : "Timestamps disabled");
        return this.timestampsEnabled;
    }
    /**
     * Start or stop an in-memory copy of terminal output.
     * The captured text is on the `log-toggle` event when capture stops.
     * @returns {boolean} True when capture is running.
     */ toggleLog() {
        if (this.logCapture) {
            const text = this.logCapture.join("");
            this.logCapture = null;
            this.events.emit("log-toggle", {
                enabled: false,
                text: text
            });
            this.note("Log capture stopped");
            return false;
        }
        this.logCapture = [];
        this.events.emit("log-toggle", {
            enabled: true
        });
        this.note("Log capture started");
        return true;
    }
    /**
     * Continue a chip that stopped in the gdb stub, then read the port again.
     * Writes `+$c#63`. No local debugger is started.
     * @returns {Promise<void>} Resolves when reading has resumed.
     */ async continueStub() {
        if (!this.paused || this.state !== "running") return;
        await this.pauseGate;
        await this.writeDevice($43aed50567359e70$var$encoder.encode($43aed50567359e70$var$GDB_CONTINUE));
        try {
            await this.port.close();
        } catch  {
        // The reader cancellation may already have closed the stream.
        }
        this.paused = false;
        this.resetReady();
        this.loopPromise = this.readLoop(false);
        await this.ready;
    }
    /**
     * Load every ELF before the first open so a bad image fails `start`.
     * @returns {Promise<void>} Resolves when the images are indexed.
     */ async loadImages() {
        var _a;
        const loaded = [];
        for (const file of this.elfFiles)loaded.push(await (0, $6992e0dc3956a534$export$cb034a18878e2a2f)(file.name, file.data, false));
        if (this.romElf) loaded.push(await (0, $6992e0dc3956a534$export$cb034a18878e2a2f)("rom.elf", this.romElf, true));
        this.digests = loaded.map((elf)=>elf.sha256);
        this.decoder = new (0, $3a995f8f333ef543$export$760ec62712ebcab)(loaded);
        this.progName = (_a = loaded.find((elf)=>!elf.rom)) === null || _a === void 0 ? void 0 : _a.name;
    }
    /**
     * Read until stop, gdb pause, or a cold-open failure.
     * @param {boolean} greet True for the initial open, which may reset the chip.
     * @returns {Promise<void>} Resolves when this loop stops reading.
     */ async readLoop(greet) {
        if (greet) this.resetReady();
        let first = greet;
        while(!this.stopRequested && !this.paused){
            let reader;
            try {
                if (first || this.port.readable === null || this.port.writable === null) {
                    if (!first) try {
                        await this.port.close();
                    } catch  {
                    // Already closed while reconnecting.
                    }
                    await this.openPort(first);
                    first = false;
                }
                if (!this.port.readable) throw new Error("Port has no readable stream");
                reader = this.port.readable.getReader();
                this.reader = reader;
                while(!this.stopRequested && !this.paused){
                    const { value: value, done: done } = await reader.read();
                    if (done) throw new Error("device disconnected");
                    if (value && value.byteLength > 0) this.lines.push(value);
                }
            } catch (error) {
                this.releaseReader(reader);
                reader = undefined;
                if (this.stopRequested || this.paused) break;
                const message = error instanceof Error ? error.message : String(error);
                this.events.emit("reconnect-wait", {
                    error: message
                });
                if (!this.connectedOnce) {
                    this.coldFailures += 1;
                    if (this.openPortAttempts !== 0 && this.coldFailures >= this.openPortAttempts) {
                        this.failReady(error instanceof Error ? error : new (0, $72ac21d1510dfdd7$export$2d93515331bae263)(message));
                        this.emitExit(1);
                        this.stopRequested = true;
                        this.state = "idle";
                        break;
                    }
                }
                await this.wait(this.reconnectDelayMs);
                try {
                    await this.port.close();
                } catch  {
                // The next open creates a new stream.
                }
            } finally{
                this.releaseReader(reader);
            }
        }
    }
    /**
     * Open the port and run the startup line sequence.
     * A reconnect passes `false` and does not reset the chip.
     * @param {boolean} first True only for the first open of this session.
     * @returns {Promise<void>} Resolves when the port is open.
     */ async openPort(first) {
        if (this.port.readable === null || this.port.writable === null) await this.port.open({
            baudRate: this.baudRate
        });
        const reset = first && !this.noReset;
        if (reset && this.customHardReset) {
            const ok = await (0, $dfd7bf1a3e4e1c69$export$c631d2ae9f82788d)(this.signals(), this.customHardReset);
            if (!ok) this.note("Invalid custom hard reset sequence");
            else this.events.emit("reset", {
                kind: "custom"
            });
        } else if (reset) {
            await this.port.setSignals({
                requestToSend: true
            });
            await this.port.setSignals({
                dataTerminalReady: true
            });
            await this.port.setSignals({
                requestToSend: false
            });
            await this.port.setSignals({
                dataTerminalReady: false
            });
            await (0, $dfd7bf1a3e4e1c69$export$4ff35e5b1175d6f6)(this.signals());
            this.events.emit("reset", {
                kind: "hard"
            });
        } else {
            await this.port.setSignals({
                requestToSend: false
            });
            await this.port.setSignals({
                dataTerminalReady: false
            });
        }
        this.connectedOnce = true;
        const payload = {
            baud: this.baudRate,
            port: this.safeInfo()
        };
        if (first) {
            this.events.emit("open", payload);
            this.note("Quit: Ctrl+] | Menu: Ctrl+T | Help: Ctrl+T followed by Ctrl+H");
        } else this.events.emit("reconnect", payload);
        this.settleReady();
    }
    /**
     * Handle one terminal character at a time, matching the Python console parser.
     * @param {string} data Text from `terminal.onData`.
     * @returns {void}
     */ onTerminalData(data) {
        if (this.stopRequested) return;
        for (const key of data){
            const parsed = this.parser.parse(key);
            if (parsed.kind === "arm") continue;
            if (parsed.kind === "bytes") {
                this.writeDevice($43aed50567359e70$var$encoder.encode(parsed.data));
                continue;
            }
            this.runMenu(parsed.action, parsed.key);
        }
    }
    /**
     * Run a menu command.
     * @param {MenuAction} action Command selected by the parser.
     * @param {string} [key] Original character, for forwarded and unknown keys.
     * @returns {Promise<void>} Resolves when the command has been issued.
     */ async runMenu(action, key) {
        this.events.emit("menu", {
            action: action
        });
        switch(action){
            case "forward-menu-key":
                if (key) await this.writeDevice($43aed50567359e70$var$encoder.encode(key));
                return;
            case "help":
                this.note(this.parser.helpText());
                return;
            case "unknown":
                this.note(`Unknown menu character ${key ? (0, $e07a1b05df0bcdef$export$1893214c154a1b90)(key) : ""}`.trim());
                return;
            case "exit":
                await this.stop();
                return;
            case "reset":
                await this.performHardReset();
                return;
            case "bootloader":
                await this.performBootloader();
                return;
            case "flash":
            case "app-flash":
            case "flash-all":
                this.requestFlash(action);
                return;
            case "output":
                this.toggleOutput();
                return;
            case "log":
                this.toggleLog();
                return;
            case "timestamps":
                this.toggleTimestamps();
                return;
            default:
                return;
        }
    }
    /**
     * Pulse EN, or run the custom hard-reset sequence.
     * @returns {Promise<void>} Resolves when the lines have been restored.
     */ async performHardReset() {
        if (this.customHardReset) {
            const ok = await (0, $dfd7bf1a3e4e1c69$export$c631d2ae9f82788d)(this.signals(), this.customHardReset);
            if (!ok) {
                this.note("Invalid custom hard reset sequence");
                return;
            }
            this.events.emit("reset", {
                kind: "custom"
            });
            return;
        }
        await (0, $dfd7bf1a3e4e1c69$export$4ff35e5b1175d6f6)(this.signals());
        this.events.emit("reset", {
            kind: "hard"
        });
    }
    /**
     * Enter the bootloader with the classic, USB-JTAG, or custom sequence.
     * @returns {Promise<void>} Resolves when the sequence has finished.
     */ async performBootloader() {
        const kind = await (0, $dfd7bf1a3e4e1c69$export$806071a39b8bb76a)(this.signals(), this.target, this.safeInfo().usbProductId, this.customReset);
        if (kind === "invalid") {
            this.note("Invalid custom reset sequence");
            return;
        }
        this.events.emit("reset", {
            kind: kind
        });
    }
    /**
     * Tell the page that the operator asked to flash. This package does not run esptool.
     * @param {"flash" | "app-flash" | "flash-all"} action Which flash command was chosen.
     * @returns {void}
     */ requestFlash(action) {
        let target;
        let full = false;
        if (action === "app-flash") target = this.encrypted ? "encrypted-app-flash" : "app-flash";
        else if (action === "flash-all") {
            target = this.encrypted ? "encrypted-flash" : "flash";
            full = !this.encrypted;
        } else target = this.encrypted ? "encrypted-flash" : "flash";
        this.events.emit("flash", {
            target: target,
            full: full,
            encrypted: this.encrypted
        });
        this.note(`Flash requested (${target}${full ? ", full" : ""})`);
    }
    /**
     * Decode one chip fragment. Detectors run before the print filter.
     * @param {string} fragment Text, including a trailing newline when it has one.
     * @param {boolean} newline True when the fragment ends a line.
     * @returns {void}
     */ handleFragment(fragment, newline) {
        var _a, _b;
        const stripped = fragment.replace(/\r|\n/g, "");
        this.remember(stripped);
        if (this.decodeCoredumps) {
            const step = this.coredump.push(stripped);
            if ((step === null || step === void 0 ? void 0 : step.kind) === "prompt") {
                this.events.emit("coredump-prompt", {});
                this.send("");
            } else if ((step === null || step === void 0 ? void 0 : step.kind) === "start") this.events.emit("coredump-start", {});
            else if ((step === null || step === void 0 ? void 0 : step.kind) === "body") {
                this.events.emit("line", {
                    text: stripped,
                    printed: false
                });
                if (step.progress !== undefined) this.events.emit("coredump-progress", {
                    bytes: step.progress
                });
                return;
            } else if ((step === null || step === void 0 ? void 0 : step.kind) === "end") this.events.emit("coredump", {
                base64: step.base64,
                progName: this.progName
            });
        }
        let panicText = null;
        if (this.decodePanic) {
            const panic = this.panic.push(stripped);
            if (panic === "start") {
                this.events.emit("panic-start", {});
                this.note("Stack dump detected");
            } else if (panic === "done") panicText = this.panic.text();
        }
        const gdb = this.gdb.push(stripped);
        this.printChip(fragment, newline, stripped, this.panic.suppressing);
        if (panicText !== null) {
            const frames = (_b = (_a = this.decoder) === null || _a === void 0 ? void 0 : _a.addressesIn(panicText)) !== null && _b !== void 0 ? _b : [];
            this.events.emit("panic", {
                text: panicText,
                frames: frames
            });
        }
        if (gdb && "packet" in gdb) {
            this.paused = true;
            this.pauseGate = new Promise((resolve)=>{
                this.resolvePause = resolve;
            });
            this.events.emit("gdb_stub", {
                packet: gdb.packet,
                progName: this.progName
            });
            this.finishPause();
        } else if (gdb && "malformed" in gdb) this.note("Malformed gdb message");
    }
    /**
     * Filter, color, timestamp, and decorate one fragment.
     * @param {string} fragment Original fragment, including its newline.
     * @param {boolean} newline Whether the fragment ends a line.
     * @param {string} stripped Fragment without CR or LF.
     * @param {boolean} forceHide True while a panic stack dump is being captured.
     * @returns {void}
     */ printChip(fragment, newline, stripped, forceHide) {
        var _a;
        const flashed = (0, $1154f44d02ebc126$export$5d04e55b7c5f01e6)(stripped);
        if (flashed) {
            const compared = (0, $1154f44d02ebc126$export$60b435ea269b00)(flashed, this.digests);
            this.events.emit("elf-sha256", {
                flashed: flashed,
                match: compared.match,
                built: compared.built
            });
            if (!compared.match) this.note(`ELF SHA256 mismatch, flashed ${flashed}`);
        }
        const host = /IDF_MONITOR_EXECUTE_([A-Z0-9_]+)(?:\s+(.*))?/.exec(stripped);
        if (host) this.events.emit("host-command", {
            type: host[1],
            args: (_a = host[2]) !== null && _a !== void 0 ? _a : ""
        });
        const printed = this.outputEnabled && !forceHide && this.matcher.match(stripped);
        this.events.emit("line", {
            text: stripped,
            printed: printed
        });
        if (!printed) return;
        this.writeTerminal(this.stamper.apply(this.colorizer.apply(fragment)));
        if (!this.decodeAddresses || !this.decoder) return;
        for (const frame of this.decoder.push(stripped, newline))this.emitAddress(frame);
    }
    /**
     * Write a resolved address under the chip line and emit it.
     * @param {AddressFrame} frame Resolved program counter.
     * @returns {void}
     */ emitAddress(frame) {
        this.events.emit("address", {
            address: frame.address,
            trace: [
                frame
            ]
        });
        this.writeTerminal(`--- ${(0, $3a995f8f333ef543$export$9ab766ce7f4c1f3c)(frame)}\n`);
    }
    /**
     * Remember a line for `expect`, and complete a waiting `expect` when it matches.
     * @param {string} line Line without its newline.
     * @returns {void}
     */ remember(line) {
        this.lookback.push(line);
        if (this.lookback.length > $43aed50567359e70$var$LOOKBACK) this.lookback.shift();
        if (this.waiter && this.waiter.regex.test(line)) this.waiter.resolve(line);
    }
    /**
     * Write a monitor status block. Each line is prefixed with `--- `.
     * @param {string} text Status text. Newlines are preserved as separate status lines.
     * @returns {void}
     */ note(text) {
        const block = text.split("\n").map((line)=>`--- ${line}\n`).join("");
        this.writeTerminal(block);
        this.stamper.forceStart();
    }
    /**
     * Write to the terminal and, when capture is on, keep a copy.
     * @param {string} data Text, including ANSI sequences.
     * @returns {void}
     */ writeTerminal(data) {
        this.terminal.write(data);
        if (this.logCapture) this.logCapture.push(data);
    }
    /**
     * Queue a device write so keystrokes cannot interleave.
     * @param {Uint8Array} data Bytes to send.
     * @returns {Promise<void>} Resolves when this write finishes.
     */ writeDevice(data) {
        const copy = new Uint8Array(data);
        this.events.emit("write", {
            data: copy
        });
        this.writeQueue = this.writeQueue.then(async ()=>{
            if (!this.port.writable) throw new (0, $72ac21d1510dfdd7$export$2d93515331bae263)("Port is not writable");
            const writer = this.port.writable.getWriter();
            try {
                await writer.write(copy);
            } finally{
                writer.releaseLock();
            }
        }).catch((error)=>{
            const message = error instanceof Error ? error.message : String(error);
            this.note(`Write failed: ${message}`);
        });
        return this.writeQueue;
    }
    /**
     * Cancel the reader after `paused` is already set, then let {@link continueStub} proceed.
     * Called without awaiting so the read loop can leave `handleFragment` and notice `paused`.
     * @returns {Promise<void>} Resolves when the read loop has stopped.
     */ async finishPause() {
        var _a;
        try {
            await ((_a = this.reader) === null || _a === void 0 ? void 0 : _a.cancel());
        } catch  {
        // The in-flight read rejects when the reader is cancelled.
        }
        try {
            await this.loopPromise;
        } catch  {
        // Open failures are reported through the exit event.
        }
        this.resolvePause();
    }
    /**
     * Release a reader lock if this loop still holds it.
     * @param {ReadableStreamDefaultReader<Uint8Array> | undefined} reader Reader to release.
     * @returns {void}
     */ releaseReader(reader) {
        if (!reader) return;
        try {
            reader.releaseLock();
        } catch  {
        // cancel() already released the lock.
        }
        if (this.reader === reader) this.reader = undefined;
    }
    /**
     * Adapter passed to the reset sequences.
     * @returns {SignalControl} Line control bound to this port.
     */ signals() {
        return {
            setSignals: (signals)=>this.port.setSignals(signals),
            sleep: (ms)=>this.wait(ms)
        };
    }
    /**
     * USB identity, or an empty object when the port cannot report it.
     * @returns {SerialPortInfo} Vendor and product ids.
     */ safeInfo() {
        try {
            return this.port.getInfo();
        } catch  {
            return {};
        }
    }
    /**
     * Drop a waiting `expect` without resolving it. Used when the monitor stops.
     * @returns {void}
     */ clearExpect() {
        var _a;
        if ((_a = this.waiter) === null || _a === void 0 ? void 0 : _a.timer) clearTimeout(this.waiter.timer);
        this.waiter = null;
    }
    /**
     * Install a fresh ready promise for the next open.
     * @returns {void}
     */ resetReady() {
        this.readySettled = false;
        this.ready = new Promise((resolve, reject)=>{
            this.resolveReady = resolve;
            this.rejectReady = reject;
        });
    }
    /**
     * Resolve {@link start} or {@link continueStub} once the port is open.
     * @returns {void}
     */ settleReady() {
        if (this.readySettled) return;
        this.readySettled = true;
        this.resolveReady();
    }
    /**
     * Reject {@link start} because the port never opened.
     * @param {Error} error Open failure.
     * @returns {void}
     */ failReady(error) {
        if (this.readySettled) return;
        this.readySettled = true;
        this.rejectReady(error);
    }
    /**
     * Emit `exit` once per session.
     * @param {number} code Status code.
     * @returns {void}
     */ emitExit(code) {
        if (this.exitEmitted) return;
        this.exitEmitted = true;
        this.events.emit("exit", {
            code: code
        });
    }
}












/**
 * CDC ACM adapter so a WebUSB `USBDevice` can be passed to `IDFMonitor`.
 * The monitor only needs byte streams plus DTR and RTS.
 */ const $2f5e85f98af4bb30$var$CDC_COMM_CLASS = 0x02;
const $2f5e85f98af4bb30$var$CDC_DATA_CLASS = 0x0a;
const $2f5e85f98af4bb30$var$SET_LINE_CODING = 0x20;
const $2f5e85f98af4bb30$var$SET_CONTROL_LINE_STATE = 0x22;
function $2f5e85f98af4bb30$export$ab5e58679e1c5c3f() {
    return typeof navigator !== "undefined" && !!navigator.usb;
}
async function $2f5e85f98af4bb30$export$357ecc1e69d93684() {
    if (!navigator.usb) throw new Error("WebUSB is not available in this browser.");
    const device = await navigator.usb.requestDevice({
        filters: []
    });
    return new $2f5e85f98af4bb30$export$632fa07e7dd47be9(device);
}
class $2f5e85f98af4bb30$export$632fa07e7dd47be9 {
    /**
   * @param {USBDevice} device Device chosen with `navigator.usb.requestDevice`.
   */ constructor(device){
        this.device = device;
        this./** Byte stream from the device, or null while closed. */ readable = null;
        this./** Byte stream to the device, or null while closed. */ writable = null;
        this.closed = true;
        this.dtr = false;
        this.rts = false;
        this.commInterface = 0;
        this.dataInterface = 0;
        this.endpointIn = 0;
        this.endpointOut = 0;
        this.packetSize = 64;
    }
    /**
   * Vendor and product ids from the granted device.
   * @returns {SerialPortInfo} USB identity.
   */ getInfo() {
        return {
            usbVendorId: this.device.vendorId,
            usbProductId: this.device.productId
        };
    }
    /**
   * Open the CDC data interface and start bulk transfers.
   * @param {object} options Serial options. Only `baudRate` is applied.
   * @returns {Promise<void>} Resolves when the streams are ready.
   */ async open(options) {
        if (!this.device.opened) await this.device.open();
        if (this.device.configuration === null) {
            const configuration = this.device.configurations[0];
            if (!configuration) throw new Error("USB device has no configuration.");
            await this.device.selectConfiguration(configuration.configurationValue);
        }
        const cdc = $2f5e85f98af4bb30$var$findCdc(this.device);
        this.commInterface = cdc.commInterface;
        this.dataInterface = cdc.dataInterface;
        this.endpointIn = cdc.endpointIn;
        this.endpointOut = cdc.endpointOut;
        this.packetSize = cdc.packetSize;
        await this.claim(cdc.commInterface);
        if (cdc.dataInterface !== cdc.commInterface) await this.claim(cdc.dataInterface);
        if (cdc.dataAlternate !== 0) await this.device.selectAlternateInterface(cdc.dataInterface, cdc.dataAlternate);
        await this.setLineCoding(options.baudRate);
        this.dtr = false;
        this.rts = false;
        await this.writeControlLines();
        this.closed = false;
        this.readable = new ReadableStream({
            start: (controller)=>{
                this.readLoop(controller);
            },
            cancel: ()=>{
                this.closed = true;
            }
        });
        this.writable = new WritableStream({
            write: async (chunk)=>{
                const result = await this.device.transferOut(this.endpointOut, $2f5e85f98af4bb30$var$ownedBuffer(chunk));
                if (result.status !== "ok") throw new Error(`USB write failed: ${result.status}`);
            }
        });
    }
    /**
   * Stop transfers and release the interfaces.
   * @returns {Promise<void>} Resolves when the device is closed.
   */ async close() {
        this.closed = true;
        this.readable = null;
        this.writable = null;
        if (!this.device.opened) return;
        try {
            await this.device.releaseInterface(this.dataInterface);
            if (this.commInterface !== this.dataInterface) await this.device.releaseInterface(this.commInterface);
        } catch  {
        // The interface may already have been released.
        }
        await this.device.close();
    }
    /**
   * Set DTR and RTS. `true` is asserted. Unspecified lines keep their previous state.
   * @param {SerialOutputSignals} signals Line states to apply.
   * @returns {Promise<void>} Resolves when the control transfer finishes.
   */ async setSignals(signals) {
        if (signals.dataTerminalReady !== undefined) this.dtr = signals.dataTerminalReady;
        if (signals.requestToSend !== undefined) this.rts = signals.requestToSend;
        await this.writeControlLines();
    }
    /**
   * Claim one interface, including the case where a previous open still holds it.
   * @param {number} interfaceNumber Interface to claim.
   * @returns {Promise<void>} Resolves when the interface is claimed.
   */ async claim(interfaceNumber) {
        const already = this.device.configuration?.interfaces.some((iface)=>iface.interfaceNumber === interfaceNumber && iface.claimed);
        if (already) return;
        try {
            await this.device.claimInterface(interfaceNumber);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Could not claim the USB interface (${message}). The operating system often owns this CDC interface on desktop; Web Serial is the reliable path there.`);
        }
    }
    /**
   * SET_LINE_CODING for 8N1 at the requested baud rate.
   * @param {number} baudRate Baud rate.
   * @returns {Promise<void>} Resolves when the device accepts the coding.
   */ async setLineCoding(baudRate) {
        const coding = new Uint8Array(7);
        new DataView(coding.buffer).setUint32(0, baudRate, true);
        coding[4] = 0;
        coding[5] = 0;
        coding[6] = 8;
        await this.controlOut($2f5e85f98af4bb30$var$SET_LINE_CODING, 0, coding);
    }
    /**
   * SET_CONTROL_LINE_STATE from the stored DTR and RTS bits.
   * @returns {Promise<void>} Resolves when the device accepts the lines.
   */ async writeControlLines() {
        const value = (this.dtr ? 0x1 : 0) | (this.rts ? 0x2 : 0);
        await this.controlOut($2f5e85f98af4bb30$var$SET_CONTROL_LINE_STATE, value);
    }
    /**
   * Class control transfer addressed to the CDC communication interface.
   * @param {number} request CDC request code.
   * @param {number} value Request value.
   * @param {Uint8Array} [data] Optional payload.
   * @returns {Promise<void>} Resolves when the transfer status is ok.
   */ async controlOut(request, value, data) {
        const result = await this.device.controlTransferOut({
            requestType: "class",
            recipient: "interface",
            request: request,
            value: value,
            index: this.commInterface
        }, data ? $2f5e85f98af4bb30$var$ownedBuffer(data) : undefined);
        if (result.status !== "ok") throw new Error(`USB control transfer ${request} failed: ${result.status}`);
    }
    /**
   * Copy bulk IN packets onto the readable stream until `close`.
   * @param {ReadableStreamDefaultController<Uint8Array>} controller Stream controller.
   * @returns {Promise<void>} Resolves when reading stops.
   */ async readLoop(controller) {
        try {
            while(!this.closed){
                const result = await this.device.transferIn(this.endpointIn, this.packetSize);
                if (this.closed) break;
                if (result.status === "stall") {
                    await this.device.clearHalt("in", this.endpointIn);
                    continue;
                }
                if (result.status !== "ok" || !result.data || result.data.byteLength === 0) continue;
                const copy = new Uint8Array(result.data.byteLength);
                copy.set(new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength));
                controller.enqueue(copy);
            }
            if (!this.closed) controller.close();
        } catch (error) {
            if (!this.closed) controller.error(error);
        }
    }
}
/**
 * Find the CDC communication interface and the bulk data endpoints.
 * @param {USBDevice} device An opened device with a selected configuration.
 * @returns {CdcEndpoints} Interface and endpoint numbers.
 */ /**
 * Copy bytes into an ArrayBuffer the WebUSB transfer methods accept.
 * @param {Uint8Array} bytes Source bytes.
 * @returns {ArrayBuffer} A detached copy.
 */ function $2f5e85f98af4bb30$var$ownedBuffer(bytes) {
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    return copy;
}
function $2f5e85f98af4bb30$var$findCdc(device) {
    const configuration = device.configuration;
    if (!configuration) throw new Error("USB device has no active configuration.");
    let commInterface = null;
    let data = null;
    for (const iface of configuration.interfaces)for (const alternate of iface.alternates){
        if (alternate.interfaceClass === $2f5e85f98af4bb30$var$CDC_COMM_CLASS && commInterface === null) commInterface = iface.interfaceNumber;
        if (alternate.interfaceClass !== $2f5e85f98af4bb30$var$CDC_DATA_CLASS) continue;
        const endpointIn = alternate.endpoints.find((endpoint)=>endpoint.type === "bulk" && endpoint.direction === "in");
        const endpointOut = alternate.endpoints.find((endpoint)=>endpoint.type === "bulk" && endpoint.direction === "out");
        if (!endpointIn || !endpointOut) continue;
        data = {
            commInterface: commInterface ?? iface.interfaceNumber,
            dataInterface: iface.interfaceNumber,
            dataAlternate: alternate.alternateSetting,
            endpointIn: endpointIn.endpointNumber,
            endpointOut: endpointOut.endpointNumber,
            packetSize: endpointIn.packetSize || 64
        };
    }
    if (!data) throw new Error("This USB device has no CDC ACM data interface. Use Web Serial when the operating system already exposes the board as a serial port.");
    data.commInterface = commInterface ?? data.dataInterface;
    return data;
}


const $382e02c9bbd5d50b$var$terminalElement = $382e02c9bbd5d50b$var$required("terminal");
const $382e02c9bbd5d50b$var$term = new Terminal({
    convertEol: true
});
$382e02c9bbd5d50b$var$term.open($382e02c9bbd5d50b$var$terminalElement);
$382e02c9bbd5d50b$var$fitTerminal();
window.addEventListener("resize", $382e02c9bbd5d50b$var$fitTerminal);
const $382e02c9bbd5d50b$var$connectButton = $382e02c9bbd5d50b$var$required("connectButton");
const $382e02c9bbd5d50b$var$startButton = $382e02c9bbd5d50b$var$required("startButton");
const $382e02c9bbd5d50b$var$stopButton = $382e02c9bbd5d50b$var$required("stopButton");
const $382e02c9bbd5d50b$var$useWebUsb = $382e02c9bbd5d50b$var$required("useWebUsb");
const $382e02c9bbd5d50b$var$portStatus = $382e02c9bbd5d50b$var$required("portStatus");
const $382e02c9bbd5d50b$var$events = $382e02c9bbd5d50b$var$required("events");
const $382e02c9bbd5d50b$var$webUsbNote = $382e02c9bbd5d50b$var$required("webUsbNote");
let $382e02c9bbd5d50b$var$port = null;
let $382e02c9bbd5d50b$var$monitor = null;
if (!(0, $2f5e85f98af4bb30$export$ab5e58679e1c5c3f)()) {
    $382e02c9bbd5d50b$var$useWebUsb.disabled = true;
    $382e02c9bbd5d50b$var$useWebUsb.checked = false;
    $382e02c9bbd5d50b$var$webUsbNote.textContent = "WebUSB is not available in this browser.";
} else $382e02c9bbd5d50b$var$webUsbNote.textContent = "WebUSB asks the browser for a USB device and uses its CDC ACM interface. If the operating system already owns that interface, the claim fails and Web Serial is the path to use.";
$382e02c9bbd5d50b$var$connectButton.addEventListener("click", ()=>{
    $382e02c9bbd5d50b$var$connect();
});
$382e02c9bbd5d50b$var$startButton.addEventListener("click", ()=>{
    $382e02c9bbd5d50b$var$start();
});
$382e02c9bbd5d50b$var$stopButton.addEventListener("click", ()=>{
    $382e02c9bbd5d50b$var$stopSession();
});
$382e02c9bbd5d50b$var$required("resetButton").addEventListener("click", ()=>{
    $382e02c9bbd5d50b$var$run((current)=>current.reset());
});
$382e02c9bbd5d50b$var$required("bootloaderButton").addEventListener("click", ()=>{
    $382e02c9bbd5d50b$var$run((current)=>current.bootloader());
});
$382e02c9bbd5d50b$var$required("outputButton").addEventListener("click", ()=>{
    $382e02c9bbd5d50b$var$run((current)=>{
        current.toggleOutput();
    });
});
$382e02c9bbd5d50b$var$required("timestampButton").addEventListener("click", ()=>{
    $382e02c9bbd5d50b$var$run((current)=>{
        current.toggleTimestamps();
    });
});
$382e02c9bbd5d50b$var$required("logButton").addEventListener("click", ()=>{
    $382e02c9bbd5d50b$var$run((current)=>{
        current.toggleLog();
    });
});
$382e02c9bbd5d50b$var$required("sendButton").addEventListener("click", ()=>{
    $382e02c9bbd5d50b$var$run((current)=>current.send($382e02c9bbd5d50b$var$required("sendText").value));
});
$382e02c9bbd5d50b$var$updateButtons();
/**
 * Grant a Web Serial port, or a WebUSB device wrapped as a monitor port.
 * @returns {Promise<void>} Resolves when the picker finishes.
 */ async function $382e02c9bbd5d50b$var$connect() {
    try {
        if ($382e02c9bbd5d50b$var$useWebUsb.checked) $382e02c9bbd5d50b$var$port = await (0, $2f5e85f98af4bb30$export$357ecc1e69d93684)();
        else if (!navigator.serial) throw new Error("Web Serial is not available in this browser.");
        else $382e02c9bbd5d50b$var$port = await navigator.serial.requestPort();
        const info = $382e02c9bbd5d50b$var$port.getInfo();
        const vendor = info.usbVendorId === undefined ? "unknown" : `0x${info.usbVendorId.toString(16)}`;
        const product = info.usbProductId === undefined ? "unknown" : `0x${info.usbProductId.toString(16)}`;
        $382e02c9bbd5d50b$var$portStatus.textContent = `Granted vendor ${vendor}, product ${product}.`;
    } catch (error) {
        $382e02c9bbd5d50b$var$note($382e02c9bbd5d50b$var$messageOf(error));
    }
    $382e02c9bbd5d50b$var$updateButtons();
}
/**
 * Read the form and start one monitor on the granted port.
 * @returns {Promise<void>} Resolves when the port is open, or when start fails.
 */ async function $382e02c9bbd5d50b$var$start() {
    if (!$382e02c9bbd5d50b$var$port) {
        $382e02c9bbd5d50b$var$note("Choose a serial port first.");
        return;
    }
    if ($382e02c9bbd5d50b$var$monitor) {
        $382e02c9bbd5d50b$var$note("Monitor is already running.");
        return;
    }
    const elfFiles = [];
    const app = await $382e02c9bbd5d50b$var$readFile($382e02c9bbd5d50b$var$required("appElf"));
    if (app) elfFiles.push(app);
    const rom = await $382e02c9bbd5d50b$var$readFile($382e02c9bbd5d50b$var$required("romElf"));
    const next = new (0, $43aed50567359e70$export$994cc3c82a007a0)({
        port: $382e02c9bbd5d50b$var$port,
        terminal: {
            write: (data)=>$382e02c9bbd5d50b$var$term.write(data),
            onData: (callback)=>$382e02c9bbd5d50b$var$term.onData(callback)
        },
        elfFiles: elfFiles,
        romElf: rom?.data,
        ...$382e02c9bbd5d50b$var$readSettings()
    });
    $382e02c9bbd5d50b$var$wire(next);
    $382e02c9bbd5d50b$var$monitor = next;
    $382e02c9bbd5d50b$var$updateButtons();
    try {
        await next.start();
    } catch (error) {
        $382e02c9bbd5d50b$var$monitor = null;
        $382e02c9bbd5d50b$var$note($382e02c9bbd5d50b$var$messageOf(error));
        $382e02c9bbd5d50b$var$updateButtons();
    }
}
/**
 * Stop the running monitor. The granted port object is kept for another start.
 * @returns {Promise<void>} Resolves when the port is closed.
 */ async function $382e02c9bbd5d50b$var$stopSession() {
    const current = $382e02c9bbd5d50b$var$monitor;
    if (!current) return;
    $382e02c9bbd5d50b$var$monitor = null;
    $382e02c9bbd5d50b$var$updateButtons();
    try {
        await current.stop();
    } catch (error) {
        $382e02c9bbd5d50b$var$note($382e02c9bbd5d50b$var$messageOf(error));
    }
}
/**
 * Run a session command, or tell the user to start first.
 * @param {function(IDFMonitor): Promise<void> | void} action Command to run.
 * @returns {Promise<void>} Resolves when the command finishes.
 */ async function $382e02c9bbd5d50b$var$run(action) {
    if (!$382e02c9bbd5d50b$var$monitor) {
        $382e02c9bbd5d50b$var$note("Start the monitor first.");
        return;
    }
    try {
        await action($382e02c9bbd5d50b$var$monitor);
    } catch (error) {
        $382e02c9bbd5d50b$var$note($382e02c9bbd5d50b$var$messageOf(error));
    }
}
/**
 * Subscribe to the events the page shows while testing.
 * @param {IDFMonitor} current Monitor that is about to start.
 * @returns {void}
 */ function $382e02c9bbd5d50b$var$wire(current) {
    current.on("open", (payload)=>$382e02c9bbd5d50b$var$log("open", payload));
    current.on("reset", (payload)=>$382e02c9bbd5d50b$var$log("reset", payload));
    current.on("line", (payload)=>{
        if (!payload.printed) $382e02c9bbd5d50b$var$log("line", payload);
    });
    current.on("address", (payload)=>$382e02c9bbd5d50b$var$log("address", payload));
    current.on("elf-sha256", (payload)=>$382e02c9bbd5d50b$var$log("elf-sha256", payload));
    current.on("panic", (payload)=>$382e02c9bbd5d50b$var$log("panic", payload));
    current.on("coredump", (payload)=>$382e02c9bbd5d50b$var$log("coredump", {
            chars: payload.base64.length,
            progName: payload.progName
        }));
    current.on("gdb_stub", (payload)=>{
        $382e02c9bbd5d50b$var$log("gdb_stub", payload);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-info btn-xs";
        button.textContent = "Continue stub";
        button.addEventListener("click", ()=>{
            $382e02c9bbd5d50b$var$run((active)=>active.continueStub());
        });
        $382e02c9bbd5d50b$var$events.appendChild(button);
    });
    current.on("flash", (payload)=>{
        $382e02c9bbd5d50b$var$log("flash", payload);
        $382e02c9bbd5d50b$var$note(`Flash requested (${payload.target}${payload.full ? ", full" : ""}). Stopped. Flash with esptool-js on this port.`);
        $382e02c9bbd5d50b$var$stopSession();
    });
    current.on("host-command", (payload)=>$382e02c9bbd5d50b$var$log("host-command", payload));
    current.on("reconnect-wait", (payload)=>$382e02c9bbd5d50b$var$log("reconnect-wait", payload));
    current.on("exit", (payload)=>$382e02c9bbd5d50b$var$log("exit", payload));
}
/**
 * Settings controlled by the form. Port, terminal, and ELF bytes are added by start.
 * @returns {Omit<IDFMonitorOptions, "port" | "terminal" | "elfFiles" | "romElf">} Monitor options.
 */ function $382e02c9bbd5d50b$var$readSettings() {
    const customReset = $382e02c9bbd5d50b$var$valueOf("customResetSequence");
    const customHardReset = $382e02c9bbd5d50b$var$valueOf("customHardResetSequence");
    return {
        baudRate: $382e02c9bbd5d50b$var$numberOf("baudRate", 115200),
        target: $382e02c9bbd5d50b$var$valueOf("target") || "esp32",
        noReset: $382e02c9bbd5d50b$var$checked("noReset"),
        printFilter: $382e02c9bbd5d50b$var$valueOf("printFilter"),
        eol: $382e02c9bbd5d50b$var$valueOf("eol"),
        timestamps: $382e02c9bbd5d50b$var$checked("timestamps"),
        timestampFormat: $382e02c9bbd5d50b$var$valueOf("timestampFormat") || "%Y-%m-%d %H:%M:%S",
        decodeAddresses: $382e02c9bbd5d50b$var$checked("decodeAddresses"),
        decodePanic: $382e02c9bbd5d50b$var$valueOf("decodePanic"),
        decodeCoredumps: $382e02c9bbd5d50b$var$valueOf("decodeCoredumps"),
        autoColor: $382e02c9bbd5d50b$var$checked("autoColor"),
        reconnectDelay: $382e02c9bbd5d50b$var$numberOf("reconnectDelay", 0.5),
        openPortAttempts: $382e02c9bbd5d50b$var$numberOf("openPortAttempts", 1),
        encrypted: $382e02c9bbd5d50b$var$checked("encrypted"),
        customResetSequence: customReset || undefined,
        customHardResetSequence: customHardReset || undefined,
        keys: {
            skipMenuKey: $382e02c9bbd5d50b$var$checked("skipMenuKey")
        }
    };
}
/**
 * Read one optional ELF file.
 * @param {HTMLInputElement} input File input.
 * @returns {Promise<{ name: string, data: ArrayBuffer } | undefined>} The file, when one is selected.
 */ async function $382e02c9bbd5d50b$var$readFile(input) {
    const file = input.files?.[0];
    if (!file) return undefined;
    return {
        name: file.name,
        data: await file.arrayBuffer()
    };
}
/**
 * Append one event to the on-page log. Long values are shortened.
 * @param {string} name Event id.
 * @param {unknown} payload Event payload.
 * @returns {void}
 */ function $382e02c9bbd5d50b$var$log(name, payload) {
    const line = document.createElement("div");
    const text = JSON.stringify(payload);
    line.textContent = `${name} ${text.length > 180 ? `${text.slice(0, 180)}\u{2026}` : text}`;
    $382e02c9bbd5d50b$var$events.appendChild(line);
    $382e02c9bbd5d50b$var$events.scrollTop = $382e02c9bbd5d50b$var$events.scrollHeight;
}
/**
 * Write a page message into the terminal.
 * @param {string} text Message without a newline.
 * @returns {void}
 */ function $382e02c9bbd5d50b$var$note(text) {
    $382e02c9bbd5d50b$var$term.write(`\r\n${text}\r\n`);
}
/**
 * Enable start only after a port is granted, and stop only while a session exists.
 * @returns {void}
 */ function $382e02c9bbd5d50b$var$updateButtons() {
    $382e02c9bbd5d50b$var$startButton.disabled = $382e02c9bbd5d50b$var$port === null || $382e02c9bbd5d50b$var$monitor !== null;
    $382e02c9bbd5d50b$var$stopButton.disabled = $382e02c9bbd5d50b$var$monitor === null;
    $382e02c9bbd5d50b$var$connectButton.disabled = $382e02c9bbd5d50b$var$monitor !== null;
}
/**
 * @param {string} id Element id.
 * @returns {T} The element.
 */ /** Size the terminal to the column so a fixed column count does not spill the page. */ function $382e02c9bbd5d50b$var$fitTerminal() {
    const probe = $382e02c9bbd5d50b$var$terminalElement.querySelector(".xterm-char-measure-element");
    if (!(probe instanceof HTMLElement)) return;
    const metrics = probe.getBoundingClientRect();
    if (metrics.width < 1 || metrics.height < 1) return;
    const cols = Math.max(40, Math.floor(($382e02c9bbd5d50b$var$terminalElement.clientWidth - 16) / metrics.width));
    const rows = Math.max(10, Math.floor(($382e02c9bbd5d50b$var$terminalElement.clientHeight - 16) / metrics.height));
    $382e02c9bbd5d50b$var$term.resize(cols, rows);
}
function $382e02c9bbd5d50b$var$required(id) {
    const found = document.getElementById(id);
    if (!found) throw new Error(`Missing #${id}`);
    return found;
}
/**
 * @param {string} id Input id.
 * @returns {string} Trimmed value.
 */ function $382e02c9bbd5d50b$var$valueOf(id) {
    return $382e02c9bbd5d50b$var$required(id).value.trim();
}
/**
 * @param {string} id Checkbox id.
 * @returns {boolean} Whether it is checked.
 */ function $382e02c9bbd5d50b$var$checked(id) {
    return $382e02c9bbd5d50b$var$required(id).checked;
}
/**
 * @param {string} id Numeric input id.
 * @param {number} fallback Value used when the field is empty or invalid.
 * @returns {number} Parsed number.
 */ function $382e02c9bbd5d50b$var$numberOf(id, fallback) {
    const parsed = Number($382e02c9bbd5d50b$var$valueOf(id));
    return Number.isFinite(parsed) ? parsed : fallback;
}
/**
 * @param {unknown} error Thrown value.
 * @returns {string} A message suitable for the terminal.
 */ function $382e02c9bbd5d50b$var$messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}


//# sourceMappingURL=typescript.20754f24.js.map
