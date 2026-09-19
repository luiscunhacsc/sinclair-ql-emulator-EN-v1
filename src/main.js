import { QLBus } from "./core/bus.js";
import { MC68008 } from "./core/mc68008.js";
import { ZX8301, ZX8301_DISPLAY } from "./devices/zx8301.js";
import { ZX8302 } from "./devices/zx8302.js";
import { MICRODRIVE_FORMAT } from "./devices/microdrive.js";
import { importQlPackage } from "./formats/ql-package.js";
import { computerFrameSource } from "./ui/computer-frame.js";
import { MicrodriveProtection, canSaveMicrodrive } from "./ui/microdrive-protection.js";
import {
  GUIDE_LESSONS,
  adjacentGuideLesson,
  guideHash,
  guideLesson,
  guideLessonIdFromHash,
  guideLessonIndex,
  matchingGuideLessons,
} from "./ui/guide-content.js";
import { QLAudio } from "./ui/ql-audio.js";
import { QlKeyboardInput } from "./ui/ql-keyboard.js";
import { guideExampleEvents, qlLineEditorActive } from "./ui/ql-text-input.js";
import { QLChatBridge, chatTerminalExample, localDemoReply } from "./ui/ql-chat.js";
import { ChatHistory } from "./ui/chat-history.js";
import { PowerControl, powerOffMachine } from "./ui/power-control.js";
import { MicrodriveMenu } from "./ui/microdrive-menu.js";
import { loadSoftwareExamples } from "./ui/software-examples.js";
import { CartridgeProjects } from "./ui/cartridge-projects.js";
import { requestChatReply } from "./ui/chat-client.js";
import { initializeGeminiSetup } from "./ui/gemini-setup.js";
import { OriginalQlModeDialog, restartWithoutChat } from "./ui/original-ql-mode.js";
import { waitForQlCycles, waitForSuperBasic, waitForChatReady, chatLoadingConsumesKey } from "./ui/ql-program-loader.js";
import {
  adjacentPresentationMode,
  normalizePresentationMode,
  presentationLabel,
} from "./ui/presentation-mode.js";
import {
  formatFileSize,
  MICRODRIVE_COUNT,
  microdriveName,
  microdriveActionBlockReason,
  softwareFileKey,
  softwareFormat,
  supportedSoftwareFiles,
} from "./ui/software-library.js";

const DEFAULT_ROM = "./roms/minerva/minerva-1.98a1.bin";
const CPU_HZ = 7_500_000;
const MAX_FRAME_CYCLES = CPU_HZ / 20;
const PRESENTATION_STORAGE_KEY = "sinclair-ql-presentation";
const SOUND_STORAGE_KEY = "sinclair-ql-sound";
const GUIDE_PROGRESS_STORAGE_KEY = "sinclair-ql-guide-progress";

for (const link of document.querySelectorAll(".ql-video-card")) {
  link.addEventListener("click", (event) => {
    // Preserve explicit browser gestures such as Ctrl/Cmd-click.
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const width = Math.min(1100, window.screen.availWidth);
    const height = Math.min(760, window.screen.availHeight);
    window.open(link.href, "_blank", `popup=yes,width=${width},height=${height},noopener,noreferrer`);
  });
}

const zx8301 = new ZX8301();
const qlAudio = new QLAudio({ onStateChange: updateSoundControl });
let chatBridge = null;
const zx8302 = new ZX8302({
  onSound: (event) => qlAudio.handleIpcEvent(event),
  onSerial: (event) => chatBridge?.transmit(event),
});
const bus = new QLBus({ devices: [zx8301, zx8302] });
const cpu = new MC68008(bus);
const qlKeyboard = new QlKeyboardInput(zx8302);
const romInput = document.querySelector("#rom-file");
const openSoftwareLibraryButton = document.querySelector("#open-software-library");
const appShell = document.querySelector("#app-shell");
const openGuideButton = document.querySelector("#open-guide");
const closeGuideButton = document.querySelector("#close-guide");
const guidePanel = document.querySelector("#guide-panel");
const guideSearch = document.querySelector("#guide-search");
const guideLessons = document.querySelector("#guide-lessons");
const guideLessonArticle = document.querySelector("#guide-lesson");
const guideChapter = document.querySelector("#guide-chapter");
const guideManualReference = document.querySelector("#guide-manual-reference");
const guidePosition = document.querySelector("#guide-position");
const guideLessonTitle = document.querySelector("#guide-lesson-title");
const guideSummary = document.querySelector("#guide-summary");
const guideExplanation = document.querySelector("#guide-explanation");
const guideReading = document.querySelector("#guide-reading");
const guideNote = document.querySelector("#guide-note");
const guideCodeKind = document.querySelector("#guide-code-kind");
const guideCode = document.querySelector("#guide-code");
const guideExperiment = document.querySelector("#guide-experiment");
const guideLoadButton = document.querySelector("#guide-load");
const guideRunButton = document.querySelector("#guide-run");
const guideCancelButton = document.querySelector("#guide-cancel");
const guideStatus = document.querySelector("#guide-status");
const guideProgressBar = document.querySelector("#guide-progress-bar");
const guideCourseStatus = document.querySelector("#guide-course-status");
const guideCourseBar = document.querySelector("#guide-course-bar");
const guidePreviousButton = document.querySelector("#guide-previous");
const guideNextButton = document.querySelector("#guide-next");
const guideSequence = document.querySelector("#guide-sequence");
const chatSettings = document.querySelector("#chat-settings");
const openChatButtons = [...document.querySelectorAll("#open-chat, [data-open-chat]")];
const chatProvider = document.querySelector("#chat-provider");
const chatConnection = document.querySelector("#chat-connection");
const startChatButton = document.querySelector("#start-chat");
let chatHostToken = null;
let chatLaunching = false;
let chatProgramLoaded = false;
let chatLaunchTask = null;
const chatLaunch = document.querySelector("#chat-launch");
const chatLaunchStatus = document.querySelector("#chat-launch-status");
const chatLaunchProgress = document.querySelector("#chat-launch-progress");
const chatRetry = document.querySelector("#chat-retry");
const chatType = document.querySelector("#chat-type");
const softwareLibrary = document.querySelector("#software-library");
const softwareFilesInput = document.querySelector("#software-files");
const softwareFolderInput = document.querySelector("#software-folder");
const softwareFileList = document.querySelector("#software-file-list");
const softwareDestinations = document.querySelector("#software-destinations");
const softwareCount = document.querySelector("#software-count");
const softwareDropzone = document.querySelector("#software-dropzone");
const microdriveRack = document.querySelector("#microdrive-rack");
const driveLeds = [...document.querySelectorAll("[data-drive-led]")];
const microdriveActivity = document.querySelector("#microdrive-activity");
const selectedCartridge = document.querySelector("#selected-cartridge");
const resumeMicrodrives = document.querySelector("#resume-microdrives");
let lastRenderedMicrodriveSelection = null;
const softwareLibraryStatus = document.querySelector("#software-library-status");
const status = document.querySelector("#status");
const advancedControls = document.querySelector("#advanced-controls");
const machineDiagnostics = document.querySelector("#machine-diagnostics");
const runButton = document.querySelector("#run");
const stepButton = document.querySelector("#step");
const resetButton = document.querySelector("#reset");
const soundButton = document.querySelector("#sound-toggle");
const fullscreenButton = document.querySelector("#fullscreen");
const computerStage = document.querySelector(".computer-stage");
const fullSystemFrame = document.querySelector(".full-system-frame");
const presentationButtons = [...document.querySelectorAll("[data-presentation-option]")];
const screenMessage = document.querySelector("#screen-message");
const canvas = document.querySelector("#screen");
const context = canvas.getContext("2d", { alpha: false });
const image = context.createImageData(ZX8301_DISPLAY.width, ZX8301_DISPLAY.height);
const chatHistory = new ChatHistory(document.querySelector("#chat-history"), canvas);
const originalQlMode = new OriginalQlModeDialog(document.querySelector("#original-ql-mode"), {
  isChatMode: () => chatProgramLoaded,
  restart: async () => {
    await restartWithoutChat({
      bridge: chatBridge,
      cancelLoading: () => cancelGuideTyping("Carregamento do chat cancelado para regressar ao QL original."),
      loading: chatLaunchTask,
      reset: () => {
        resetMachine();
        chatBridge = null;
        chatLaunch.hidden = true;
        chatRetry.hidden = true;
        chatLaunchProgress.hidden = true;
        chatLaunch.dataset.state = "idle";
        chatLaunchStatus.textContent = "";
        chatHostToken = null;
        chatProvider.value = "demo";
      },
      start: () => startExecution("De volta ao QL de sempre. Prima F1 no ecrã inicial para entrar no SuperBASIC — sem ligação a IA."),
    });
  },
});

