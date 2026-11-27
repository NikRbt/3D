// Beispielmodelle und die Anweisung, die du einer KI geben kannst.

export const AI_PROMPT = `Schreibe mir den Quellcode für ein 3D-Modell von: [HIER BESCHREIBEN, WAS GEBAUT WERDEN SOLL]

Regeln für den Code:
- Reines JavaScript für three.js. Kein import, kein export, kein HTML.
- Diese Variablen sind schon vorhanden: THREE, scene (leere THREE.Group), onFrame((dt, t) => { ... }), physics (Bullet-Physik) und modeling.
- Nicht selbst erstellen: Scene, Camera, Renderer, OrbitControls, Lichter. Die gibt es schon.
- Y-Achse ist oben. Das Modell soll um den Ursprung zentriert und ungefähr 10 Einheiten groß sein.
- Gruppiere Bauteile mit THREE.Group und kommentiere sie kurz. Weise Bauteilen den passenden Modus zu:
  modeling.assign(gruppeOderMesh, { mode: 'organic' | 'realistic' | 'engineering', quality: 'adaptive', subdivision: 0 | 1 | 2 })
  Moduszuweisung an Gruppen gilt für ihre Bauteile; eine Zuweisung am Mesh hat Vorrang. Nutze 'organic' für Körper, Gesicht, Stoff und Naturformen, 'engineering' für präzise Bauteile und 'realistic' für PBR-Oberflächen. Ohne Zuweisung klassifiziert die Engine Bauteile anhand ihrer Namen.
- Verwende modeling.material({ color, roughness, metalness, normalMap, roughnessMap, ... }) für MeshPhysicalMaterial/PBR.
- Verwende modeling.roundedBox(breite, höhe, tiefe, kantenradius) für leicht abgefaste technische Quader. Technische Kanten nicht pauschal glätten.
- Nutze ausreichend aufgelöste Geometrie (z. B. 32-64 Segmente für sichtbare Rundungen). Organische indexed Geometrien werden bei niedriger Polygonzahl adaptiv mit Loop-Subdivision verfeinert und geglättet; scharfe Engineering-Normalen bleiben erhalten.
- Animationen mit dt statt festen Bildschritten berechnen. Verwende weiche Bewegungen und plausible Geschwindigkeiten; vermeide abrupte Sprünge.
- Physikkörper nach scene.add(mesh) mit physics.add(mesh, { mass, friction, restitution, linearDamping, angularDamping, name }) registrieren. Verfügbare Grundformen: Box, Kugel, Zylinder mit gleichem Radius und Kapsel.
- Verwende SI-Einheiten (m, kg, s). Statische Körper haben mass: 0. physics.applyForce und applyTorque wirken dauerhaft bis physics.clearForce bzw. clearTorque; für einmalige Stöße physics.applyImpulse verwenden. Federn und Pendel stehen über addSpring und addPendulum bereit.
- Wenn ein mit physics.add registrierter Körper in onFrame bewegt oder gedreht wird, nutzt die Physik diese Bewegung als weiches Antriebsziel. Schwerkraft, Kollisionen und andere Kräfte beeinflussen das tatsächliche Ergebnis weiterhin. animationDrive: false deaktiviert diesen Antrieb für einzelne Körper.
- Nicht mit physics.add registrierte Meshes können in onFrame rein visuell animiert werden. Für physikalisch beeinflusste Bauteile jedem Mesh eine passende Masse und Kollisionsform geben.
- Gib jedem Bauteil einen aussagekräftigen Namen und verwende für gemischte Modelle explizite modeling.assign-Zuweisungen (z. B. organischer Körper, Engineering-Rüstung, realistisches Metall).
- Gib nur einen einzigen Codeblock aus.`;

