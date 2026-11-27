import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { EXAMPLES, AI_PROMPT } from './examples.js';
import { createPhysicsEngine } from './physics.js';

const $ = (sel) => document.querySelector(sel);
const DRAFT_KEY = 'studio.draft.v1';

/* ---------- 3D-Ansicht ---------- */

const viewport = $('#viewport');
const canvas = $('#canvas');
const statusEl = $('#status');
const logEl = $('#log');

function setStatus(kind, text) {
  statusEl.className = kind;
  statusEl.textContent = text;
}

let physicsEngine = null;
let physicsLoadError = null;
try {
  physicsEngine = await createPhysicsEngine(THREE, window.Ammo);
} catch (error) {
  physicsLoadError = error;
  setStatus('err', `Physik-Engine konnte nicht geladen werden: ${error.message}`);
  console.error('Physik-Engine konnte nicht geladen werden:', error);
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const qualitySettings = {
  low: { pixelRatio: 0.8, shadowMapSize: 512, subdivision: 0, maxSubdivisionTriangles: 0 },
  medium: { pixelRatio: 1, shadowMapSize: 1024, subdivision: 0, maxSubdivisionTriangles: 0 },
  high: { pixelRatio: 1.5, shadowMapSize: 2048, subdivision: 1, maxSubdivisionTriangles: 500 },
  ultra: { pixelRatio: 2, shadowMapSize: 4096, subdivision: 2, maxSubdivisionTriangles: 4000 },
  adaptive: { pixelRatio: 1.5, shadowMapSize: 2048, subdivision: 1, maxSubdivisionTriangles: 180 },
};
let renderQuality = $('#tQuality').value;
let modelingMode = $('#tMode').value;
const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
let renderAnisotropy = maxAnisotropy;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d151d);
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
pmremGenerator.dispose();

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
camera.position.set(9, 7, 11);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;
controls.rotateSpeed = 0.8;
controls.zoomSpeed = 1;
controls.panSpeed = 0.8;
controls.minDistance = 0.1;
controls.maxDistance = 5000;
controls.minPolarAngle = 0.02;
controls.maxPolarAngle = Math.PI - 0.02;
controls.autoRotateSpeed = 1.5;