let running = false;
let machineStarted = false;
let powerTransition = false;
let lastFrameTime = performance.now();
let loadedRomName = "";
let animationFrameId = null;
let selectedSoftwareKey = null;
let softwareBusy = false;
let virginMicrodriveCount = 0;
let activeGuideLessonId = GUIDE_LESSONS[0].id;
let guideTypingController = null;
let guideTypingTask = null;
let guideReplacementConfirmed = false;
let guideCancelMessage = "Carregamento cancelado.";
const completedGuideLessons = initialCompletedGuideLessons();
const powerControl = new PowerControl({
  toggle: runButton,
  actions: document.querySelectorAll("[data-power-on]"),
  state: () => ({ enabled: bus.romLoaded && !powerTransition && !softwareBusy, running, started: machineStarted }),
  start: () => startExecution(),
  stop: () => void changePower(false),
  focusScreen: () => {
    canvas.scrollIntoView({ block: "nearest" });
    canvas.focus({ preventScroll: true });
  },
});

const softwareFiles = new Map();
const microdriveProtection = new MicrodriveProtection();
const mountedProtectionKeys = new Map();
const cartridgeProjects = new CartridgeProjects();
const driveMenu = new MicrodriveMenu(document.querySelector("#drive-menu"), {
  state: (slot) => ({ mounted: zx8302.microdriveAt(slot), selection: zx8302.microdriveSelection,
    busy: softwareBusy || Boolean(guideTypingController) || powerTransition, running,
    canBoot: bus.romLoaded && !powerTransition,
    canFormat: bus.romLoaded && machineStarted && !guideTypingController && !zx8302.microdriveSelection }),
  select: (slot) => {
    for (const button of document.querySelectorAll("[data-open-drive]")) button.dataset.selected = String(Number(button.dataset.openDrive) === slot);
  },
  library: () => [...softwareFiles.values()].filter((file) => !file.virgin && !file.projectId),
  projects: () => cartridgeProjects.list(),
  projectFile: (project) => cartridgeProjects.file(project),
  mount: async (slot, file) => {
    const key = softwareFileKey(file);
    softwareFiles.set(key, file);
    selectedSoftwareKey = key;
    renderSoftwareFiles();
    if (await mountSoftware(slot, { file })) driveMenu.showView("home");
  },
  create: async (slot, name, format) => {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,9}$/.test(name)) throw new Error("Use até 10 letras, números ou sublinhados; comece por uma letra.");
    if (format && (!bus.romLoaded || !machineStarted || guideTypingController || zx8302.microdriveSelection)) throw new Error("Deixe o QL pronto no SuperBASIC e aguarde que os motores parem antes de preparar o cartucho.");
    if (!await createVirginMicrodrive(slot, name)) return false;
    if (format) {
      // Only this newly-created medium is formatted; existing media go through
      // the replacement confirmation before creation succeeds.
      const loaded = await loadGuideExample({ run: true, example: {
        kind: "command", title: `Preparar MDV${slot}`, code: `FORMAT mdv${slot}_${name}`,
      } });
      const message = loaded ? `FORMAT enviado para o novo cartucho em MDV${slot}. Aguarde que a luz apague e confirme com DIR mdv${slot}_.`
        : `O cartucho foi inserido, mas a preparação não terminou. Com o QL pronto, execute FORMAT mdv${slot}_${name}.`;
      setSoftwareLibraryStatus(message, loaded ? "ready" : "error");
      setStatus(message, loaded ? "ready" : "error");
    }
    return true;
  },
  saveProject: (slot, name) => {
    if (microdriveOperationBlocked(slot, "save")) return;
    const mounted = zx8302.microdriveAt(slot);
    if (!mounted) throw new Error("Esta unidade não tem cartucho.");
    try { cartridgeProjects.save(mounted, name); }
    catch (error) { throw new Error(`Não foi possível guardar o projeto: ${error.message} Pode exportar .mdv para o computador ou remover cópias antigas de Os meus projetos.`); }
    mounted.markClean();
    updateControls();
    setSoftwareLibraryStatus(`${name}: nova cópia guardada em Os meus projetos, neste navegador.`, "ready");
  },
  removeProject: (project) => {
    if (window.confirm(`Remover a cópia guardada de ${project.name}? Os cartuchos já inseridos continuam na unidade.`)) cartridgeProjects.remove(project.id);
  },
  save: (slot) => saveMicrodrive(slot),
  protection: (slot) => toggleMicrodriveProtection(slot),
  eject: (slot) => { ejectMicrodrive(slot); driveMenu.showView("home"); },
  resume: () => { if (!running) startExecution("QL retomado para concluir a operação nos cartuchos."); },
  boot: async (slot) => {
    if (slot !== 1 || !zx8302.microdriveAt(slot) || !bus.romLoaded || microdriveOperationBlocked(slot, "boot")) return;
    await changePower(true);
    zx8302.enqueueKey(57);
    driveMenu.opener = canvas;
    driveMenu.root.close();
    canvas.focus();
  },
  guide: () => openMicrodriveGuide("primeiro-cartucho-format"),
  all: () => openSoftwareLibrary(),
});

async function openDriveManager(slot, opener) {
  if (chatProgramLoaded && !await originalQlMode.request("microdrive")) return;
  if (softwareLibrary.open) softwareLibrary.close();
  driveMenu.open(slot, opener);
}

for (const button of document.querySelectorAll("[data-open-drive]")) {
  button.addEventListener("click", () => void openDriveManager(Number(button.dataset.openDrive), button));
}

function hexadecimal(value, width = 8) {
  return `0x${value.toString(16).padStart(width, "0")}`;
}

function setStatus(message, kind = "info") {
  status.textContent = message;
  status.dataset.kind = kind;
}

function updateControls() {
  const enabled = bus.romLoaded && !powerTransition && !softwareBusy;
  powerControl.update();
  stepButton.disabled = !enabled || running;
  resetButton.disabled = !enabled || !machineStarted;
  guideLoadButton.disabled = !enabled || Boolean(guideTypingController);
  guideRunButton.disabled = !enabled || Boolean(guideTypingController);
  startChatButton.disabled = !enabled || Boolean(guideTypingController);
  for (const button of openChatButtons) button.disabled = !enabled || Boolean(guideTypingController) || chatLaunching;
  renderMicrodriveRack();
}

function setGuideStatus(message, kind = "info") {
  guideStatus.textContent = message;
  guideStatus.dataset.kind = kind;
}