export const EXAMPLES = {
  'Organischer Charakter': `// Ein Krieger mit organischem Körper und technischer Rüstung
const skin = modeling.material({ color: 0xc98e68, roughness: 0.72 });
const cloth = modeling.material({ color: 0x263c58, roughness: 0.88 });
const armor = modeling.material({ color: 0x9caab5, metalness: 0.82, roughness: 0.27, clearcoat: 0.2 });
const warrior = new THREE.Group();
warrior.name = 'Krieger';
const body = new THREE.Group();
body.name = 'body torso';
modeling.assign(body, { mode: 'organic' });
const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.82, 1.35, 8, 24), cloth);
torso.name = 'cloth tunic';
torso.position.y = 2.45;
body.add(torso);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.58, 32, 24), skin);
head.name = 'face head';
head.position.y = 4.25;
body.add(head);
const armGeometry = new THREE.CapsuleGeometry(0.22, 1.05, 6, 16);
[-1, 1].forEach((side) => {
  const arm = new THREE.Mesh(armGeometry, skin);
  arm.name = 'organic arm';
  arm.position.set(side * 1.05, 2.65, 0);
  arm.rotation.z = side * -0.22;
  body.add(arm);
});
warrior.add(body);

const chestPlate = new THREE.Mesh(modeling.roundedBox(1.55, 1.45, 0.22, 0.12), armor);
chestPlate.name = 'engineering armor chest plate';
chestPlate.position.set(0, 2.75, 0.48);
modeling.assign(chestPlate, { mode: 'engineering' });
warrior.add(chestPlate);
scene.add(warrior);
`,

  'Realistischer Keramikbecher': `// Hochaufgelöster Keramikbecher mit physikalischem Material
const ceramic = modeling.material({
  color: 0x3e8792,
  roughness: 0.22,
  metalness: 0,
  clearcoat: 0.8,
  clearcoatRoughness: 0.16,
});
const profile = new THREE.SplineCurve([
  new THREE.Vector2(0.58, -1.6),
  new THREE.Vector2(0.66, -1.45),
  new THREE.Vector2(0.82, 0.9),
  new THREE.Vector2(0.78, 1.1),
  new THREE.Vector2(0.62, 1.1),
  new THREE.Vector2(0.56, 0.85),
  new THREE.Vector2(0.48, -1.1),
]).getPoints(48);
const cup = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), ceramic);
cup.name = 'realistic glazed ceramic cup';
modeling.assign(cup, { mode: 'realistic', quality: 'adaptive' });
scene.add(cup);

const handlePath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0.6, 0.72, 0),
  new THREE.Vector3(1.45, 0.7, 0),
  new THREE.Vector3(1.58, 0, 0),
  new THREE.Vector3(1.4, -0.75, 0),
  new THREE.Vector3(0.58, -0.82, 0),
]);
const handle = new THREE.Mesh(new THREE.TubeGeometry(handlePath, 48, 0.11, 16), ceramic);
handle.name = 'ceramic handle';
modeling.assign(handle, { mode: 'realistic' });
scene.add(handle);
`,

  'Engineering-Maschinenkonstruktion': `// Präzise Baugruppe aus Lagerblock, Welle und Zahnrad
const steel = modeling.material({ color: 0x8999a5, metalness: 0.88, roughness: 0.24 });
const brass = modeling.material({ color: 0xb58a43, metalness: 0.78, roughness: 0.3 });
const machine = new THREE.Group();
machine.name = 'engineering gearbox';
modeling.assign(machine, { mode: 'engineering', quality: 'adaptive' });

const base = new THREE.Mesh(modeling.roundedBox(4.8, 0.42, 2.6, 0.1), steel);
base.name = 'machined base plate';
base.position.y = 0.25;
machine.add(base);

const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 3.4, 48), steel);
shaft.name = 'precision shaft';
shaft.rotation.z = Math.PI / 2;
shaft.position.y = 1.6;
machine.add(shaft);

const gear = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.32, 64), brass);
gear.name = 'drive gear';
gear.rotation.z = Math.PI / 2;
gear.position.set(-0.75, 1.6, 0);
machine.add(gear);
const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.46, 48), steel);
hub.name = 'shaft hub';
hub.rotation.z = Math.PI / 2;
hub.position.set(-0.75, 1.6, 0);
machine.add(hub);

[-1.45, 1.45].forEach((x) => {
  const bearing = new THREE.Mesh(modeling.roundedBox(0.7, 1.25, 1.1, 0.08), steel);
  bearing.name = 'engineering bearing block';
  bearing.position.set(x, 1.1, 0);
  machine.add(bearing);
});
scene.add(machine);
`,

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

// Mehrschichtiger Abgasstrahl mit weichem Lichtflackern
const flameMat = new THREE.MeshBasicMaterial({
  color: 0xff792e, transparent: true, opacity: 0.28,
  blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});
const coreMat = new THREE.MeshBasicMaterial({
  color: 0xffe6a1, transparent: true, opacity: 0.68,
  blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});
const flame = new THREE.Mesh(new THREE.ConeGeometry(1.35, 4, 40, 1, true), flameMat);
flame.rotation.x = Math.PI;
flame.position.y = -4.2;
flame.userData.castShadow = false;
engine.add(flame);
const flameCore = new THREE.Mesh(new THREE.ConeGeometry(0.65, 3.2, 32, 1, true), coreMat);
flameCore.rotation.x = Math.PI;
flameCore.position.y = -4.55;
flameCore.userData.castShadow = false;
engine.add(flameCore);
const exhaustGlow = new THREE.PointLight(0xff762e, 3, 10, 2);
exhaustGlow.position.set(0, -4.7, 0);
engine.add(exhaustGlow);

scene.add(engine);

// Animation: gleichmäßiger Rotorlauf und sanft variierender Abgasstrahl
onFrame((dt, t) => {
  rotor.rotation.y += dt * 12;
  const pulse = 0.5 + 0.5 * Math.sin(t * 9);
  const flutter = Math.sin(t * 17 + Math.sin(t * 5) * 0.7);
  flame.scale.set(1 + flutter * 0.07, 0.92 + pulse * 0.12, 1 + flutter * 0.07);
  flameCore.scale.set(0.92 + pulse * 0.12, 0.9 + pulse * 0.18, 0.92 + pulse * 0.12);
  flame.rotation.z = Math.sin(t * 4) * 0.025;
  flameCore.rotation.z = flame.rotation.z * 0.7;
  exhaustGlow.intensity = 2.1 + pulse * 1.2;
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

  'Physik-Labor': `// Dynamik-Labor: Kollision, Feder und Pendel mit Bullet-Physik
const steel = new THREE.MeshStandardMaterial({ color: 0x8a97a3, metalness: 0.65, roughness: 0.32 });
const blue = new THREE.MeshStandardMaterial({ color: 0x4488ff, metalness: 0.2, roughness: 0.35 });
const orange = new THREE.MeshStandardMaterial({ color: 0xff9f43, metalness: 0.1, roughness: 0.38 });
const green = new THREE.MeshStandardMaterial({ color: 0x6fcf97, metalness: 0.15, roughness: 0.42 });

// Fester Boden: Masse 0 bedeutet statischer Kollisionskörper
const floor = new THREE.Mesh(new THREE.BoxGeometry(18, 0.5, 12), steel);
floor.position.y = -0.25;
floor.name = 'Boden';
scene.add(floor);
physics.add(floor, { mass: 0, friction: 0.85 });

// Dynamischer Quader fällt und stößt elastisch mit anderen Körpern zusammen
const block = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), blue);
block.position.set(-4, 4, 0);
block.name = 'Fallender Quader';
scene.add(block);
physics.add(block, { mass: 2, friction: 0.55, restitution: 0.18 });

// Eine Kugel mit Anfangsimpuls zeigt den Impulserhalt bei Kollisionen
const ball = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 24), orange);
ball.position.set(-2, 2, 0);
ball.name = 'Kollisionskugel';
scene.add(ball);
physics.add(ball, {
  mass: 1,
  friction: 0.35,
  restitution: 0.72,
  velocity: new THREE.Vector3(3, 0, 0),
});

// Feder zieht den Körper zu einem festen Anker; Steifigkeit N/m, Dämpfung Ns/m
const springMass = new THREE.Mesh(new THREE.SphereGeometry(0.42, 28, 20), green);
springMass.position.set(1, 2.8, 0);
springMass.name = 'Federkörper';
scene.add(springMass);
physics.add(springMass, { mass: 1.5, friction: 0.4, linearDamping: 0.01 });
physics.addSpring(springMass, null, {
  anchor: new THREE.Vector3(1, 6, 0),
  restLength: 2.4,
  stiffness: 18,
  damping: 1.4,
  name: 'Vertikalfeder',
});

// Pendel: die Kugel ist am Weltpunkt befestigt und kann frei schwingen
const pivot = new THREE.Vector3(5, 6.5, 0);
const pendulum = new THREE.Mesh(new THREE.SphereGeometry(0.48, 28, 20), orange);
pendulum.position.set(6.8, 4.1, 0);
pendulum.name = 'Pendelmasse';
scene.add(pendulum);
physics.add(pendulum, { mass: 1.2, friction: 0.35, restitution: 0.12 });
physics.addPendulum(pendulum, { pivot });

// Sichtbarer Pendelstab folgt der vom Physiksolver berechneten Bewegung
const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 12), steel);
scene.add(rod);
const up = new THREE.Vector3(0, 1, 0);
onFrame(() => {
  const direction = pendulum.position.clone().sub(pivot);
  rod.position.copy(pivot).add(pendulum.position).multiplyScalar(0.5);
  rod.scale.y = direction.length();
  rod.quaternion.setFromUnitVectors(up, direction.normalize());
});
`,
};