// Studiolicht (der Modellcode muss kein Licht anlegen)
scene.add(new THREE.HemisphereLight(0xdfeaff, 0x1a2530, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 2.0);
key.position.set(8, 14, 10);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -30;
key.shadow.camera.right = 30;
key.shadow.camera.top = 30;
key.shadow.camera.bottom = -30;
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 100;
key.shadow.bias = -0.0001;
key.shadow.normalBias = 0.02;
key.shadow.camera.updateProjectionMatrix();
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
let simulationRunning = true;
let wireframe = false;
let simTime = 0;
let animationSpeed = 1;
let simulationUiAccumulator = 0;
const clock = new THREE.Clock();

function requirePhysicsEngine() {
  if (!physicsEngine) {
    throw new Error(`Physik-Engine nicht verfügbar: ${physicsLoadError ? physicsLoadError.message : 'wird noch geladen.'}`);
  }
  return physicsEngine;
}

const physics = {
  add: (mesh, options) => requirePhysicsEngine().add(mesh, options),
  addSpring: (meshA, meshB, options) => requirePhysicsEngine().addSpring(meshA, meshB, options),
  addPendulum: (mesh, options) => requirePhysicsEngine().addPendulum(mesh, options),
  applyForce: (mesh, force, point) => requirePhysicsEngine().applyForce(mesh, force, point),
  clearForce: (mesh) => requirePhysicsEngine().clearForce(mesh),
  applyImpulse: (mesh, impulse, point) => requirePhysicsEngine().applyImpulse(mesh, impulse, point),
  applyTorque: (mesh, torque) => requirePhysicsEngine().applyTorque(mesh, torque),
  clearTorque: (mesh) => requirePhysicsEngine().clearTorque(mesh),
  setGravity: (value) => requirePhysicsEngine().setGravity(value),
};

const simulationReadouts = $('#simReadouts');
const gravityInputs = [$('#gravityX'), $('#gravityY'), $('#gravityZ')];
const simulationControls = [$('#simToggle'), $('#simStep'), $('#simReset'), ...gravityInputs];

function updateSimulationControls() {
  const toggleButton = $('#simToggle');
  toggleButton.textContent = simulationRunning ? 'Simulation pausieren' : 'Simulation starten';
  toggleButton.classList.toggle('on', simulationRunning);
}

function formatNumber(value, digits = 2) {
  return value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function updateSimulationReadouts() {
  if (!physicsEngine) {
    simulationReadouts.textContent = `Physik-Engine nicht verfügbar: ${physicsLoadError ? physicsLoadError.message : 'wird geladen.'}`;
    return;
  }

  const data = physicsEngine.snapshot();
  $('#simTime').textContent = `${formatNumber(data.time)} s`;
  $('#simBodies').textContent = `${data.dynamicBodyCount} / ${data.bodyCount}`;
  $('#simContacts').textContent = String(data.contactCount);
  $('#simKinetic').textContent = `${formatNumber(data.kineticEnergy)} J`;
  $('#simPotential').textContent = `${formatNumber(data.potentialEnergy)} J`;
  $('#simSpring').textContent = `${formatNumber(data.springEnergy)} J`;
  $('#simTotal').textContent = `${formatNumber(data.totalEnergy)} J`;

  const gravityValues = [data.gravity.x, data.gravity.y, data.gravity.z];
  gravityInputs.forEach((input, index) => {
    if (document.activeElement !== input) input.value = gravityValues[index].toFixed(2);
  });

  simulationReadouts.replaceChildren();
  if (data.objects.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'sim-empty';
    empty.textContent = 'Noch keine beweglichen Körper. Im Modellcode physics.add(mesh, { mass: ... }) verwenden.';
    simulationReadouts.append(empty);
    return;
  }

  for (const object of data.objects) {
    const card = document.createElement('div');
    card.className = 'body-readout';
    const title = document.createElement('strong');
    title.textContent = `${object.name} · ${object.shape} · ${formatNumber(object.mass)} kg`;
    const position = document.createElement('span');
    position.textContent = `Position: x ${formatNumber(object.position.x)}, y ${formatNumber(object.position.y)}, z ${formatNumber(object.position.z)} m`;
    const speed = document.createElement('span');
    speed.textContent = `Geschwindigkeit: ${formatNumber(object.speed)} m/s · Drehung: ${formatNumber(object.angularSpeed)} rad/s`;
    const energy = document.createElement('span');
    energy.textContent = `Ekin ${formatNumber(object.kineticEnergy)} J · Epot ${formatNumber(object.potentialEnergy)} J`;
    card.append(title, position, speed, energy);
    simulationReadouts.append(card);
  }
}

function applyGravityInputs() {
  if (gravityInputs.some((input) => input.value.trim() === '')) {
    setStatus('warn', 'Bitte alle drei Schwerkraftwerte eintragen.');
    return;
  }
  const values = gravityInputs.map((input) => Number(input.value));
  if (!values.every(Number.isFinite)) {
    setStatus('warn', 'Schwerkraftwerte müssen gültige Zahlen sein.');
    return;
  }
  try {
    physics.setGravity(new THREE.Vector3(...values));
    updateSimulationReadouts();
  } catch (error) {
    setStatus('err', `Schwerkraft konnte nicht gesetzt werden: ${error.message}`);
  }
}

if (physicsLoadError) {
  simulationControls.forEach((control) => { control.disabled = true; });
}

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
    const animationDt = dt * animationSpeed;
    simTime += animationDt;
    for (const cb of frameCallbacks) {
      try {
        cb(animationDt, simTime);
      } catch (e) {
        frameCallbacks.length = 0;
        reportError(e, 'Fehler in der Animation');
        break;
      }
    }
  }
  if (physicsEngine) {
    try {
      if (!paused && frameCallbacks.length) {
        physicsEngine.captureAnimationTargets(dt * animationSpeed);
      } else {
        physicsEngine.clearAnimationTargets();
      }
      if (simulationRunning) physicsEngine.advance(dt * animationSpeed);
      physicsEngine.syncBodies();
    } catch (e) {
      simulationRunning = false;
      updateSimulationControls();
      reportError(e, 'Fehler in der Physiksimulation');
    }
  }
  simulationUiAccumulator += dt;
  if (simulationUiAccumulator >= 0.1) {
    simulationUiAccumulator = 0;
    updateSimulationReadouts();
  }
  controls.update();
  renderer.render(scene, camera);
}