function initialCompletedGuideLessons() {
  try {
    const stored = JSON.parse(localStorage.getItem(GUIDE_PROGRESS_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(stored)) return new Set();
    const knownIds = new Set(GUIDE_LESSONS.map((lesson) => lesson.id));
    return new Set(stored.filter((id) => knownIds.has(id)));
  } catch {
    return new Set();
  }
}

function storeCompletedGuideLessons() {
  try {
    localStorage.setItem(GUIDE_PROGRESS_STORAGE_KEY, JSON.stringify([...completedGuideLessons]));
  } catch {
    // Storage can be unavailable in private or embedded browsing contexts.
  }
}

function renderGuideCourseProgress() {
  const completed = completedGuideLessons.size;
  guideCourseStatus.textContent = `${completed} de ${GUIDE_LESSONS.length} lições experimentadas`;
  guideCourseBar.style.width = `${(completed / GUIDE_LESSONS.length) * 100}%`;
}

function renderGuideNavigation() {
  const matches = matchingGuideLessons(guideSearch.value);
  guideLessons.replaceChildren();
  if (matches.length === 0) {
    guideLessons.append(element("p", "guide-no-results", "Nenhuma lição corresponde à pesquisa."));
    return;
  }
  for (const lesson of matches) {
    const button = element("button", "guide-lesson-link");
    button.type = "button";
    button.dataset.guideLesson = lesson.id;
    const number = element("span", "guide-lesson-number", String(lesson.chapterNumber).padStart(2, "0"));
    const title = element("span", "guide-lesson-name", lesson.title);
    const complete = element("span", "guide-lesson-complete", "✓");
    complete.setAttribute("aria-hidden", "true");
    button.append(number, title, complete);
    if (completedGuideLessons.has(lesson.id)) button.dataset.complete = "true";
    if (lesson.id === activeGuideLessonId) button.setAttribute("aria-current", "page");
    guideLessons.append(button);
  }
  renderGuideCourseProgress();
}

function renderGuideLesson(id) {
  const lesson = guideLesson(id);
  const index = guideLessonIndex(lesson.id);
  activeGuideLessonId = lesson.id;
  guideLessonArticle.dataset.accent = lesson.accent;
  guideChapter.textContent = lesson.chapter;
  guideManualReference.textContent = lesson.manualReference;
  guidePosition.textContent = `${index + 1} / ${GUIDE_LESSONS.length}`;
  guideLessonTitle.textContent = lesson.title;
  guideSummary.textContent = lesson.summary;
  guideExplanation.textContent = lesson.explanation;
  guideReading.replaceChildren();
  guideReading.hidden = !lesson.sections?.length;
  for (const section of lesson.sections ?? []) {
    const block = element(section.collapsible ? "details" : "section", "guide-reading-section");
    block.append(element(section.collapsible ? "summary" : "h4", "", section.title));
    if (section.text) block.append(element("p", "", section.text));
    if (section.steps) {
      const steps = element("ol", "guide-reading-steps");
      steps.append(...section.steps.map((step) => element("li", "", step)));
      block.append(steps);
    }
    if (section.commands) {
      const commands = element("dl", "guide-command-reference");
      for (const command of section.commands) {
        commands.append(element("dt", "", command.name));
        const description = element("dd", "");
        if (command.example) description.append(element("code", "", command.example));
        description.append(element("p", "", command.description));
        commands.append(description);
      }
      block.append(commands);
    }
    if (section.source) {
      const source = element("a", "guide-reference-source", "Consultar o manual de referência ↗");
      source.href = section.source;
      source.target = "_blank";
      source.rel = "noopener";
      block.append(source);
    }
    guideReading.append(block);
  }
  guideNote.textContent = lesson.note ?? "";
  guideNote.hidden = !lesson.note;
  guideCodeKind.textContent = lesson.kind === "command" ? "comando imediato" : "programa";
  guideExperiment.textContent = lesson.experiment;
  guideLoadButton.textContent = lesson.kind === "command" ? "Colocar comando" : "Carregar no QL";
  guideRunButton.textContent = lesson.kind === "command" ? "Executar comando" : "Carregar e executar";
  guideCode.replaceChildren(...lesson.code.split("\n").map((line) => element("li", "", line)));
  guidePreviousButton.disabled = index === 0;
  guideNextButton.disabled = index === GUIDE_LESSONS.length - 1;
  guidePreviousButton.title = index > 0 ? adjacentGuideLesson(lesson.id, -1).title : "";
  guideNextButton.title = index < GUIDE_LESSONS.length - 1
    ? adjacentGuideLesson(lesson.id, 1).title
    : "";
  guideSequence.textContent = `Lição ${index + 1} de ${GUIDE_LESSONS.length}`;
  renderGuideNavigation();
}

async function openGuide(id = activeGuideLessonId, { updateHash = true, focus = true } = {}) {
  if (chatProgramLoaded && !await originalQlMode.request("guide")) return false;
  renderGuideLesson(id);
  guidePanel.hidden = false;
  appShell.dataset.guideOpen = "true";
  openGuideButton.setAttribute("aria-expanded", "true");
  if (updateHash && location.hash !== guideHash(activeGuideLessonId)) {
    history.pushState(null, "", guideHash(activeGuideLessonId));
  }
  if (focus) closeGuideButton.focus();
  return true;
}

function closeGuide({ updateHash = true, restoreFocus = true } = {}) {
  guidePanel.hidden = true;
  appShell.dataset.guideOpen = "false";
  openGuideButton.setAttribute("aria-expanded", "false");
  if (updateHash && guideLessonIdFromHash(location.hash)) {
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  }
  if (restoreFocus) openGuideButton.focus();
}

function setGuideTypingState(busy, progress = 0) {
  guideProgressBar.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
  guideCancelButton.hidden = !busy;
  guideLoadButton.disabled = busy || !bus.romLoaded || powerTransition;
  guideRunButton.disabled = busy || !bus.romLoaded || powerTransition;
  startChatButton.disabled = busy || !bus.romLoaded || powerTransition;
  for (const button of openChatButtons) button.disabled = busy || !bus.romLoaded || chatLaunching || powerTransition;
  guideSearch.disabled = busy;
  for (const button of guideLessons.querySelectorAll("button")) button.disabled = busy;
  const index = guideLessonIndex(activeGuideLessonId);
  guidePreviousButton.disabled = busy || index === 0;
  guideNextButton.disabled = busy || index === GUIDE_LESSONS.length - 1;
}

function abortableDelay(milliseconds, signal) {
  if (signal.aborted) return Promise.reject(new DOMException("Operação cancelada.", "AbortError"));
  return new Promise((resolve, reject) => {
    const complete = () => {
      signal.removeEventListener("abort", cancel);
      resolve();
    };
    const cancel = () => {
      clearTimeout(timer);
      reject(new DOMException("Operação cancelada.", "AbortError"));
    };
    const timer = setTimeout(complete, milliseconds);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

async function waitForQlKeyboard(signal) {
  const started = performance.now();
  while (zx8302.keyboardQueue.length >= 2) {
    if (performance.now() - started > 5000) {
      throw new Error("O QL não está a aceitar entrada do teclado.");
    }
    await abortableDelay(12, signal);
  }
}

function cancelGuideTyping(message = "Carregamento cancelado.") {
  if (!guideTypingController) return;
  guideCancelMessage = message;
  zx8302.clearKeyboardQueue();
  guideTypingController.abort();
}

async function loadGuideExample({ run = false, example = null, beforeLoad = () => {}, prepareInput = null, onProgress = () => {}, waitUntilReady = null } = {}) {
  if (guideTypingController || !bus.romLoaded || powerTransition) return;
  if (!example && chatProgramLoaded) {
    // Let the user enter SuperBASIC at the fresh boot screen before injecting
    // an example; otherwise those commands would reach the F1/F2 prompt.
    await originalQlMode.request("guide");
    return;
  }
  const lesson = example ?? guideLesson(activeGuideLessonId);
  const warnings = [];
  if (lesson.replacesProgram || (lesson.kind === "program" && (!guideReplacementConfirmed || example))) {
    warnings.push("Carregar este exemplo substitui o programa SuperBASIC atualmente na memória.");
  }
  if (lesson.writesMicrodrive) {
    const drives = lesson.microdriveTargets ?? "mdv1_";
    warnings.push(`Este exemplo escreve em ${drives}; confirme que está montado o cartucho correto e que pode ser alterado.${lesson.formatsMicrodrive ? " FORMAT apaga todo o conteúdo do cartucho de destino." : ""}`);
  } else if (lesson.kind === "program" && !guideReplacementConfirmed) {
    warnings.push("Os Microdrives não serão alterados.");
  }
  if (warnings.length > 0 && !window.confirm(`${warnings.join("\n\n")}\n\nContinuar?`)) return;
  if (lesson.kind === "program") guideReplacementConfirmed = true;
  chatBridge?.stop();
  chatHistory.hide();
  chatLaunch.hidden = true;
  chatType.disabled = true;
  beforeLoad();

  guideTypingController = new AbortController();
  let finishTyping;
  guideTypingTask = new Promise((resolve) => { finishTyping = resolve; });
  guideCancelMessage = "Carregamento cancelado.";
  const { signal } = guideTypingController;
  setGuideTypingState(true, 0);
  setGuideStatus(`A enviar “${lesson.title}” para o teclado do QL…`);
  if (!running) startExecution("Em execução — a receber um exemplo do guia.");

  try {
    if (prepareInput) await prepareInput(signal);
    const events = guideExampleEvents(lesson, { run, editingLine: qlLineEditorActive(bus) });
    for (let index = 0; index < events.length; index += 1) {
      await waitForQlKeyboard(signal);
      if (signal.aborted) throw new DOMException("Operação cancelada.", "AbortError");
      const event = events[index];
      zx8302.enqueueKey(event.keyrow, event);
      setGuideTypingState(true, (index + 1) / events.length);
      if (example) setStatus(`${lesson.title}: a carregar ${Math.round((index + 1) / events.length * 100)}% — aguarde; Reiniciar cancela.`);
      onProgress((index + 1) / events.length);
      await waitForQlCycles(event.pauseAfter, { cpu, hz: CPU_HZ, signal, delay: abortableDelay, suspended: () => document.hidden });
    }

    const drainStarted = performance.now();
    while (zx8302.keyboardQueue.length > 0) {
      if (performance.now() - drainStarted > 5000) {
        throw new Error("O QL não concluiu a leitura do exemplo.");
      }
      await abortableDelay(12, signal);
    }
    if (waitUntilReady) await waitUntilReady(signal);

    const action = run ? "carregado e executado" : "carregado";
    const message = `${lesson.title}: exemplo ${action} no SuperBASIC.`;
    if (!example) {
      completedGuideLessons.add(lesson.id);
      storeCompletedGuideLessons();
      renderGuideNavigation();
    }
    setGuideStatus(message, "ready");
    setStatus(message, "ready");
    canvas.focus();
    if (window.matchMedia("(max-width: 1449px)").matches) {
      closeGuide({ restoreFocus: false });
    }
    return true;
  } catch (error) {
    if (example) zx8302.clearKeyboardQueue();
    if (error.name === "AbortError") {
      setGuideStatus(guideCancelMessage);
      setStatus(guideCancelMessage);
    } else {
      setGuideStatus(error.message, "error");
      setStatus(`Não foi possível carregar o exemplo: ${error.message}`, "error");
    }
  } finally {
    guideTypingController = null;
    guideTypingTask = null;
    finishTyping();
    setGuideTypingState(false, 0);
    updateControls();
  }
}

function initialSoundEnabled() {
  try {
    return localStorage.getItem(SOUND_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function storeSoundEnabled(enabled) {
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Storage can be unavailable in private or embedded browsing contexts.
  }
}

function updateSoundControl() {
  if (!soundButton) return;
  const enabled = qlAudio.enabled && qlAudio.supported;
  soundButton.disabled = !qlAudio.supported;
  soundButton.setAttribute("aria-pressed", String(enabled));
  soundButton.querySelector(".sound-label").textContent = qlAudio.supported
    ? `Som ${enabled ? "ligado" : "desligado"}`
    : "Som indisponível";
}

function setSoftwareLibraryStatus(message, kind = "info") {
  softwareLibraryStatus.textContent = message;
  softwareLibraryStatus.dataset.kind = kind;
  if (driveMenu.root.open) driveMenu.message(message);
}

function selectedSoftwareFile() {
  return selectedSoftwareKey ? softwareFiles.get(selectedSoftwareKey) ?? null : null;
}

function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderSoftwareFiles() {
  softwareFileList.replaceChildren();
  softwareCount.textContent = String(softwareFiles.size);
  if (softwareFiles.size === 0) {
    softwareFileList.append(element(
      "p",
      "software-empty",
      "Escolha uma pasta ou adicione ficheiros MDV, QLPAK ou ZIP.",
    ));
    return;
  }

  for (const [key, file] of softwareFiles) {
    const card = element("article", "software-title-card");
    const icon = element("span", "software-title-icon", file.symbol ?? "QL");
    icon.setAttribute("aria-hidden", "true");
    const identity = element("div", "software-file-identity");
    identity.append(element("h4", "software-file-name", file.displayName ?? file.name));
    identity.append(element("p", "software-title-description", file.description ?? "Um cartucho para explorar no seu QL."));
    if (file.notice) identity.append(element("p", "software-title-notice", file.notice));
    const path = file.webkitRelativePath || file.name;
    if (path !== file.name) identity.append(element("span", "software-file-path", path));
    identity.append(element("span", "software-title-format", `${softwareFormat(file.name)} · ${formatFileSize(file.size)}`));
    const actions = element("div", "software-title-actions");
    const launch = element("button", "primary-button", "Carregar e arrancar");
    launch.type = "button";
    launch.dataset.softwareLaunch = key;
    launch.setAttribute("aria-label", `Carregar e arrancar ${file.displayName ?? file.name} no QL`);
    launch.disabled = softwareBusy || powerTransition || !bus.romLoaded;
    const choose = element("button", "quiet-button", "Escolher unidade…");
    choose.type = "button";
    choose.dataset.softwareKey = key;
    choose.setAttribute("aria-pressed", String(key === selectedSoftwareKey));
    choose.setAttribute("aria-controls", "software-destinations");
    choose.disabled = softwareBusy || powerTransition;
    actions.append(launch, element("small", "software-launch-note", "MDV1 · reinicia o QL"), choose);
    card.append(icon, identity, actions);
    softwareFileList.append(card);
  }
}

function driveAction(label, action, slot, className = "") {
  const button = element("button", className, label);
  button.type = "button";
  button.dataset.driveAction = action;
  button.dataset.slot = String(slot);
  return button;
}

function renderMicrodriveRack() {
  const mdv1Mounted = Boolean(zx8302.microdriveAt(1));
  const mdv2Mounted = Boolean(zx8302.microdriveAt(2));
  const frameSource = computerFrameSource(mdv1Mounted, mdv2Mounted);
  if (fullSystemFrame.getAttribute("src") !== frameSource) {
    fullSystemFrame.setAttribute("src", frameSource);
  }
  computerStage.dataset.mdv1Mounted = String(mdv1Mounted);
  computerStage.dataset.mdv2Mounted = String(mdv2Mounted);
  for (const button of document.querySelectorAll("[data-open-drive]")) {
    const slot = Number(button.dataset.openDrive);
    const mounted = zx8302.microdriveAt(slot);
    button.setAttribute("aria-label", `Gerir MDV${slot}: ${mounted?.name ?? "unidade vazia"}`);
    button.title = `Gerir MDV${slot}: ${mounted?.name ?? "unidade vazia"}`;
    const label = button.querySelector("[data-drive-label]");
    if (label) label.textContent = mounted?.name ?? "vazia";
  }

  if (!microdriveRack) return;
  microdriveRack.replaceChildren();
  const selected = selectedSoftwareFile();
  selectedCartridge.textContent = selected
    ? `Selecionado: ${selected.name}. Escolha abaixo onde o quer inserir.`
    : "Escolha um título acima para o inserir sem reiniciar. Para criar um cartucho, abra o gestor da unidade.";
  for (const button of softwareFileList.querySelectorAll("button")) {
    button.disabled = softwareBusy || powerTransition || (button.dataset.softwareLaunch !== undefined && !bus.romLoaded);
  }
  for (let slot = 1; slot <= MICRODRIVE_COUNT; slot += 1) {
    const mounted = zx8302.microdriveAt(slot);
    const card = element("article", "microdrive-card");
    card.dataset.driveSlot = String(slot);
    const heading = element("div", "microdrive-card-heading");
    heading.append(element("span", "microdrive-number", microdriveName(slot)));
    heading.append(element("span", "microdrive-purpose", slot === 1 ? "Habitualmente: programas e arranque" : "Habitualmente: dados e cópias"));
    card.append(heading);
    const mediumLabel = mounted ? mounted.name : "Sem cartucho — pronto para inserir";
    const medium = element("span", "microdrive-medium", mediumLabel);
    medium.dataset.empty = String(!mounted);
    medium.title = mounted?.name ?? "";
    const identity = element("div", "microdrive-identity");
    identity.append(medium);
    card.append(identity);

    const actions = element("div", "microdrive-actions");
    const mount = driveAction(mounted ? `Trocar cartucho de MDV${slot}` : `Inserir em MDV${slot}`, "mount", slot, "mount-button");
    mount.disabled = !selected || softwareBusy;
    actions.append(mount);
    const manage = driveAction(`Gerir MDV${slot}`, "manage", slot);
    manage.setAttribute("aria-haspopup", "dialog");
    manage.setAttribute("aria-controls", "drive-menu");
    actions.append(manage);
    card.append(actions);
    const hint = element("p", "microdrive-card-hint");
    hint.dataset.driveHint = String(slot);
    card.append(hint);
    if (mounted) {
      const changes = element("span", "microdrive-changes", "Alterações por guardar");
      changes.dataset.dirtySlot = String(slot);
      changes.hidden = !mounted.dirty;
      card.append(changes);
    }
    microdriveRack.append(card);
  }
  updateMicrodriveActivity({ force: true });
}

function updateMicrodriveActivity({ force = false } = {}) {
  const selection = zx8302.microdriveSelection;
  if (!force && selection === lastRenderedMicrodriveSelection) return;
  lastRenderedMicrodriveSelection = selection;
  for (const button of document.querySelectorAll("[data-open-drive]")) button.dataset.active = String(Boolean(selection & (1 << (Number(button.dataset.openDrive) - 1))));
  if (driveMenu.root.open) driveMenu.refresh();
  resumeMicrodrives.hidden = running || !selection;
  for (const led of driveLeds) {
    const slot = Number(led.dataset.driveLed);
    const active = Boolean(selection & (1 << (slot - 1)));
    led.dataset.active = String(active);
    led.setAttribute("aria-label", `MDV${slot}: motor ${active ? "em marcha" : "parado"}`);
  }
  if (!microdriveRack) return;
  const activeDrives = [];
  for (const card of microdriveRack.querySelectorAll("[data-drive-slot]")) {
    const slot = Number(card.dataset.driveSlot);
    const active = Boolean(selection & (1 << (slot - 1)));
    card.dataset.active = String(active);
    if (active) activeDrives.push(`MDV${slot}`);
    for (const button of card.querySelectorAll("[data-drive-action]")) {
      const action = button.dataset.driveAction;
      const reason = action === "manage" ? "" : microdriveActionBlockReason({ slot, action, mounted: zx8302.microdriveAt(slot), selection });
      button.disabled = softwareBusy || Boolean(reason)
        || (["mount", "boot"].includes(action) && !selectedSoftwareFile())
        || (action === "boot" && !bus.romLoaded);
      if (reason) button.title = reason;
      else if (button.dataset.idleTitle) button.title = button.dataset.idleTitle;
      else button.removeAttribute("title");
    }
    card.querySelector("[data-drive-hint]").textContent = active
      ? `MDV${slot} em uso. Espere que a luz apague. Se o QL estiver em pausa, retome a execução.`
      : zx8302.microdriveAt(slot)
        ? `Use Gerir MDV${slot} para guardar, proteger ou retirar este cartucho.`
        : `Insira o software selecionado ou abra Gerir MDV${slot} para criar o seu próprio cartucho.`;
  }
  const available = [1, 2].filter((slot) => !zx8302.microdriveAt(slot) && !(selection & (1 << (slot - 1))));
  microdriveActivity.textContent = activeDrives.length
    ? `${activeDrives.join(", ")}: em uso. ${available.length ? `Pode inserir um cartucho em MDV${available[0]}, que está vazia.` : "Espere pelo fim da operação antes de guardar ou trocar cartuchos."}`
    : "Duas unidades independentes. Inserir um cartucho não reinicia o QL.";
}

function microdriveOperationBlocked(slot, action) {
  const reason = microdriveActionBlockReason({ slot, action, mounted: zx8302.microdriveAt(slot), selection: zx8302.microdriveSelection });
  if (!reason) return false;
  setSoftwareLibraryStatus(reason);
  return true;
}

function updateMicrodriveChanges() {
  if (driveMenu.root.open) driveMenu.refresh();
  for (const notice of microdriveRack.querySelectorAll("[data-dirty-slot]")) {
    const slot = Number(notice.dataset.dirtySlot);
    const mounted = zx8302.microdriveAt(slot);
    notice.hidden = !mounted?.dirty;
    const save = microdriveRack.querySelector(`[data-drive-action="save"][data-slot="${slot}"]`);
    if (save) save.hidden = !canSaveMicrodrive(mounted);
  }
}

function toggleMicrodriveProtection(slot) {
  if (microdriveOperationBlocked(slot, "protection")) return;
  const image = zx8302.microdriveAt(slot);
  if (!image || softwareBusy) return;
  image.writeProtected = !image.writeProtected;
  microdriveProtection.remember(mountedProtectionKeys.get(slot), image.writeProtected);
  renderMicrodriveRack();
  if (softwareLibrary.open) microdriveRack.querySelector(`[data-drive-action="protection"][data-slot="${slot}"]`)?.focus();
  setSoftwareLibraryStatus(`${image.name} em ${microdriveName(slot)}: ${image.writeProtected ? "protegido contra escrita" : "gravável"}.`, "ready");
}

function renderSoftwareLibrary() {
  renderSoftwareFiles();
  renderMicrodriveRack();
}

function addSoftwareFiles(files, { replace = false } = {}) {
  const candidates = [...files];
  const supported = supportedSoftwareFiles(candidates);
  if (replace) {
    for (const [key, file] of softwareFiles) if (!file.localExample) softwareFiles.delete(key);
  }
  for (const file of supported) softwareFiles.set(softwareFileKey(file), file);
  if (!softwareFiles.has(selectedSoftwareKey)) {
    selectedSoftwareKey = softwareFiles.keys().next().value ?? null;
  }
  renderSoftwareLibrary();

  const ignored = candidates.length - supported.length;
  const message = `${supported.length} ficheiro(s) suportado(s) adicionado(s)`
    + (ignored ? `; ${ignored} ignorado(s).` : ".");
  setSoftwareLibraryStatus(message, supported.length ? "ready" : "error");
}

function createVirginMicrodrive(slot = null, cartridgeName = null) {
  if (softwareBusy || (slot !== null && microdriveOperationBlocked(slot, "new"))) return;
  virginMicrodriveCount += 1;
  const name = cartridgeName ? `${cartridgeName}-${virginMicrodriveCount}.mdv` : `cartucho-virgem-${virginMicrodriveCount}.mdv`;
  const bytes = new Uint8Array(MICRODRIVE_FORMAT.imageSize);
  const file = {
    name,
    size: bytes.byteLength,
    lastModified: Date.now(),
    webkitRelativePath: "",
    virgin: true,
    async arrayBuffer() {
      return bytes.slice().buffer;
    },
  };
  const key = softwareFileKey(file);
  softwareFiles.set(key, file);
  selectedSoftwareKey = key;
  renderSoftwareLibrary();
  setSoftwareLibraryStatus(
    `${name} criado e selecionado. Escolha Inserir em MDV1 ou Inserir em MDV2. Depois prepare-o com FORMAT, como explicado em Como usar os cartuchos.`,
    "ready",
  );
  if (slot !== null) return mountSoftware(slot);
}

function storePresentationMode(mode) {
  try {
    localStorage.setItem(PRESENTATION_STORAGE_KEY, mode);
  } catch {
    // Storage can be unavailable in private or embedded browsing contexts.
  }
}

function setPresentationMode(value, { persist = true, focus = false } = {}) {
  const mode = normalizePresentationMode(value);
  computerStage.dataset.presentation = mode;
  computerStage.setAttribute("aria-label", presentationLabel(mode));

  for (const button of presentationButtons) {
    const selected = button.dataset.presentationOption === mode;
    button.setAttribute("aria-checked", String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected && focus) button.focus();
  }

  if (persist) storePresentationMode(mode);
}

function initialPresentationMode() {
  try {
    return normalizePresentationMode(localStorage.getItem(PRESENTATION_STORAGE_KEY));
  } catch {
    return "monitor";
  }
}

function updateFullscreenControl() {
  const active = document.fullscreenElement === computerStage;
  fullscreenButton.setAttribute("aria-pressed", String(active));
  fullscreenButton.textContent = active ? "Sair do ecrã inteiro" : "Ecrã inteiro";
  fullscreenButton.setAttribute(
    "aria-label",
    active ? "Sair do modo de ecrã inteiro" : "Mostrar a apresentação em ecrã inteiro",
  );
}

function cpuStatus(prefix) {
  updateMachineDiagnostics();
  return prefix;
}

function updateMachineDiagnostics() {
  machineDiagnostics.textContent = `PC=${hexadecimal(cpu.pc)}, ciclos=${cpu.cycles.toLocaleString("pt-PT")}, `
    + `vídeo=MODE ${zx8301.mode}${zx8301.blanked ? " (apagado)" : ""}, `
    + `banco=${hexadecimal(zx8301.screenBase, 5)}.`;
}

function render(time = performance.now()) {
  if (!machineStarted) {
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    updateMicrodriveActivity();
    return;
  }
  const flashPhase = Math.floor(time / 640) % 2 === 1;
  zx8301.renderFrame(bus, { flashPhase, target: image.data });
  context.putImageData(image, 0, 0);
  updateMicrodriveActivity();
}

function stop(message, kind = "ready") {
  running = false;
  qlKeyboard.releaseAll();
  qlAudio.pause();
  if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
  updateControls();
  if (message) setStatus(message, kind);
}

function startExecution(message = cpuStatus(machineStarted ? "QL em execução." : "QL ligado. Clique no ecrã e prima F1 no arranque.")) {
  if (!bus.romLoaded || powerTransition || running) return;
  void qlAudio.resume();
  running = true;
  machineStarted = true;
  lastFrameTime = performance.now();
  updateControls();
  setStatus(message, "ready");
  animationFrameId = requestAnimationFrame(runFrame);
}

function resetMachine() {
  chatBridge?.stop();
  chatProgramLoaded = false;
  chatHistory.hide();
  chatType.disabled = true;
  chatLaunch.hidden = true;
  chatLaunch.dataset.state = "idle";
  chatLaunchStatus.textContent = "";
  chatLaunchProgress.hidden = true;
  chatRetry.hidden = true;
  cancelGuideTyping("Carregamento interrompido pelo reinício do QL.");
  machineStarted = false;
  stop();
  bus.resetRam();
  bus.resetDevices();
  cpu.reset();
  render();
  screenMessage.hidden = true;
  setStatus(cpuStatus(`${loadedRomName} pronta. Coloque o interruptor em ON para começar.`), "ready");
}

async function changePower(restart) {
  if (powerTransition || !bus.romLoaded) return;
  powerTransition = true;
  try {
    await powerOffMachine({
      stop: () => stop(),
      bridge: chatBridge,
      cancelLoading: () => cancelGuideTyping("Carregamento cancelado ao desligar o QL."),
      loading: chatLaunchTask ?? guideTypingTask,
      reset: resetMachine,
    });
    chatBridge = null;
    chatHostToken = null;
  } finally {
    powerTransition = false;
    updateControls();
  }
  if (restart) {
    startExecution("QL ligado de novo. Prima F1 no arranque para entrar no SuperBASIC.");
    canvas.focus();
  } else {
    setStatus("QL desligado. A memória foi apagada e o chat encerrado. Coloque o interruptor em ON para voltar a ligar.", "ready");
  }
}

function installRom(bytes, name) {
  bus.loadRom(bytes);
  loadedRomName = name;
  resetMachine();
  canvas.focus();
}

async function loadDefaultRom() {
  try {
    const response = await fetch(DEFAULT_ROM);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    installRom(new Uint8Array(await response.arrayBuffer()), "Minerva 1.98a1");
  } catch (error) {
    screenMessage.textContent = "Não foi possível carregar a Minerva";
    setStatus(`Falha ao carregar a ROM incluída: ${error.message}. Pode selecionar outra ROM.`, "error");
  }
}

function runFrame(time) {
  animationFrameId = null;
  if (!running) return;
  const elapsed = Math.min((time - lastFrameTime) / 1000, 0.05);
  const cycleBudget = Math.min(Math.max(elapsed * CPU_HZ, 1), MAX_FRAME_CYCLES);
  const targetCycles = cpu.cycles + cycleBudget;

  try {
    while (running && cpu.cycles < targetCycles) {
      const cycles = cpu.step();
      bus.tick(cycles);
      cpu.setInterruptLevel(bus.interruptLevel);
      if (cycles === 0 && cpu.stopped) {
        stop(cpuStatus("CPU em STOP"));
        break;
      }
    }
    render(time);
    if (softwareLibrary.open || driveMenu.root.open) updateMicrodriveChanges();
  } catch (error) {
    stop(`${error.name}: ${error.message}`, "error");
  }

  lastFrameTime = time;
  if (running) animationFrameId = requestAnimationFrame(runFrame);
}

romInput.addEventListener("change", async () => {
  const [file] = romInput.files;
  if (!file) return;

  try {
    installRom(new Uint8Array(await file.arrayBuffer()), file.name);
  } catch (error) {
    stop(error.message, "error");
  }
});

async function mountSoftware(slot, { boot = false, file = selectedSoftwareFile() } = {}) {
  if (microdriveOperationBlocked(slot, boot ? "boot" : "mount")) return;
  if (!file || softwareBusy) return;
  const drive = microdriveName(slot);
  const mounted = zx8302.microdriveAt(slot);
  if (mounted) {
    const warning = mounted.dirty ? " As alterações ainda não foram guardadas." : "";
    if (!window.confirm(`Substituir ${mounted.name} em ${drive} por ${file.name}?${warning}`)) return;
  }

  softwareBusy = true;
  updateControls();
  setSoftwareLibraryStatus(`A preparar ${file.name} para ${drive}…`);
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const protectionKey = await microdriveProtection.keyFor(file, bytes);
    const writeProtected = file.projectId ? Boolean(file.writeProtected) : microdriveProtection.isProtected(protectionKey, file);
    const isMicrodrive = softwareFormat(file.name) === "Microdrive";
    let imageBytes = bytes;
    let packageSummary = "";
    if (!isMicrodrive) {
      const imported = await importQlPackage(bytes, { name: file.name, microdrive: slot });
      imageBytes = imported.image;
      packageSummary = ` ${imported.files.length} ficheiro(s) convertido(s)`
        + (imported.bootReplacements ? `; BOOT adaptado para ${drive}` : "")
        + (imported.generatedBoot ? `; arranque do executável preparado para ${drive}` : "")
        + ".";
    }

    if (microdriveOperationBlocked(slot, boot ? "boot" : "mount")) return;
    zx8302.mountMicrodrive(slot, imageBytes, {
      name: file.name,
      writeProtected,
      // Real cartridges contain a splice rather than 255 perfect sectors.
      // Keeping one physical slot outside the loop and one internal gap lets
      // FORMAT detect the same imperfect circumference as on real tape.
      physicalSectorCount: file.virgin ? MICRODRIVE_FORMAT.sectorCount - 1 : file.physicalSectorCount,
      spliceSector: file.virgin ? Math.floor((MICRODRIVE_FORMAT.sectorCount - 1) / 2) : file.spliceSector,
    });
    mountedProtectionKeys.set(slot, protectionKey);
    const accessSummary = ` montado em ${drive}, ${writeProtected ? "protegido contra escrita" : "gravável"}.`
      + (file.virgin && !writeProtected ? ` Use FORMAT mdv${slot}_nome antes de o utilizar.` : "");
    const message = `${file.name}${accessSummary}${packageSummary}`;
    if (boot) {
      await changePower(true);
      zx8302.enqueueKey(57);
      setStatus(`${message} A arrancar pela tecla F1…`, "ready");
      softwareLibrary.close();
      canvas.focus();
    } else {
      setStatus(message, "ready");
    }
    setSoftwareLibraryStatus(message, "ready");
    return true;
  } catch (error) {
    const message = `Não foi possível montar ${file.name} em ${drive}: ${error.message}`;
    setStatus(message, "error");
    setSoftwareLibraryStatus(message, "error");
  } finally {
    softwareBusy = false;
    updateControls();
  }
}

function ejectMicrodrive(slot) {
  if (microdriveOperationBlocked(slot, "eject")) return;
  const drive = microdriveName(slot);
  const current = zx8302.microdriveAt(slot);
  if (
    current?.dirty
    && !window.confirm(`${current.name} tem alterações não guardadas. Ejetar mesmo assim?`)
  ) return;
  const image = zx8302.unmountMicrodrive(slot);
  mountedProtectionKeys.delete(slot);
  updateControls();
  const message = image ? `${image.name} ejetado de ${drive}.` : `${drive} já se encontra vazio.`;
  setStatus(message, "ready");
  setSoftwareLibraryStatus(message, "ready");
}

function saveMicrodrive(slot) {
  if (microdriveOperationBlocked(slot, "save")) return;
  const drive = microdriveName(slot);
  const image = zx8302.microdriveAt(slot);
  if (!image) return;
  const bytes = image.toUint8Array();
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = image.name.toLocaleLowerCase("en").endsWith(".mdv")
    ? image.name
    : `${image.name}.mdv`;
  link.click();
  // Reopening this exported copy in the same browser retains its access mode.
  void microdriveProtection.rememberExport(bytes, image.writeProtected).catch(() => {});
  setTimeout(() => URL.revokeObjectURL(url), 0);
  image.markClean();
  updateControls();
  const message = `${image.name}, de ${drive}, guardado como imagem .mdv.`;
  setStatus(message, "ready");
  setSoftwareLibraryStatus(message, "ready");
}

async function openSoftwareLibrary() {
  if (chatProgramLoaded && !await originalQlMode.request("software")) return;
  if (document.fullscreenElement) await document.exitFullscreen();
  renderSoftwareLibrary();
  softwareLibrary.showModal();
  softwareLibrary.querySelector(".dialog-close").focus();
}
openSoftwareLibraryButton.addEventListener("click", () => void openSoftwareLibrary());

openGuideButton.addEventListener("click", () => openGuide());
for (const button of openChatButtons) {
  button.addEventListener("click", async () => {
    chatSettings.showModal();
    await refreshChatConfiguration();
  });
}
async function refreshChatConfiguration() {
  chatProvider.value = "demo";
  chatProvider.querySelector('[value="gemini"]').disabled = true;
  chatHostToken = null;
  chatConnection.textContent = "A verificar o host local…";
  try {
    const response = await fetch("/api/chat/config", { cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error();
    const config = await response.json();
    if (config.enabled && typeof config.token === "string") {
      chatHostToken = config.token;
      chatProvider.querySelector('[value="gemini"]').disabled = false;
    }
    chatConnection.textContent = config.enabled
      ? "Gemini 3.5 Flash-Lite disponível. O host declara projeto Free sem faturação."
      : config.paused ? "Gemini suspenso por quota ou configuração. Consulte o README antes de desbloquear. Demonstração disponível."
      : "Demonstração pronta. Para usar Gemini, clique em Configurar a minha chave Gemini, abaixo. Cole a sua chave API — atenção: o ID do projeto, como gen-lang-client-…, não é a chave. Confirme que o projeto está no plano Free sem faturação e escolha Guardar neste computador. Pode continuar a usar o emulador sem Gemini.";
  } catch {
    chatConnection.textContent = "Demonstração pronta. A ligação Gemini requer o servidor local do projeto (npm start).";
  }
}
function startChat() {
  if (chatLaunchTask) return chatLaunchTask;
  const task = startChatProgram();
  chatLaunchTask = task;
  void task.finally(() => { if (chatLaunchTask === task) chatLaunchTask = null; });
  return task;
}
async function startChatProgram() {
  if (guideTypingController || chatLaunching || !bus.romLoaded || powerTransition) return;
  const provider = chatProvider.value;
  const token = chatHostToken;
  if (provider === "gemini" && !token) return;
  const session = crypto.randomUUID();
  const reply = provider === "demo" ? localDemoReply
    : (message, { signal }) => requestChatReply({ token, session, message, signal });
  let started = false;
  try {
    const loaded = await loadGuideExample({ run: true, example: chatTerminalExample(provider), beforeLoad: () => {
      started = true;
      chatLaunching = true;
      chatProgramLoaded = true;
      chatType.disabled = true;
      chatHistory.reset();
      chatLaunch.hidden = false;
      chatLaunch.dataset.state = "loading";
      chatRetry.hidden = true;
      chatLaunchProgress.hidden = false;
      chatLaunchProgress.value = 0;
      chatLaunchStatus.textContent = "A entrar no SuperBASIC… O programa será escrito quando o QL estiver pronto. Reiniciar cancela.";
      chatBridge = new QLChatBridge({ device: zx8302, reply, onStatus: (message) => {
        setStatus(message);
        if (!chatBridge.active) {
          chatHistory.hide();
          chatLaunch.hidden = true;
          chatType.disabled = true;
          chatLaunchStatus.textContent = "Terminal fechado. Abra novamente QL Chat para iniciar outra conversa.";
        }
      }, onMessage: (message) => chatHistory.append(message) });
      chatSettings.close();
      canvas.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    }, prepareInput: async (signal) => {
      await waitForSuperBasic({ bus, device: zx8302, signal,
        delay: (ms) => waitForQlCycles(ms, { cpu, hz: CPU_HZ, signal, delay: abortableDelay, suspended: () => document.hidden }),
      });
      chatLaunchStatus.textContent = "SuperBASIC pronto. A escrever o programa no ecrã do QL…";
    }, onProgress: (progress) => {
      const percentage = Math.floor(progress * 100);
      // Announce whole percentages, not every character sent to the keyboard.
      if (chatLaunchProgress.value !== percentage) {
        chatLaunchProgress.value = percentage;
        chatLaunchStatus.textContent = `A escrever o programa SuperBASIC: ${percentage}%. Aguarde antes de escrever; Reiniciar cancela.`;
      }
    }, waitUntilReady: async (signal) => {
      chatLaunchStatus.textContent = "Programa enviado. A aguardar a confirmação do terminal…";
      await waitForChatReady({ bridge: chatBridge, signal,
        delay: (ms) => waitForQlCycles(ms, { cpu, hz: CPU_HZ, signal, delay: abortableDelay, suspended: () => document.hidden }),
      });
    } });
    if (!started) return;
    chatLaunchProgress.hidden = true;
    if (loaded) {
      chatType.disabled = false;
      chatLaunch.dataset.state = "ready";
      chatLaunchStatus.textContent = "Terminal pronto. Clique em Escrever no QL e escreva a sua mensagem após >.";
    } else {
      chatBridge.stop();
      chatLaunch.dataset.state = "error";
      chatLaunchStatus.textContent = `${status.textContent} O chat ainda não está pronto. Escolha F1 se estiver no arranque do QL e tente novamente.`;
      chatRetry.hidden = false;
    }
  } catch (error) {
    if (started) {
      chatBridge?.stop();
      chatType.disabled = true;
      chatLaunchProgress.hidden = true;
      chatLaunch.dataset.state = "error";
      chatLaunchStatus.textContent = "Não foi possível iniciar o terminal. Tente novamente.";
      chatRetry.hidden = false;
    }
    setStatus(`Não foi possível iniciar o chat: ${error.message}`, "error");
  } finally {
    chatLaunching = false;
    if (!chatBridge?.active) chatHistory.hide();
    if (!chatProgramLoaded) chatLaunch.hidden = true;
    updateControls();
  }
}
startChatButton.addEventListener("click", startChat);
chatRetry.addEventListener("click", startChat);
closeGuideButton.addEventListener("click", () => closeGuide());
async function openMicrodriveGuide(id) {
  guideSearch.value = "microdrive";
  if (!await openGuide(id)) return;
  guideLessonArticle.scrollTop = 0;
  guideLessons.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
}
document.querySelector("#guide-microdrives-start").addEventListener("click", () => openMicrodriveGuide("primeiro-cartucho-format"));
document.querySelector("#guide-microdrives-reference").addEventListener("click", () => openMicrodriveGuide("comandos-microdrive"));
document.querySelector("#library-microdrive-guide").addEventListener("click", () => {
  softwareLibrary.close();
  openMicrodriveGuide("primeiro-cartucho-format");
});
for (const viewport of [guideLessons, guideLessonArticle]) {
  viewport.addEventListener("wheel", (event) => {
    // Keep zoom and horizontal code scrolling native; slow only vertical reading.
    if (event.ctrlKey || event.metaKey || event.shiftKey || !event.cancelable
      || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    if (viewport.scrollHeight <= viewport.clientHeight) return;
    const lineHeight = parseFloat(getComputedStyle(viewport).lineHeight) || 24;
    const unit = event.deltaMode === 1 ? lineHeight : event.deltaMode === 2 ? viewport.clientHeight : 1;
    const limit = viewport === guideLessons ? 24 : 48;
    const distance = Math.max(-limit, Math.min(limit, event.deltaY * unit * 0.35));
    event.preventDefault();
    viewport.scrollBy({ top: distance, behavior: "instant" });
  }, { passive: false });
}
guideSearch.addEventListener("input", renderGuideNavigation);
guideLessons.addEventListener("click", (event) => {
  const button = event.target.closest("[data-guide-lesson]");
  if (!button || button.disabled) return;
  openGuide(button.dataset.guideLesson, { focus: false });
  guideLessonArticle.scrollTo({ top: 0, behavior: "smooth" });
});
guidePreviousButton.addEventListener("click", () => {
  guideSearch.value = "";
  openGuide(adjacentGuideLesson(activeGuideLessonId, -1).id, { focus: false });
  guideLessonArticle.scrollTo({ top: 0, behavior: "smooth" });
});
guideNextButton.addEventListener("click", () => {
  guideSearch.value = "";
  openGuide(adjacentGuideLesson(activeGuideLessonId, 1).id, { focus: false });
  guideLessonArticle.scrollTo({ top: 0, behavior: "smooth" });
});
guideLoadButton.addEventListener("click", () => void loadGuideExample());
guideRunButton.addEventListener("click", () => void loadGuideExample({ run: true }));
guideCancelButton.addEventListener("click", () => cancelGuideTyping());
guidePanel.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || guideTypingController) return;
  event.preventDefault();
  closeGuide();
});
window.addEventListener("hashchange", () => {
  const lessonId = guideLessonIdFromHash(location.hash);
  if (lessonId) openGuide(lessonId, { updateHash: false, focus: false });
});

softwareFilesInput.addEventListener("change", () => {
  addSoftwareFiles(softwareFilesInput.files);
  softwareFilesInput.value = "";
});

softwareFolderInput.addEventListener("change", () => {
  addSoftwareFiles(softwareFolderInput.files, { replace: true });
  softwareFolderInput.value = "";
});

resumeMicrodrives.addEventListener("click", () => {
  if (!running) startExecution("QL retomado para concluir a operação nos cartuchos.");
});

softwareFileList.addEventListener("click", async (event) => {
  const launch = event.target.closest("[data-software-launch]");
  if (launch && !launch.disabled) {
    const file = softwareFiles.get(launch.dataset.softwareLaunch);
    await mountSoftware(1, { file, boot: true });
    return;
  }
  const button = event.target.closest("[data-software-key]");
  if (!button || button.disabled) return;
  selectedSoftwareKey = button.dataset.softwareKey;
  renderSoftwareLibrary();
  softwareDestinations.open = true;
  microdriveRack.querySelector('[data-drive-action="mount"]')?.focus();
  setSoftwareLibraryStatus(`${selectedSoftwareFile().name} selecionado. Escolha uma unidade.`);
});

microdriveRack.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-drive-action]");
  if (!button || button.disabled) return;
  const slot = Number(button.dataset.slot);
  if (button.dataset.driveAction === "manage" || await mountSoftware(slot)) {
    await openDriveManager(slot, document.querySelector(`.drive-shortcuts [data-open-drive="${slot}"]`));
  }
});

for (const eventName of ["dragenter", "dragover"]) {
  softwareDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    softwareDropzone.dataset.dragging = "true";
  });
}
for (const eventName of ["dragleave", "drop"]) {
  softwareDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    softwareDropzone.dataset.dragging = "false";
  });
}
softwareDropzone.addEventListener("drop", (event) => addSoftwareFiles(event.dataTransfer.files));

