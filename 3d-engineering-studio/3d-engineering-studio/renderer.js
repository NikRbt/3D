import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EXAMPLES, AI_PROMPT } from './examples.js';

const $ = (sel) => document.querySelector(sel);
const DRAFT_KEY = 'studio.draft.v1';

/* ---------- 3D-Ansicht ---------- */

const viewport = $('#viewport');
const canvas = $('#canvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d151d);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
camera.position.set(9, 7, 11);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

// Studiolicht (der Modellcode muss kein Licht anlegen)
scene.add(new THREE.HemisphereLight(0xdfeaff, 0x1a2530, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 2.0);
key.position.set(8, 14, 10);
scene.add(key);
const fill = new THREE.DirectionalLight(0x88aaff, 0.6);
fill.position.set(-10, 4, -8);
scene.add(fill);

const grid = new THREE.GridHelper(40, 40, 0x3a5368, 0x1e2d3a);
const axes = new THREE.AxesHelper(3);
scene.add(grid, axes);

// Alles, was der Modellcode erzeugt, landet in dieser Gruppe ("scene" im Code)
const userGroup = new THREE.Group();
scene.add(userGroup);

const frameCallbacks = [];
let paused = false;
let wireframe = false;
let simTime = 0;
const clock = new THREE.Clock();

new ResizeObserver(() => {
  const w = Math.max(viewport.clientWidth, 1);
  const h = Math.max(viewport.clientHeight, 1);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}).observe(viewport);

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (!paused && frameCallbacks.length) {
    simTime += dt;
    for (const cb of frameCallbacks) {
      try {
        cb(dt, simTime);
      } catch (e) {
        frameCallbacks.length = 0;
        reportError(e, 'Fehler in der Animation');
        break;
      }
    }
  }
  controls.update();
  renderer.render(scene, camera);
}
tick();

function disposeMaterial(m) {
  Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); });
  m.dispose();
}

function clearUser() {
  userGroup.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(disposeMaterial);
  });
  userGroup.clear();
  frameCallbacks.length = 0;
  simTime = 0;
}

function applyWireframe() {
  userGroup.traverse((o) => {
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.wireframe = wireframe; });
  });
}

function fitView() {
  const box = new THREE.Box3().setFromObject(userGroup);
  if (box.isEmpty()) return false;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
  const dist = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2)) * 1.1;
  const dir = new THREE.Vector3(1, 0.7, 1.2).normalize();
  camera.position.copy(center).addScaledVector(dir, dist);
  camera.near = Math.max(dist / 200, 0.01);
  camera.far = dist * 200;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
  return true;
}

function stats() {
  let meshes = 0;
  let tris = 0;
  userGroup.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    tris += g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0);
  });
  return { meshes, tris: Math.round(tris) };
}

/* ---------- Status und Konsole ---------- */

const statusEl = $('#status');
const logEl = $('#log');

function setStatus(kind, text) {
  statusEl.className = kind;
  statusEl.textContent = text;
}

function log(text) {
  logEl.textContent += text + '\n';
  const lines = logEl.textContent.split('\n');
  if (lines.length > 300) logEl.textContent = lines.slice(-300).join('\n');
  logEl.scrollTop = logEl.scrollHeight;
}

const userConsole = {
  log: (...a) => log(a.map(String).join(' ')),
  info: (...a) => log(a.map(String).join(' ')),
  warn: (...a) => log('Warnung: ' + a.map(String).join(' ')),
  error: (...a) => log('Fehler: ' + a.map(String).join(' ')),
};

/* ---------- Editor (Monaco) ---------- */

let editor;
let monacoRef;
let currentName = 'modell.js';

function clearMarkers() {
  if (monacoRef) monacoRef.editor.setModelMarkers(editor.getModel(), 'run', []);
}

function reportError(e, prefix = 'Fehler im Code') {
  // "new Function" setzt den Code ab Zeile 3 ein, daher -2
  const m = /usercode\.js:(\d+):(\d+)/.exec(String(e && e.stack));
  const line = m ? Math.max(1, Number(m[1]) - 2) : null;
  let msg = e && e.message ? e.message : String(e);

  if (/already been declared/.test(msg)) {
    msg += ' (Tipp: "scene", "THREE" und "onFrame" gibt es schon. Nicht noch einmal mit const anlegen.)';
  }

  setStatus('err', line ? `${prefix} in Zeile ${line}: ${msg}` : `${prefix}: ${msg}`);

  if (line && monacoRef) {
    const col = Number(m[2]);
    monacoRef.editor.setModelMarkers(editor.getModel(), 'run', [{
      severity: monacoRef.MarkerSeverity.Error,
      message: msg,
      startLineNumber: line,
      startColumn: col,
      endLineNumber: line,
      endColumn: col + 1,
    }]);
    editor.revealLineInCenterIfOutsideViewport(line);
  }
}