function disposeMaterial(m) {
  Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); });
  m.dispose();
}

function clearUser() {
  if (physicsEngine) physicsEngine.reset();
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

function updateShadows() {
  userGroup.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = object.userData.castShadow !== false;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value && value.isTexture) value.anisotropy = renderAnisotropy;
      }
    }
  });
}

function fitView() {
  const box = new THREE.Box3().setFromObject(userGroup);
  if (box.isEmpty()) return false;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const limitingFov = Math.min(verticalFov, horizontalFov);
  const dist = (radius / Math.sin(limitingFov / 2)) * 1.1;
  const dir = new THREE.Vector3(1, 0.7, 1.2).normalize();
  camera.position.copy(center).addScaledVector(dir, dist);
  camera.near = Math.max(dist / 200, 0.01);
  camera.far = dist * 200;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
  return true;
}

function setCameraView(view) {
  const directions = {
    front: new THREE.Vector3(0, 0, 1),
    right: new THREE.Vector3(1, 0, 0),
    top: new THREE.Vector3(0, 1, 0),
    iso: new THREE.Vector3(1, 0.8, 1).normalize(),
  };
  const direction = directions[view];
  if (!direction) return;

  const distance = Math.max(camera.position.distanceTo(controls.target), 1);
  camera.up.set(0, 1, 0);
  if (view === 'top') camera.up.set(0, 0, -1);
  camera.position.copy(controls.target).addScaledVector(direction, distance);
  camera.lookAt(controls.target);
  controls.update();
}

function updateRenderQuality() {
  const settings = qualitySettings[renderQuality] || qualitySettings.high;
  const deviceRatio = window.devicePixelRatio || 1;
  renderer.setPixelRatio(Math.min(deviceRatio * settings.pixelRatio, 4));
  renderAnisotropy = renderQuality === 'low' ? 1 :
    (renderQuality === 'medium' ? Math.min(4, maxAnisotropy) :
      (renderQuality === 'high' || renderQuality === 'adaptive' ? Math.min(8, maxAnisotropy) : maxAnisotropy));
  key.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
  key.shadow.map?.dispose();
  key.shadow.map = null;
  key.shadow.needsUpdate = true;
  updateShadows();
  renderer.setSize(Math.max(viewport.clientWidth, 1), Math.max(viewport.clientHeight, 1), false);
}

updateRenderQuality();

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

const validModelModes = new Set(['organic', 'realistic', 'engineering']);
const validQualities = new Set(['low', 'medium', 'high', 'ultra', 'adaptive']);

function assertMode(mode) {
  if (!validModelModes.has(mode)) {
    throw new Error(`Unbekannter Modellierungsmodus "${mode}". Erlaubt: organic, realistic, engineering.`);
  }
}

function assignModeling(target, options = {}) {
  if (!target || !target.isObject3D) throw new TypeError('modeling.assign erwartet ein THREE.Object3D.');
  if (options.mode) assertMode(options.mode);
  if (options.quality && !validQualities.has(options.quality)) {
    throw new Error(`Unbekannte Qualität "${options.quality}".`);
  }
  if (options.subdivision !== undefined &&
      (!Number.isInteger(options.subdivision) || options.subdivision < 0 || options.subdivision > 2)) {
    throw new RangeError('Subdivision muss eine ganze Zahl zwischen 0 und 2 sein.');
  }
  target.userData.modeling = { ...target.userData.modeling, ...options };
  return target;
}

function createPbrMaterial(options = {}) {
  return new THREE.MeshPhysicalMaterial({
    roughness: 0.55,
    metalness: 0,
    clearcoat: 0,
    ...options,
  });
}