window.addEventListener("beforeunload", (event) => {
  if (!zx8302.microdrives.some((medium) => medium?.dirty)) return;
  event.preventDefault();
  event.returnValue = "";
});

soundButton.addEventListener("click", () => {
  const enabled = !qlAudio.enabled;
  qlAudio.setEnabled(enabled, zx8302.soundActive ? zx8302.sound : null);
  storeSoundEnabled(enabled);
  if (enabled && running) void qlAudio.resume();
});

stepButton.addEventListener("click", () => {
  try {
    machineStarted = true;
    const cycles = cpu.step();
    bus.tick(cycles);
    cpu.setInterruptLevel(bus.interruptLevel);
    render();
    const exception = cpu.lastException ? `, vetor=${cpu.lastException.vector}` : "";
    setStatus(cpuStatus("Uma instrução executada. Consulte o estado da máquina nos controlos avançados."), "ready");
    machineDiagnostics.textContent += ` Último passo=${cycles} ciclos${exception}.`;
    updateControls();
  } catch (error) {
    stop(`${error.name}: ${error.message}`, "error");
  }
});

resetButton.addEventListener("click", () => {
  void changePower(true);
});
advancedControls.addEventListener("toggle", () => {
  if (advancedControls.open) updateMachineDiagnostics();
});

