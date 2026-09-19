export const SOFTWARE_EXAMPLES = [
  { name: "SkyQL.mdv", title: "SkyQL", description: "Planetário para o QL · © 2026 Luis Cunha · Código MIT; dados CC BY-SA 4.0.", symbol: "✦",
    notice: "Cursores movem a vista · +/− zoom · F procura · Q sai." },
  { name: "qui235m.zip", title: "Psion Quill", description: "Processador de texto · v2.35 · © Psion · Cópia gratuita sem fins lucrativos.", symbol: "✎" },
  { name: "aba235m.zip", title: "Psion Abacus", description: "Folha de cálculo · v2.35 · © Psion · Cópia gratuita sem fins lucrativos.", symbol: "▦" },
  { name: "eas235m.zip", title: "Psion Easel", description: "Gráficos de dados · v2.35 · © Psion · Cópia gratuita sem fins lucrativos.", symbol: "▥" },
  { name: "arc238m.zip", title: "Psion Archive", description: "Base de dados · v2.38 · © Psion · Cópia gratuita sem fins lucrativos.", symbol: "▤" },
  { name: "chess_mk.zip", title: "Psion Chess", description: "Richard Lang · © 1984 Psion Ltd. · Freeware. Edição QL: Jochen Hassler; correção 3D: Marcel Kilgus.", symbol: "♞",
    notice: "Arranque direto, sem cartucho mestre. Prima uma tecla para começar; F2 alterna a vista 3D." },
  { name: "Spook.zip", title: "Spook", description: "© 1985 Damon Chaplin · Domínio público.", symbol: "◈" },
  { name: "Electric_Dreams_Melody_QL.mdv", title: "Electric Dreams", description: "Melodia no QL · Philip Oakey / Giorgio Moroder · MIDI original: Roger St louis.", symbol: "♫",
    notice: "Ative o som. Esc interrompe · Depois, R repete ou Q sai." },
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