function createRoundedBoxGeometry(width, height, depth, radius = 0.08, segments) {
  const dimensions = [width, height, depth, radius];
  if (!dimensions.every(Number.isFinite) || dimensions.slice(0, 3).some((value) => value <= 0) || radius < 0) {
    throw new RangeError('Abmessungen müssen positiv und der Kantenradius darf nicht negativ sein.');
  }
  const quality = qualitySettings[renderQuality] || qualitySettings.high;
  const detail = segments === undefined
    ? ({ low: 1, medium: 2, high: 3, ultra: 5, adaptive: 2 }[renderQuality] || 3)
    : segments;
  if (!Number.isInteger(detail) || detail < 1 || detail > 8) {
    throw new RangeError('Die Bevel-Auflösung muss eine ganze Zahl zwischen 1 und 8 sein.');
  }
  const clampedRadius = Math.min(radius, width / 2, height / 2, depth / 2);
  const geometry = new RoundedBoxGeometry(width, height, depth, detail, clampedRadius);
  geometry.userData.engineering = true;
  geometry.userData.quality = quality;
  return geometry;
}

function inferModelMode(mesh) {
  const labels = [];
  for (let object = mesh; object && object !== userGroup; object = object.parent) {
    if (object.name) labels.push(object.name);
    if (object.userData.partType) labels.push(String(object.userData.partType));
  }
  const label = labels.join(' ').toLowerCase();
  if (/(armor|armour|rüstung|gear|engine|motor|machine|maschine|bolt|bearing|turbine|metal|piston|cylinder|frame|chassis|rad|wheel|schraub|lager|kolben)/.test(label)) {
    return 'engineering';
  }
  if (/(body|face|skin|muscle|cloth|fabric|fur|hair|animal|human|head|torso|limb|organ|leaf|plant|haut|gesicht|körper|stoff|fell|tier|mensch|kopf|pflanz)/.test(label)) {
    return 'organic';
  }
  return 'realistic';
}

function inheritedModelingOptions(mesh) {
  const chain = [];
  for (let object = mesh; object && object !== userGroup; object = object.parent) {
    if (object.userData.modeling) chain.unshift(object.userData.modeling);
  }
  return Object.assign({}, ...chain);
}

function countDegenerateTriangles(geometry) {
  const position = geometry.getAttribute('position');
  const index = geometry.index;
  const count = index ? index.count : position.count;
  let degenerate = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  for (let i = 0; i + 2 < count; i += 3) {
    const ia = index ? index.getX(i) : i;
    const ib = index ? index.getX(i + 1) : i + 1;
    const ic = index ? index.getX(i + 2) : i + 2;
    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib);
    c.fromBufferAttribute(position, ic);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    if (ab.cross(ac).lengthSq() < 1e-18) degenerate++;
  }
  return degenerate;
}

function removeDegenerateIndexedTriangles(geometry) {
  if (!geometry.index || geometry.groups.length || geometry.drawRange.start !== 0 ||
      geometry.drawRange.count !== Infinity) return 0;
  const position = geometry.getAttribute('position');
  const index = geometry.index;
  const kept = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  let removed = 0;
  for (let i = 0; i + 2 < index.count; i += 3) {
    const ia = index.getX(i);
    const ib = index.getX(i + 1);
    const ic = index.getX(i + 2);
    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib);
    c.fromBufferAttribute(position, ic);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    if (ab.cross(ac).lengthSq() < 1e-18) {
      removed++;
    } else {
      kept.push(ia, ib, ic);
    }
  }
  if (removed) {
    if (!kept.length) throw new Error('Das Modell enthält ausschließlich degenerierte Dreiecke.');
    geometry.setIndex(kept);
  }
  return removed;
}