// Browsers may apply :focus-visible to automatic focus on page load. Show
// the screen outline only after keyboard navigation, not QL typing or clicks.
document.addEventListener("keydown", (event) => {
  if (event.key === "Tab" && event.target !== canvas) canvas.dataset.keyboardFocus = "true";
}, true);
document.addEventListener("pointerdown", () => {
  delete canvas.dataset.keyboardFocus;
}, true);
canvas.addEventListener("blur", () => {
  delete canvas.dataset.keyboardFocus;
  qlKeyboard.releaseAll();
});
window.addEventListener("blur", () => qlKeyboard.releaseAll());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) qlKeyboard.releaseAll();
});

canvas.addEventListener("keydown", (event) => {
  if (!machineStarted || powerTransition) return;
  if (chatLoadingConsumesKey(event, chatLaunching)) return;
  if (guideTypingController) cancelGuideTyping("Carregamento interrompido para aceitar o teclado.");
  if (running) void qlAudio.resume();
  if (qlKeyboard.keyDown(event)) event.preventDefault();
});

canvas.addEventListener("keyup", (event) => {
  if (qlKeyboard.keyUp(event)) event.preventDefault();
});

document.querySelector(".screen-panel").addEventListener("click", () => {
  if (running) void qlAudio.resume();
  canvas.focus();
});