function run({ fit = true } = {}) {
  clearUser();
  clearMarkers();
  logEl.textContent = '';

  // import-Zeilen entfernen (Zeilenzahl bleibt gleich, damit Fehlerzeilen stimmen)
  let removedImports = 0;
  const code = editor.getValue().split('\n').map((l) => {
    if (/^\s*import\s.+['"];?\s*$/.test(l)) { removedImports++; return '// ' + l; }
    return l;
  }).join('\n');

  try {
    const fn = new Function('THREE', 'scene', 'onFrame', 'console', code + '\n//# sourceURL=usercode.js');
    fn(THREE, userGroup, (cb) => { if (typeof cb === 'function') frameCallbacks.push(cb); }, userConsole);
  } catch (e) {
    clearUser();
    reportError(e);
    return;
  }

  applyWireframe();
  const { meshes, tris } = stats();
  if (!meshes) {
    setStatus('warn', 'Code läuft, aber die Szene ist leer. Mit scene.add(...) Objekte hinzufügen.');
    return;
  }
  if (fit) fitView();

  const anim = frameCallbacks.length ? ', Animation aktiv' : '';
  setStatus('ok', `OK: ${meshes} Bauteile, ${tris.toLocaleString('de-DE')} Dreiecke${anim}`);
  if (removedImports) log(`Hinweis: ${removedImports} import-Zeile(n) wurden ignoriert. THREE ist schon vorhanden.`);
}

function initEditor(startCode) {
  const base = new URL('node_modules/monaco-editor/min/', location.href).href.replace(/\/$/, '');

  self.MonacoEnvironment = {
    getWorkerUrl: () => 'data:text/javascript;charset=utf-8,' + encodeURIComponent(
      `self.MonacoEnvironment = { baseUrl: '${base}/' };importScripts('${base}/vs/base/worker/workerMain.js');`
    ),
  };

  window.require.config({ paths: { vs: base + '/vs' } });
  window.require(['vs/editor/editor.main'], () => {
    monacoRef = window.monaco;

    monacoRef.editor.defineTheme('studio', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: { 'editor.background': '#0d151d' },
    });

    // THREE, scene usw. sind absichtlich "unbekannt" für Monaco: nur Syntaxfehler anzeigen
    monacoRef.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    });

    editor = monacoRef.editor.create($('#editor'), {
      value: startCode,
      language: 'javascript',
      theme: 'studio',
      automaticLayout: true,
      fontSize: 13,
      fontFamily: '"Cascadia Code", Consolas, monospace',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      tabSize: 2,
    });

    editor.addCommand(monacoRef.KeyMod.CtrlCmd | monacoRef.KeyCode.Enter, () => run());
    editor.addCommand(monacoRef.KeyMod.CtrlCmd | monacoRef.KeyCode.KeyS, saveFile);

    let timer;
    editor.onDidChangeModelContent(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try { localStorage.setItem(DRAFT_KEY, editor.getValue()); } catch (_) { /* egal */ }
      }, 500);
    });

    run();
  });
}

/* ---------- Dateien ---------- */

async function openFile() {
  const res = await window.studio.openFile();
  if (!res) return;
  currentName = res.name;
  editor.setValue(res.content);
  run();
}

async function saveFile() {
  const name = await window.studio.saveFile(editor.getValue(), currentName);
  if (name) {
    currentName = name;
    setStatus('ok', `Gespeichert: ${name}`);
  }
}

/* ---------- Bedienelemente ---------- */

const exampleSel = $('#example');
exampleSel.innerHTML = '<option value="">Beispiel laden…</option>' +
  Object.keys(EXAMPLES).map((k) => `<option>${k}</option>`).join('');
exampleSel.addEventListener('change', () => {
  const code = EXAMPLES[exampleSel.value];
  if (!code) return;
  currentName = exampleSel.value.toLowerCase().replace(/\s+/g, '-') + '.js';
  editor.setValue(code);
  exampleSel.value = '';
  run();
});

$('#btnRun').addEventListener('click', () => run());
$('#btnOpen').addEventListener('click', openFile);
$('#btnSave').addEventListener('click', saveFile);

$('#btnPrompt').addEventListener('click', async () => {
  const btn = $('#btnPrompt');
  try {
    await navigator.clipboard.writeText(AI_PROMPT);
    btn.textContent = 'Kopiert';
  } catch (_) {
    btn.textContent = 'Kopieren fehlgeschlagen';
  }
  setTimeout(() => { btn.textContent = 'KI-Anweisung kopieren'; }, 1800);
});

function toggle(btn, initial, onChange) {
  let state = initial;
  btn.addEventListener('click', () => {
    state = !state;
    btn.classList.toggle('on', state);
    onChange(state);
  });
}
$('#tFit').addEventListener('click', () => { if (!fitView()) setStatus('warn', 'Nichts zum Anpassen: Die Szene ist leer.'); });
toggle($('#tGrid'), true, (on) => { grid.visible = on; });
toggle($('#tAxes'), true, (on) => { axes.visible = on; });
toggle($('#tWire'), false, (on) => { wireframe = on; applyWireframe(); });
$('#tPause').addEventListener('click', (e) => {
  paused = !paused;
  e.target.classList.toggle('on', paused);
  e.target.textContent = paused ? 'Animation fortsetzen' : 'Animation pausieren';
});

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
});

/* Trennbalken zwischen Editor und Ansicht */
const gutter = $('#gutter');
gutter.addEventListener('pointerdown', (e) => {
  gutter.setPointerCapture(e.pointerId);
  gutter.classList.add('drag');
  const move = (ev) => {
    const w = $('#split').clientWidth;
    const px = Math.min(Math.max(ev.clientX, 300), w - 300);
    $('#split').style.setProperty('--left', px + 'px');
  };
  const up = () => {
    gutter.classList.remove('drag');
    gutter.removeEventListener('pointermove', move);
    gutter.removeEventListener('pointerup', up);
  };
  gutter.addEventListener('pointermove', move);
  gutter.addEventListener('pointerup', up);
});

/* ---------- Start ---------- */

let draft = null;
try { draft = localStorage.getItem(DRAFT_KEY); } catch (_) { /* egal */ }
initEditor(draft || EXAMPLES['Raketenantrieb']);