function subdivideOrganicGeometry(geometry, requestedLevels, triangleLimit) {
  if (!geometry.index || geometry.groups.length || geometry.drawRange.start !== 0 ||
      geometry.drawRange.count !== Infinity || Object.keys(geometry.morphAttributes).length) return 0;
  if (geometry.getAttribute('skinIndex') || geometry.getAttribute('skinWeight')) return 0;
  if (Object.values(geometry.attributes).some((attribute) =>
    attribute.isInterleavedBufferAttribute || attribute.itemSize > 4)) return 0;

  let completed = 0;
  for (let level = 0; level < requestedLevels; level++) {
    const position = geometry.getAttribute('position');
    const index = geometry.index;
    const triangleCount = Math.floor(index.count / 3);
    if (!position || triangleCount === 0 || triangleCount * 4 > triangleLimit) break;

    const neighbors = Array.from({ length: position.count }, () => new Set());
    const edges = new Map();
    let manifold = true;
    const addEdge = (from, to, opposite) => {
      const low = Math.min(from, to);
      const high = Math.max(from, to);
      const key = `${low}:${high}`;
      let edge = edges.get(key);
      if (!edge) {
        edge = { a: low, b: high, opposites: [] };
        edges.set(key, edge);
      }
      edge.opposites.push(opposite);
      if (edge.opposites.length > 2) manifold = false;
      neighbors[from].add(to);
      neighbors[to].add(from);
    };

    for (let i = 0; i + 2 < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      if (a >= position.count || b >= position.count || c >= position.count) {
        manifold = false;
        break;
      }
      addEdge(a, b, c);
      addEdge(b, c, a);
      addEdge(c, a, b);
    }
    if (!manifold) break;

    const sourceAttributes = Object.entries(geometry.attributes);
    const values = new Map(sourceAttributes.map(([name, attribute]) => {
      const rows = [];
      for (let i = 0; i < attribute.count; i++) {
        rows.push([
          attribute.getX(i),
          ...(attribute.itemSize > 1 ? [attribute.getY(i)] : []),
          ...(attribute.itemSize > 2 ? [attribute.getZ(i)] : []),
          ...(attribute.itemSize > 3 ? [attribute.getW(i)] : []),
        ]);
      }
      return [name, rows];
    }));

    const boundaryNeighbors = Array.from({ length: position.count }, () => []);
    for (const edge of edges.values()) {
      if (edge.opposites.length === 1) {
        boundaryNeighbors[edge.a].push(edge.b);
        boundaryNeighbors[edge.b].push(edge.a);
      }
    }

    const updatedEven = new Map();
    for (let vertex = 0; vertex < position.count; vertex++) {
      const boundary = boundaryNeighbors[vertex];
      if (boundary.length > 2) {
        manifold = false;
        break;
      }
      const adjacent = [...neighbors[vertex]];
      for (const [name, attribute] of sourceAttributes) {
        const source = values.get(name);
        const original = source[vertex];
        const updated = original.slice();
        if (name === 'position') {
          if (boundary.length === 2) {
            for (let axis = 0; axis < 3; axis++) {
              updated[axis] = original[axis] * 0.75 +
                (source[boundary[0]][axis] + source[boundary[1]][axis]) * 0.125;
            }
          } else if (adjacent.length >= 3) {
            const beta = adjacent.length === 3 ? 3 / 16 : 3 / (8 * adjacent.length);
            for (let axis = 0; axis < 3; axis++) {
              const sum = adjacent.reduce((total, neighbor) => total + source[neighbor][axis], 0);
              updated[axis] = original[axis] * (1 - adjacent.length * beta) + sum * beta;
            }
          }
        }
        let rows = updatedEven.get(name);
        if (!rows) updatedEven.set(name, rows = []);
        rows.push(updated);
      }
    }
    if (!manifold) break;

    const edgeVertices = new Map();
    const oddValues = new Map(sourceAttributes.map(([name]) => [name, []]));
    for (const [key, edge] of edges) {
      const aValues = values.get('position')[edge.a];
      const bValues = values.get('position')[edge.b];
      const point = aValues.slice();
      if (edge.opposites.length === 2) {
        const oppositeA = values.get('position')[edge.opposites[0]];
        const oppositeB = values.get('position')[edge.opposites[1]];
        for (let axis = 0; axis < 3; axis++) {
          point[axis] = (aValues[axis] + bValues[axis]) * 0.375 +
            (oppositeA[axis] + oppositeB[axis]) * 0.125;
        }
      } else {
        for (let axis = 0; axis < 3; axis++) point[axis] = (aValues[axis] + bValues[axis]) * 0.5;
      }
      const vertexIndex = position.count + edgeVertices.size;
      edgeVertices.set(key, vertexIndex);
      for (const [name] of sourceAttributes) {
        const a = values.get(name)[edge.a];
        const b = values.get(name)[edge.b];
        const midpoint = a.map((component, axis) =>
          name === 'position' && axis < 3 ? point[axis] : (component + b[axis]) * 0.5);
        oddValues.get(name).push(midpoint);
      }
    }

    for (const [name, attribute] of sourceAttributes) {
      const rows = [...updatedEven.get(name), ...oddValues.get(name)];
      const flat = rows.flat();
      const next = new THREE.Float32BufferAttribute(flat, attribute.itemSize, attribute.normalized);
      next.name = attribute.name;
      geometry.setAttribute(name, next);
    }

    const nextIndices = [];
    for (let i = 0; i + 2 < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      const ab = edgeVertices.get(`${Math.min(a, b)}:${Math.max(a, b)}`);
      const bc = edgeVertices.get(`${Math.min(b, c)}:${Math.max(b, c)}`);
      const ca = edgeVertices.get(`${Math.min(c, a)}:${Math.max(c, a)}`);
      nextIndices.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    geometry.setIndex(nextIndices);
    geometry.deleteAttribute('tangent');
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    completed++;
  }
  return completed;
}

function optimizeModelGeometry() {
  const report = { repairedNormals: 0, subdivided: 0, degenerate: 0, removedDegenerate: 0 };
  const meshes = [];
  userGroup.traverse((object) => { if (object.isMesh) meshes.push(object); });
  let remainingSubdivisionBudget = 50000;

  for (const mesh of meshes) {
    if (!mesh.geometry?.isBufferGeometry) {
      throw new Error(`Bauteil "${mesh.name || 'ohne Namen'}" verwendet keine BufferGeometry.`);
    }
    let geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    if (!position || position.count < 3) {
      throw new Error(`Bauteil "${mesh.name || 'ohne Namen'}" hat keine brauchbare Positionsgeometrie.`);
    }
    for (let i = 0; i < position.count; i++) {
      if (![position.getX(i), position.getY(i), position.getZ(i)].every(Number.isFinite)) {
        throw new Error(`Bauteil "${mesh.name || 'ohne Namen'}" enthält ungültige Vertex-Koordinaten.`);
      }
    }
    if (geometry.index) {
      if (geometry.index.count % 3 !== 0) {
        throw new Error(`Bauteil "${mesh.name || 'ohne Namen'}" hat eine unvollständige Dreiecksindizierung.`);
      }
      for (let i = 0; i < geometry.index.count; i++) {
        const vertex = geometry.index.getX(i);
        if (!Number.isInteger(vertex) || vertex < 0 || vertex >= position.count) {
          throw new Error(`Bauteil "${mesh.name || 'ohne Namen'}" enthält einen ungültigen Geometrieindex.`);
        }
      }
    }
    let triangles = geometry.index ? Math.floor(geometry.index.count / 3) : Math.floor(position.count / 3);
    const degenerate = countDegenerateTriangles(geometry);
    report.degenerate += degenerate;
    const removedDegenerate = removeDegenerateIndexedTriangles(geometry);
    report.removedDegenerate += removedDegenerate;
    if (degenerate > removedDegenerate) {
      log(`Geometriehinweis: "${mesh.name || 'Bauteil'}" enthält ${degenerate - removedDegenerate} nicht automatisch korrigierbare degenerierte Dreiecke.`);
    }
    if (removedDegenerate) triangles -= removedDegenerate;

    const options = inheritedModelingOptions(mesh);
    const mode = options.mode || (modelingMode === 'adaptive' ? inferModelMode(mesh) : modelingMode);
    if (options.mode) assertMode(mode);
    let quality = options.quality || renderQuality;
    if (quality === 'adaptive') {
      quality = triangles > 10000 ? 'low' :
        (triangles > 3000 || mode === 'engineering' ? 'medium' : 'adaptive');
    }
    const profile = qualitySettings[quality] || qualitySettings.high;
    const smooth = options.smooth !== false && mode === 'organic';
    const subdivision = Number.isInteger(options.subdivision)
      ? options.subdivision
      : (smooth && triangles <= profile.maxSubdivisionTriangles ? profile.subdivision : 0);
    const materialList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const flatShading = materialList.some((material) => material && material.flatShading);
    if (smooth && !flatShading && subdivision > 0 && remainingSubdivisionBudget > 0) {
      const applied = subdivideOrganicGeometry(
        geometry,
        Math.min(subdivision, profile.subdivision || subdivision),
        Math.min(remainingSubdivisionBudget, 100000),
      );
      if (applied) {
        report.subdivided += applied;
        remainingSubdivisionBudget -= triangles * (4 ** applied) - triangles;
      }
    }

    const normal = geometry.getAttribute('normal');
    let normalsValid = Boolean(normal && normal.count === geometry.getAttribute('position').count);
    if (normalsValid) {
      for (let i = 0; i < normal.count; i++) {
        if (![normal.getX(i), normal.getY(i), normal.getZ(i)].every(Number.isFinite)) {
          normalsValid = false;
          break;
        }
      }
    }
    if ((smooth && geometry.index && !flatShading) || removedDegenerate > 0 || !normalsValid) {
      if (mode === 'engineering' && !normalsValid && geometry.index) {
        geometry = geometry.toNonIndexed();
        mesh.geometry = geometry;
      }
      geometry.computeVertexNormals();
      report.repairedNormals++;
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    if (!mesh.material) {
      mesh.material = createPbrMaterial();
      log(`Geometriehinweis: Für "${mesh.name || 'Bauteil'}" wurde ein Standard-PBR-Material erstellt.`);
    }
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) material.envMapIntensity = 1;
    }
  }
  if (report.repairedNormals || report.subdivided || report.degenerate) {
    log(`Optimierung: ${report.repairedNormals} Normalen aktualisiert, ${report.subdivided} Subdivision-Schritt(e), ${report.removedDegenerate} degenerierte Dreiecke entfernt.`);
  }
  return report;
}