for (const button of presentationButtons) {
  button.addEventListener("click", () => {
    setPresentationMode(button.dataset.presentationOption);
  });

  button.addEventListener("keydown", (event) => {
    let mode = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      mode = adjacentPresentationMode(computerStage.dataset.presentation, 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      mode = adjacentPresentationMode(computerStage.dataset.presentation, -1);
    } else if (event.key === "Home") {
      mode = "screen";
    } else if (event.key === "End") {
      mode = "computer";
    }

    if (!mode) return;
    event.preventDefault();
    setPresentationMode(mode, { focus: true });
  });
}

if (typeof computerStage.requestFullscreen !== "function") {
  fullscreenButton.hidden = true;
} else {
  fullscreenButton.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement === computerStage) await document.exitFullscreen();
      else await computerStage.requestFullscreen();
    } catch {
      setStatus("O navegador não permitiu ativar o ecrã inteiro.", "error");
    }
  });
  document.addEventListener("fullscreenchange", updateFullscreenControl);
}

setPresentationMode(initialPresentationMode(), { persist: false });
qlAudio.setEnabled(initialSoundEnabled());
updateFullscreenControl();
renderGuideLesson(guideLessonIdFromHash(location.hash) ?? activeGuideLessonId);
if (guideLessonIdFromHash(location.hash)) {
  openGuide(guideLessonIdFromHash(location.hash), { updateHash: false, focus: false });
}
updateControls();
render();
loadDefaultRom();
initializeGeminiSetup({ onSaved: () => { if (chatSettings.open) void refreshChatConfiguration(); } });
void loadSoftwareExamples().then((files) => {
  for (const file of files.filter(Boolean)) softwareFiles.set(softwareFileKey(file), file);
  renderSoftwareLibrary();
  if (files.some((file) => !file)) setSoftwareLibraryStatus("Para disponibilizar os exemplos locais, reinicie o servidor com npm start. Também pode adicionar os ficheiros pelo botão acima.");
});
