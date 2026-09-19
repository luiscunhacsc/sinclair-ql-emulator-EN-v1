import { MICRODRIVE_FORMAT } from "../devices/microdrive.js";

const PREFIX = "sinclair-ql-project:";

// One atomic storage write per snapshot: a failed save cannot erase older work.
export class CartridgeProjects {
  constructor(storage = () => globalThis.localStorage) { this.storage = storage; }

  list() {
    const storage = this.storage();
    const projects = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      try {
        const project = JSON.parse(storage.getItem(key));
        if (project.version !== 1 || typeof project.name !== "string" || !Number.isFinite(project.savedAt)
          || typeof project.data !== "string" || atob(project.data).length !== MICRODRIVE_FORMAT.imageSize) continue;
        projects.push({ ...project, id: key.slice(PREFIX.length) });
      } catch { /* An invalid entry must not hide other recoverable projects. */ }
    }
    return projects.sort((a, b) => b.savedAt - a.savedAt);
  }

  save(image, name) {
    const bytes = image.toUint8Array();
    if (bytes.length !== MICRODRIVE_FORMAT.imageSize) throw new Error("Imagem de Microdrive inválida.");
    name = String(name).trim();
    if (!name || name.length > 80) throw new Error("Escolha um nome de projeto entre 1 e 80 caracteres.");
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    const id = crypto.randomUUID();
    const project = { version: 1, name, savedAt: Date.now(), data: btoa(binary),
      writeProtected: image.writeProtected, physicalSectorCount: image.physicalSectorCount, spliceSector: image.spliceSector };
    this.storage().setItem(PREFIX + id, JSON.stringify(project));
    return { ...project, id };
  }

  remove(id) { this.storage().removeItem(PREFIX + id); }

  file(project) {
    const bytes = Uint8Array.from(atob(project.data), (character) => character.charCodeAt(0));
    return { name: project.name.toLowerCase().endsWith(".mdv") ? project.name : `${project.name}.mdv`,
      size: bytes.length, lastModified: project.savedAt, projectId: project.id,
      writeProtected: project.writeProtected, physicalSectorCount: project.physicalSectorCount, spliceSector: project.spliceSector,
      arrayBuffer: async () => bytes.slice().buffer };
  }
}