const modeling = {
  assign: assignModeling,
  material: createPbrMaterial,
  roundedBox: createRoundedBoxGeometry,
  subdivide(target, levels = 1) {
    if (!target || !target.isMesh || !target.geometry?.isBufferGeometry) {
      throw new TypeError('modeling.subdivide erwartet ein Mesh mit BufferGeometry.');
    }
    if (!Number.isInteger(levels) || levels < 1 || levels > 2) {
      throw new RangeError('Subdivision-Level muss 1 oder 2 sein.');
    }
    const applied = subdivideOrganicGeometry(target.geometry, levels, 100000);
    if (applied !== levels) {
      throw new Error('Subdivision wurde durch Topologie, Geometriegruppen oder das Polygonlimit begrenzt.');
    }
    return target;
  },
};

/* ---------- Status und Konsole ---------- */

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
    msg += ' (Tipp: "scene", "THREE", "physics" und "onFrame" gibt es schon. Nicht noch einmal mit const anlegen.)';
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
    const fn = new Function('THREE', 'scene', 'onFrame', 'console', 'physics', 'modeling',
      code + '\n//# sourceURL=usercode.js');
    fn(THREE, userGroup, (cb) => { if (typeof cb === 'function') frameCallbacks.push(cb); },
      userConsole, physics, modeling);
    optimizeModelGeometry();
  } catch (e) {
    clearUser();
    reportError(e);
    return;
  }

  updateShadows();
  applyWireframe();
  updateSimulationReadouts();
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

