export const SOFTWARE_EXAMPLES = [
  { name: "SkyQL.mdv", title: "SkyQL", description: "Planetarium for the QL · © 2026 Luis Cunha · MIT code; CC BY-SA 4.0 data.", symbol: "✦",
    notice: "Arrow keys move the view · +/− zoom · F searches · Q quits." },
  { name: "qui235m.zip", title: "Psion Quill", description: "Word processor · v2.35 · © Psion · Free copying on a non-profit basis.", symbol: "✎" },
  { name: "aba235m.zip", title: "Psion Abacus", description: "Spreadsheet · v2.35 · © Psion · Free copying on a non-profit basis.", symbol: "▦" },
  { name: "eas235m.zip", title: "Psion Easel", description: "Data graphics · v2.35 · © Psion · Free copying on a non-profit basis.", symbol: "▥" },
  { name: "arc238m.zip", title: "Psion Archive", description: "Database · v2.38 · © Psion · Free copying on a non-profit basis.", symbol: "▤" },
  { name: "chess_mk.zip", title: "Psion Chess", description: "Richard Lang · © 1984 Psion Ltd. · Freeware. QL edition: Jochen Hassler; 3D fix: Marcel Kilgus.", symbol: "♞",
    notice: "Direct startup, no master cartridge required. Press a key to begin; F2 toggles the 3D view." },
  { name: "Spook.zip", title: "Spook", description: "© 1985 Damon Chaplin · Public domain.", symbol: "◈" },
  { name: "Electric_Dreams_Melody_QL.mdv", title: "Electric Dreams", description: "Melody on the QL · Philip Oakey / Giorgio Moroder · Original MIDI: Roger St louis.", symbol: "♫",
    notice: "Enable sound. Esc stops · Then R repeats or Q quits." },
];

export async function loadSoftwareExamples(fetchImpl = fetch) {
  return Promise.all(SOFTWARE_EXAMPLES.map(async (example) => {
    try {
      const response = await fetchImpl(`./local-software/${example.name}`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return null;
      const file = new File([await response.arrayBuffer()], example.name, { lastModified: 0 });
      return Object.assign(file, { displayName: example.title, description: example.description, symbol: example.symbol, notice: example.notice, localExample: true });
    } catch { return null; }
  }));
}
