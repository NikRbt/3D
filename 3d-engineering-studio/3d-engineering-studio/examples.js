// Beispielmodelle und die Anweisung, die du einer KI geben kannst.

export const AI_PROMPT = `Schreibe mir den Quellcode für ein 3D-Modell von: [HIER BESCHREIBEN, WAS GEBAUT WERDEN SOLL]

Regeln für den Code:
- Reines JavaScript für three.js. Kein import, kein export, kein HTML.
- Diese Variablen sind schon vorhanden: THREE (die komplette Bibliothek), scene (eine leere THREE.Group, füge ALLE Objekte mit scene.add(...) hinzu) und onFrame((dt, t) => { ... }) für Animationen (dt = Sekunden seit dem letzten Bild, t = Gesamtzeit).
- Nicht selbst erstellen: Scene, Camera, Renderer, OrbitControls, Lichter. Die gibt es schon.
- Y-Achse ist oben. Das Modell soll um den Ursprung zentriert und ungefähr 10 Einheiten groß sein.
- Nutze MeshStandardMaterial, gruppiere Bauteile mit THREE.Group und kommentiere jedes Bauteil kurz.
- Gib nur einen einzigen Codeblock aus.`;

export const EXAMPLES = {
  'Raketenantrieb': `// Raketenantrieb (Beispiel) - Y-Achse ist oben
const steel  = new THREE.MeshStandardMaterial({ color: 0x8a97a3, metalness: 0.85, roughness: 0.35 });
const copper = new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.9, roughness: 0.4, side: THREE.DoubleSide });
const dark   = new THREE.MeshStandardMaterial({ color: 0x2b3640, metalness: 0.6, roughness: 0.5 });

const engine = new THREE.Group();

// Brennkammer und Düse als Rotationskörper (Radius, Höhe)
const profile = new THREE.SplineCurve([
  new THREE.Vector2(0.9, 4.0), new THREE.Vector2(1.0, 3.4), new THREE.Vector2(1.0, 2.6),
  new THREE.Vector2(0.7, 2.0), new THREE.Vector2(0.42, 1.5), new THREE.Vector2(0.5, 1.2),
  new THREE.Vector2(0.75, 0.7), new THREE.Vector2(1.1, 0.1), new THREE.Vector2(1.5, -0.6),
  new THREE.Vector2(1.9, -1.4), new THREE.Vector2(2.2, -2.2),
]).getPoints(80);
const nozzle = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), copper);
engine.add(nozzle);

// Injektorkopf mit Flansch
const head = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.5, 48), steel);
head.position.y = 4.25;
engine.add(head);
const flange = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.08, 16, 48), steel);
flange.rotation.x = Math.PI / 2;
flange.position.y = 4.0;
engine.add(flange);

// Kühlringe um die Brennkammer
[3.2, 2.7, 2.2].forEach((y) => {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.03, 0.05, 12, 48), steel);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = y;
  engine.add(ring);
});

// Turbopumpe seitlich am Triebwerk
const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 32), dark);
pump.position.set(2.2, 3.4, 0);
engine.add(pump);

const rotor = new THREE.Group();
for (let i = 0; i < 6; i++) {
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.14), steel);
  blade.rotation.y = (i / 6) * Math.PI;
  rotor.add(blade);
}
rotor.position.set(2.2, 4.05, 0);
engine.add(rotor);

// Zuleitung von der Pumpe zum Injektorkopf
const pipePath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(1.9, 3.9, 0), new THREE.Vector3(1.5, 4.6, 0), new THREE.Vector3(0.6, 4.8, 0),
]);
engine.add(new THREE.Mesh(new THREE.TubeGeometry(pipePath, 24, 0.09, 12), steel));

// Abgasstrahl (nur Optik)
const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.55 });
const flame = new THREE.Mesh(new THREE.ConeGeometry(1.5, 4, 32, 1, true), flameMat);
flame.rotation.x = Math.PI;
flame.position.y = -4.2;
engine.add(flame);

scene.add(engine);

// Animation: Pumpe dreht sich, Flamme flackert
onFrame((dt, t) => {
  rotor.rotation.y += dt * 12;
  flame.scale.y = 1 + Math.sin(t * 30) * 0.08;
  flame.scale.x = flame.scale.z = 1 + Math.sin(t * 22) * 0.04;
});
`,

  'Grundkörper': `// Grundkörper (Beispiel)
const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2 });

const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat(0x4488ff));
box.position.set(-5, 1, 0);

const ball = new THREE.Mesh(new THREE.SphereGeometry(1.2, 48, 32), mat(0xff7a59));
ball.position.set(-2, 1.2, 0);

const cyl = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.4, 48), mat(0x6fcf97));
cyl.position.set(1, 1.2, 0);

const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 48), mat(0xf2c94c));
cone.position.set(4, 1.2, 0);

const torus = new THREE.Mesh(new THREE.TorusGeometry(1, 0.35, 24, 64), mat(0xbb6bd9));
torus.position.set(7.5, 1.4, 0);

scene.add(box, ball, cyl, cone, torus);

onFrame((dt) => {
  box.rotation.y += dt;
  torus.rotation.x += dt * 1.5;
});
`,

  'Haus': `// Einfaches Haus (Beispiel)
const wall = new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.9 });
const roofMat = new THREE.MeshStandardMaterial({ color: 0x9c3b2e, roughness: 0.8 });
const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.8 });
const glass = new THREE.MeshStandardMaterial({ color: 0x9fd3ff, metalness: 0.3, roughness: 0.1 });

const house = new THREE.Group();

const body = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 4), wall);
body.position.y = 1.5;
house.add(body);

// Dach als vierseitige Pyramide
const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.2, 4), roofMat);
roof.rotation.y = Math.PI / 4;
roof.position.y = 4.1;
house.add(roof);

// Tür
const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.1), wood);
door.position.set(0, 1, 2.05);
house.add(door);

// Fenster links und rechts der Tür
[-2, 2].forEach((x) => {
  const win = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 0.1), glass);
  win.position.set(x, 1.7, 2.05);
  house.add(win);
});

// Schornstein
const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), roofMat);
chimney.position.set(1.6, 4.4, -0.6);
house.add(chimney);

scene.add(house);
`,
};