/* ---------- Export ---------- */

function downloadBinary(filename, arrayBuffer) {
  return window.studio.saveBinaryFile(filename, new Uint8Array(arrayBuffer));
}

function exportGlb() {
  if (!stats().meshes) { setStatus('warn', 'Nichts zu exportieren: Die Szene ist leer.'); return; }
  const exporter = new GLTFExporter();
  exporter.parse(
    userGroup,
    async (result) => {
      try {
        const name = await downloadBinary(currentName.replace(/\.js$/i, '') + '.glb', result);
        if (name) setStatus('ok', `Exportiert: ${name}`);
      } catch (e) { setStatus('err', `GLB-Export fehlgeschlagen: ${e.message}`); }
    },
    (error) => setStatus('err', `GLB-Export fehlgeschlagen: ${error.message || error}`),
    { binary: true },
  );
}

function exportStl() {
  if (!stats().meshes) { setStatus('warn', 'Nichts zu exportieren: Die Szene ist leer.'); return; }
  try {
    const exporter = new STLExporter();
    const result = exporter.parse(userGroup, { binary: true });
    downloadBinary(currentName.replace(/\.js$/i, '') + '.stl', result.buffer)
      .then((name) => { if (name) setStatus('ok', `Exportiert: ${name}`); })
      .catch((e) => setStatus('err', `STL-Export fehlgeschlagen: ${e.message}`));
  } catch (e) {
    setStatus('err', `STL-Export fehlgeschlagen: ${e.message}`);
  }
}

function exportPng() {
  try {
    renderer.render(scene, camera);
    canvas.toBlob(async (blob) => {
      if (!blob) { setStatus('err', 'PNG-Export fehlgeschlagen: Kein Bild erhalten.'); return; }
      const buffer = await blob.arrayBuffer();
      try {
        const name = await downloadBinary(currentName.replace(/\.js$/i, '') + '.png', buffer);
        if (name) setStatus('ok', `Exportiert: ${name}`);
      } catch (e) { setStatus('err', `PNG-Export fehlgeschlagen: ${e.message}`); }
    }, 'image/png');
  } catch (e) {
    setStatus('err', `PNG-Export fehlgeschlagen: ${e.message}`);
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
$('#btnExportGlb').addEventListener('click', exportGlb);
$('#btnExportStl').addEventListener('click', exportStl);
$('#btnExportPng').addEventListener('click', exportPng);

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
$('#tView').addEventListener('change', (event) => {
  setCameraView(event.currentTarget.value);
  event.currentTarget.value = '';
});
$('#tQuality').addEventListener('change', (event) => {
  renderQuality = event.currentTarget.value;
  updateRenderQuality();
  if (stats().meshes) setStatus('warn', 'Renderqualität aktualisiert; Geometriequalität gilt ab der nächsten Ausführung.');
});
$('#tMode').addEventListener('change', (event) => {
  modelingMode = event.currentTarget.value;
  if (stats().meshes) setStatus('warn', 'Modellierungsmodus gilt ab der nächsten Ausführung.');
});
$('#tSpeed').addEventListener('change', (event) => {
  animationSpeed = Number(event.currentTarget.value);
});
$('#simToggle').addEventListener('click', () => {
  simulationRunning = !simulationRunning;
  updateSimulationControls();
});
$('#simStep').addEventListener('click', () => {
  try {
    simulationRunning = false;
    updateSimulationControls();
    requirePhysicsEngine().stepOnce();
    updateSimulationReadouts();
  } catch (error) {
    setStatus('err', `Ein Simulationsschritt ist fehlgeschlagen: ${error.message}`);
  }
});
$('#simReset').addEventListener('click', () => {
  try {
    simulationRunning = false;
    updateSimulationControls();
    requirePhysicsEngine().resetBodies();
    updateSimulationReadouts();
  } catch (error) {
    setStatus('err', `Simulation konnte nicht zurückgesetzt werden: ${error.message}`);
  }
});
gravityInputs.forEach((input) => input.addEventListener('change', applyGravityInputs));
toggle($('#tOrbit'), false, (on) => { controls.autoRotate = on; });
toggle($('#tGrid'), true, (on) => { grid.visible = on; });
toggle($('#tAxes'), true, (on) => { axes.visible = on; });
toggle($('#tWire'), false, (on) => { wireframe = on; applyWireframe(); });
$('#tPause').addEventListener('click', (e) => {
  paused = !paused;
  e.target.classList.toggle('on', paused);
  e.target.textContent = paused ? 'Animation fortsetzen' : 'Animation pausieren';
});

const fullscreenButton = $('#tFullscreen');
fullscreenButton.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement === viewport) {
      await document.exitFullscreen();
    } else {
      await viewport.requestFullscreen();
    }
  } catch (error) {
    setStatus('warn', `Vollbild konnte nicht geändert werden: ${error.message}`);
  }
});
document.addEventListener('fullscreenchange', () => {
  const isFullscreen = document.fullscreenElement === viewport;
  fullscreenButton.textContent = isFullscreen ? 'Vollbild schließen' : 'Vollbild';
  fullscreenButton.classList.toggle('on', isFullscreen);
});

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
  if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey &&
      !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) &&
      !e.target.isContentEditable) {
    e.preventDefault();
    fullscreenButton.click();
  }
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
initEditor(draft || EXAMPLES['Physik-Labor']);
updateSimulationControls();
updateSimulationReadouts();
tick();
