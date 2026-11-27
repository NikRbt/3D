const FIXED_STEP = 1 / 120;
const MAX_FRAME_DELTA = 0.25;
const ANIMATION_DRIVE_FREQUENCY = 8;
const MAX_ANIMATION_ACCELERATION = 100;
const MAX_ANIMATION_ANGULAR_ACCELERATION = 120;

export async function createPhysicsEngine(THREE, AmmoFactory) {
  if (typeof AmmoFactory !== 'function') {
    throw new Error('Die mit Three.js gelieferte Ammo.js-Physikbibliothek wurde nicht geladen.');
  }

  const wasmUrl = new URL('node_modules/three/examples/jsm/libs/ammo.wasm.wasm', window.location.href).href;
  const wasmBinary = window.studio && typeof window.studio.loadPhysicsWasm === 'function'
    ? await window.studio.loadPhysicsWasm()
    : await fetch(wasmUrl).then(async (response) => {
      if (!response.ok) throw new Error(`Physikdatei konnte nicht geladen werden: HTTP ${response.status}`);
      return response.arrayBuffer();
    });
  const Ammo = await AmmoFactory({
    wasmBinary,
    locateFile: (file) => file.endsWith('.wasm') ? wasmUrl : file,
  });

  const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
  const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
  const broadphase = new Ammo.btDbvtBroadphase();
  const solver = new Ammo.btSequentialImpulseConstraintSolver();
  const world = new Ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, collisionConfiguration);
  const gravity = new THREE.Vector3(0, -9.81, 0);
  const gravityVector = new Ammo.btVector3(gravity.x, gravity.y, gravity.z);
  world.setGravity(gravityVector);
  Ammo.destroy(gravityVector);
  world.getSolverInfo().m_numIterations = 12;

  const bodies = new Map();
  const bodyList = [];
  const springs = [];
  const constraints = [];
  const activeForces = new Map();
  const activeTorques = new Map();
  const transform = new Ammo.btTransform();
  const zeroVector = new Ammo.btVector3(0, 0, 0);
  let accumulator = 0;
  let elapsedTime = 0;
  let contactCount = 0;

  function makeVector(vector) {
    return new Ammo.btVector3(vector.x, vector.y, vector.z);
  }

  function readVector(vector) {
    return new THREE.Vector3(vector.x(), vector.y(), vector.z());
  }

  function worldTransformFor(mesh) {
    mesh.updateWorldMatrix(true, false);
    const position = mesh.getWorldPosition(new THREE.Vector3());
    const rotation = mesh.getWorldQuaternion(new THREE.Quaternion());
    const scale = mesh.getWorldScale(new THREE.Vector3());
    return { position, rotation, scale };
  }

  function getShape(mesh, requestedShape, mass, scale) {
    const geometry = mesh.geometry;
    const parameters = geometry.parameters || {};
    const shapeName = requestedShape === 'auto' ? geometry.type.toLowerCase().replace('geometry', '') : requestedShape;
    let shape;
    let dimensions;

    if (shapeName === 'box') {
      dimensions = new THREE.Vector3(
        (parameters.width || 1) * scale.x,
        (parameters.height || 1) * scale.y,
        (parameters.depth || 1) * scale.z
      );
      const halfExtents = makeVector(dimensions.clone().multiplyScalar(0.5));
      shape = new Ammo.btBoxShape(halfExtents);
      Ammo.destroy(halfExtents);
    } else if (shapeName === 'sphere') {
      if (Math.max(scale.x, scale.y, scale.z) - Math.min(scale.x, scale.y, scale.z) > 1e-5) {
        throw new Error('Kugeln benötigen eine gleichmäßige Skalierung, damit die Kollisionsform physikalisch stimmt.');
      }
      const radius = (parameters.radius || 0.5) * scale.x;
      dimensions = new THREE.Vector3(radius * 2, radius * 2, radius * 2);
      shape = new Ammo.btSphereShape(radius);
    } else if (shapeName === 'cylinder') {
      if (Math.abs((parameters.radiusTop || 0) - (parameters.radiusBottom || 0)) > 1e-5) {
        throw new Error('Zylinder müssen oben und unten denselben Radius haben.');
      }
      if (Math.abs(scale.x - scale.z) > 1e-5) {
        throw new Error('Zylinder benötigen dieselbe Skalierung auf X und Z.');
      }
      const radius = (parameters.radiusTop || 0.5) * Math.max(scale.x, scale.z);
      const height = (parameters.height || 1) * scale.y;
      dimensions = new THREE.Vector3(radius * 2, height, radius * 2);
      const halfExtents = makeVector(new THREE.Vector3(radius, height / 2, radius));
      shape = new Ammo.btCylinderShape(halfExtents);
      Ammo.destroy(halfExtents);
    } else if (shapeName === 'capsule') {
      if (Math.abs(scale.x - scale.z) > 1e-5 || Math.abs(scale.x - scale.y) > 1e-5) {
        throw new Error('Kapseln benötigen eine gleichmäßige Skalierung, damit die Kollisionsform physikalisch stimmt.');
      }
      const radius = (parameters.radius || 0.5) * scale.x;
      const height = (parameters.length || 1) * scale.y;
      dimensions = new THREE.Vector3(radius * 2, height + radius * 2, radius * 2);
      shape = new Ammo.btCapsuleShape(radius, height);
    } else {
      throw new Error(`Physik unterstützt Box, Kugel, Zylinder und Kapsel; "${shapeName}" wird nicht unterstützt.`);
    }

    const inertia = new THREE.Vector3();
    if (mass > 0) {
      if (shapeName === 'box') {
        inertia.set(
          mass * (dimensions.y ** 2 + dimensions.z ** 2) / 12,
          mass * (dimensions.x ** 2 + dimensions.z ** 2) / 12,
          mass * (dimensions.x ** 2 + dimensions.y ** 2) / 12
        );
      } else if (shapeName === 'sphere') {
        inertia.setScalar(0.4 * mass * (dimensions.x / 2) ** 2);
      } else if (shapeName === 'cylinder') {
        const radius = dimensions.x / 2;
        inertia.set(
          mass * (3 * radius ** 2 + dimensions.y ** 2) / 12,
          mass * radius ** 2 / 2,
          mass * (3 * radius ** 2 + dimensions.y ** 2) / 12
        );
      } else if (shapeName === 'capsule') {
        const radius = dimensions.x / 2;
        const cylinderHeight = Math.max(dimensions.y - dimensions.x, 0);
        const cylinderMass = mass * cylinderHeight / (cylinderHeight + 4 * radius / 3);
        const sphereMass = mass - cylinderMass;
        const axial = cylinderMass * radius ** 2 / 2 + 0.4 * sphereMass * radius ** 2;
        const transverse = cylinderMass * (3 * radius ** 2 + cylinderHeight ** 2) / 12 +
          sphereMass * (0.4 * radius ** 2 + (cylinderHeight / 2) ** 2);
        inertia.set(transverse, axial, transverse);
      }
    }
    return { shape, dimensions, inertia, shapeName };
  }

  function syncMesh(entry) {
    entry.mesh.updateWorldMatrix(true, false);
    entry.motionState.getWorldTransform(transform);
    const origin = transform.getOrigin();
    const rotation = transform.getRotation();
    const position = new THREE.Vector3(origin.x(), origin.y(), origin.z());
    const quaternion = new THREE.Quaternion(rotation.x(), rotation.y(), rotation.z(), rotation.w());
    entry.syncedPosition.copy(position);
    entry.syncedRotation.copy(quaternion);
    if (entry.mesh.parent) {
      entry.mesh.parent.updateWorldMatrix(true, false);
      entry.mesh.parent.worldToLocal(position);
      const parentRotation = entry.mesh.parent.getWorldQuaternion(new THREE.Quaternion());
      quaternion.premultiply(parentRotation.invert());
    }
    entry.mesh.position.copy(position);
    entry.mesh.quaternion.copy(quaternion);
  }

  function getEntry(mesh) {
    const entry = bodies.get(mesh);
    if (!entry) throw new Error('Dieses Mesh ist nicht bei der Physik registriert. Zuerst physics.add(mesh, ...) aufrufen.');
    return entry;
  }

  function setGravity(vector) {
    if (![vector.x, vector.y, vector.z].every(Number.isFinite)) {
      throw new TypeError('Die Schwerkraft muss aus drei endlichen Zahlen bestehen.');
    }
    gravity.copy(vector);
    const value = makeVector(gravity);
    world.setGravity(value);
    Ammo.destroy(value);
  }

  function add(mesh, options = {}) {
    if (!mesh || !mesh.isMesh || !mesh.geometry) {
      throw new TypeError('physics.add erwartet ein THREE.Mesh mit Geometrie.');
    }
    if (bodies.has(mesh)) throw new Error('Dieses Mesh ist bereits bei der Physik registriert.');

    const mass = options.mass === undefined ? 1 : Number(options.mass);
    if (!Number.isFinite(mass) || mass < 0) throw new RangeError('Die Masse muss eine endliche Zahl >= 0 kg sein.');
    const friction = options.friction === undefined ? 0.6 : Number(options.friction);
    const restitution = options.restitution === undefined ? 0.05 : Number(options.restitution);
    const linearDamping = options.linearDamping === undefined ? 0.01 : Number(options.linearDamping);
    const angularDamping = options.angularDamping === undefined ? 0.05 : Number(options.angularDamping);
    for (const [label, value] of Object.entries({ friction, restitution, linearDamping, angularDamping })) {
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError(`${label} muss zwischen 0 und 1 liegen.`);
      }
    }

    const { position, rotation, scale } = worldTransformFor(mesh);
    if (scale.x <= 0 || scale.y <= 0 || scale.z <= 0) {
      throw new RangeError('Physikkörper benötigen positive Skalierungswerte.');
    }
    const initialVelocity = options.velocity || zeroThreeVector;
    const initialAngularVelocity = options.angularVelocity || zeroThreeVector;
    if (![initialVelocity.x, initialVelocity.y, initialVelocity.z,
      initialAngularVelocity.x, initialAngularVelocity.y, initialAngularVelocity.z].every(Number.isFinite)) {
      throw new TypeError('Anfangsgeschwindigkeiten müssen endliche THREE.Vector3-Werte sein.');
    }
    const { shape, dimensions, inertia: physicalInertia, shapeName } =
      getShape(mesh, options.shape || 'auto', mass, scale);
    const origin = makeVector(position);
    const quaternion = new Ammo.btQuaternion(rotation.x, rotation.y, rotation.z, rotation.w);
    transform.setIdentity();
    transform.setOrigin(origin);
    transform.setRotation(quaternion);
    const motionState = new Ammo.btDefaultMotionState(transform);
    const localInertia = makeVector(physicalInertia);
    const constructionInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
    const body = new Ammo.btRigidBody(constructionInfo);
    body.setFriction(friction);
    body.setRestitution(restitution);
    body.setDamping(linearDamping, angularDamping);

    const velocity = makeVector(initialVelocity);
    const angularVelocity = makeVector(initialAngularVelocity);
    body.setLinearVelocity(velocity);
    body.setAngularVelocity(angularVelocity);
    world.addRigidBody(body);

    const entry = {
      mesh,
      body,
      motionState,
      shape,
      mass,
      name: String(options.name || mesh.name || `Objekt ${bodyList.length + 1}`),
      shapeName,
      dimensions,
      inertia: physicalInertia,
      initialPosition: position.clone(),
      initialRotation: rotation.clone(),
      syncedPosition: position.clone(),
      syncedRotation: rotation.clone(),
      animationDrive: options.animationDrive !== false,
      animationTarget: null,
      previousAnimationTarget: null,
    };
    bodies.set(mesh, entry);
    bodyList.push(entry);

    Ammo.destroy(origin);
    Ammo.destroy(quaternion);
    Ammo.destroy(localInertia);
    Ammo.destroy(constructionInfo);
    Ammo.destroy(velocity);
    Ammo.destroy(angularVelocity);
    return mesh;
  }

  function applyForceNow(entry, force, point) {
    if (entry.mass === 0) throw new Error('Auf statische Körper kann keine Kraft angewendet werden.');
    const value = makeVector(force);
    if (point) {
      const relativePoint = makeVector(point);
      entry.body.applyForce(value, relativePoint);
      Ammo.destroy(relativePoint);
    } else {
      entry.body.applyCentralForce(value);
    }
    entry.body.activate();
    Ammo.destroy(value);
  }

  function captureAnimationTargets(deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new RangeError('Die Animationszeit muss eine endliche Zahl > 0 sein.');
    }

    for (const entry of bodyList) {
      entry.animationTarget = null;
      if (!entry.animationDrive || entry.mass === 0) continue;

      const { position, rotation } = worldTransformFor(entry.mesh);
      const positionDelta = position.clone().sub(entry.syncedPosition);
      const drivePosition = new THREE.Vector3(
        Math.abs(positionDelta.x) > 1e-5 ? 1 : 0,
        Math.abs(positionDelta.y) > 1e-5 ? 1 : 0,
        Math.abs(positionDelta.z) > 1e-5 ? 1 : 0
      );
      const positionChanged = drivePosition.lengthSq() > 0;
      const rotationChanged = 1 - Math.abs(rotation.dot(entry.syncedRotation)) > 1e-10;
      if (!positionChanged && !rotationChanged) {
        entry.previousAnimationTarget = null;
        continue;
      }

      const previous = entry.previousAnimationTarget || {
        position: entry.syncedPosition,
        rotation: entry.syncedRotation,
      };
      const target = {
        position,
        rotation,
        drivePosition,
        driveRotation: rotationChanged,
        linearVelocity: position.clone().sub(previous.position).divideScalar(deltaSeconds),
        angularVelocity: new THREE.Vector3(),
      };
      const rotationDelta = rotation.clone().multiply(previous.rotation.clone().invert()).normalize();
      if (rotationDelta.w < 0) {
        rotationDelta.set(-rotationDelta.x, -rotationDelta.y, -rotationDelta.z, -rotationDelta.w);
      }
      const sinHalfAngle = Math.hypot(rotationDelta.x, rotationDelta.y, rotationDelta.z);
      if (sinHalfAngle > 1e-8) {
        const angle = 2 * Math.atan2(sinHalfAngle, rotationDelta.w);
        target.angularVelocity.set(rotationDelta.x, rotationDelta.y, rotationDelta.z)
          .multiplyScalar(angle / (sinHalfAngle * deltaSeconds));
      }
      entry.animationTarget = target;
      entry.previousAnimationTarget = { position: position.clone(), rotation: rotation.clone() };
    }
  }

  function clearAnimationTargets() {
    for (const entry of bodyList) {
      entry.animationTarget = null;
      entry.previousAnimationTarget = null;
    }
  }

  function syncBodies() {
    for (const entry of bodyList) syncMesh(entry);
  }

  function applyAnimationDrive(entry) {
    const target = entry.animationTarget;
    if (!target || entry.mass === 0) return;

    const frequency = ANIMATION_DRIVE_FREQUENCY;
    if (target.drivePosition.lengthSq() > 0) {
      const velocity = readVector(entry.body.getLinearVelocity());
      const acceleration = target.position.clone().sub(entry.syncedPosition).multiplyScalar(frequency ** 2)
        .add(target.linearVelocity.clone().sub(velocity).multiplyScalar(2 * frequency))
        .multiply(target.drivePosition)
        .clampLength(0, MAX_ANIMATION_ACCELERATION);
      applyForceNow(entry, acceleration.multiplyScalar(entry.mass));
    }

    if (target.driveRotation) {
      const rotationError = target.rotation.clone().multiply(entry.syncedRotation.clone().invert()).normalize();
      if (rotationError.w < 0) {
        rotationError.set(-rotationError.x, -rotationError.y, -rotationError.z, -rotationError.w);
      }
      const sinHalfAngle = Math.hypot(rotationError.x, rotationError.y, rotationError.z);
      const angularError = new THREE.Vector3();
      if (sinHalfAngle > 1e-8) {
        angularError.set(rotationError.x, rotationError.y, rotationError.z)
          .multiplyScalar(2 * Math.atan2(sinHalfAngle, rotationError.w) / sinHalfAngle);
      }
      const angularVelocity = readVector(entry.body.getAngularVelocity());
      const angularAcceleration = angularError.multiplyScalar(frequency ** 2)
        .add(target.angularVelocity.clone().sub(angularVelocity).multiplyScalar(2 * frequency))
        .clampLength(0, MAX_ANIMATION_ANGULAR_ACCELERATION);
      const localAcceleration = angularAcceleration.applyQuaternion(entry.syncedRotation.clone().invert());
      const torque = localAcceleration.multiply(entry.inertia).applyQuaternion(entry.syncedRotation);
      const torqueValue = makeVector(torque);
      entry.body.applyTorque(torqueValue);
      entry.body.activate();
      Ammo.destroy(torqueValue);
    }
  }

  function applyForce(mesh, force, point) {
    const entry = getEntry(mesh);
    if (entry.mass === 0) throw new Error('Auf statische Körper kann keine Kraft angewendet werden.');
    activeForces.set(mesh, {
      force: force.clone(),
      point: point ? point.clone() : null,
    });
  }

  function clearForce(mesh) {
    getEntry(mesh);
    activeForces.delete(mesh);
  }

  function applyImpulse(mesh, impulse, point) {
    const entry = getEntry(mesh);
    if (entry.mass === 0) throw new Error('Auf statische Körper kann kein Impuls angewendet werden.');
    const value = makeVector(impulse);
    if (point) {
      const relativePoint = makeVector(point);
      entry.body.applyImpulse(value, relativePoint);
      Ammo.destroy(relativePoint);
    } else {
      entry.body.applyCentralImpulse(value);
    }
    entry.body.activate();
    Ammo.destroy(value);
  }

  function applyTorque(mesh, torque) {
    const entry = getEntry(mesh);
    if (entry.mass === 0) throw new Error('Auf statische Körper kann kein Drehmoment angewendet werden.');
    activeTorques.set(mesh, torque.clone());
  }

  function clearTorque(mesh) {
    getEntry(mesh);
    activeTorques.delete(mesh);
  }

  function addSpring(meshA, meshB, options = {}) {
    const entryA = getEntry(meshA);
    const entryB = meshB ? getEntry(meshB) : null;
    if (entryA.mass === 0 && (!entryB || entryB.mass === 0)) {
      throw new Error('Eine Feder braucht mindestens einen beweglichen Körper.');
    }
    if (!entryB && !options.anchor) {
      throw new Error('Für eine Feder mit einem Körper muss options.anchor als THREE.Vector3 angegeben werden.');
    }

    const restLength = Number(options.restLength);
    const stiffness = Number(options.stiffness);
    const damping = options.damping === undefined ? 0 : Number(options.damping);
    if (!Number.isFinite(restLength) || restLength < 0 ||
        !Number.isFinite(stiffness) || stiffness <= 0 ||
        !Number.isFinite(damping) || damping < 0) {
      throw new RangeError('Federwerte benötigen restLength >= 0, stiffness > 0 und damping >= 0.');
    }
    springs.push({
      entryA,
      entryB,
      anchor: options.anchor ? options.anchor.clone() : null,
      restLength,
      stiffness,
      damping,
      name: String(options.name || 'Feder'),
    });
  }

  function addPendulum(mesh, options = {}) {
    const entry = getEntry(mesh);
    if (entry.mass === 0) throw new Error('Ein Pendel muss eine positive Masse haben.');

    const worldPosition = mesh.getWorldPosition(new THREE.Vector3());
    const pivotWorld = options.pivot ? options.pivot.clone() : worldPosition.clone().add(
      new THREE.Vector3(0, entry.dimensions.y * 0.5, 0).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()))
    );
    const pivotLocal = options.pivotLocal
      ? options.pivotLocal.clone()
      : pivotWorld.clone().sub(worldPosition).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()).invert());
    const pivot = makeVector(pivotLocal);
    const constraint = new Ammo.btPoint2PointConstraint(entry.body, pivot);
    world.addConstraint(constraint, true);
    constraints.push(constraint);
    Ammo.destroy(pivot);
    entry.body.activate();
  }

  function springForce(spring) {
    const positionA = spring.entryA.mesh.getWorldPosition(new THREE.Vector3());
    const velocityA = readVector(spring.entryA.body.getLinearVelocity());
    const positionB = spring.entryB
      ? spring.entryB.mesh.getWorldPosition(new THREE.Vector3())
      : spring.anchor;
    const velocityB = spring.entryB ? readVector(spring.entryB.body.getLinearVelocity()) : zeroThreeVector;
    const delta = positionB.clone().sub(positionA);
    const distance = delta.length();
    if (distance > 1e-8) {
      const direction = delta.multiplyScalar(1 / distance);
      const extension = distance - spring.restLength;
      const relativeSpeed = velocityB.clone().sub(velocityA).dot(direction);
      const magnitude = spring.stiffness * extension + spring.damping * relativeSpeed;
      const force = direction.multiplyScalar(magnitude);
      if (spring.entryA.mass > 0) applyForceNow(spring.entryA, force);
      if (spring.entryB && spring.entryB.mass > 0) applyForceNow(spring.entryB, force.negate());
    }
  }

  const zeroThreeVector = new THREE.Vector3();

  function stepFixed() {
    for (const entry of bodyList) applyAnimationDrive(entry);
    for (const [mesh, value] of activeForces) {
      applyForceNow(getEntry(mesh), value.force, value.point);
    }
    for (const [mesh, torque] of activeTorques) {
      const entry = getEntry(mesh);
      const value = makeVector(torque);
      entry.body.applyTorque(value);
      entry.body.activate();
      Ammo.destroy(value);
    }
    for (const spring of springs) springForce(spring);
    world.stepSimulation(FIXED_STEP, 0, FIXED_STEP);
    elapsedTime += FIXED_STEP;
    for (const entry of bodyList) syncMesh(entry);
  }

  function advance(deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new RangeError('Die Simulationszeit muss eine endliche Zahl >= 0 sein.');
    }
    accumulator = Math.min(accumulator + deltaSeconds, MAX_FRAME_DELTA);
    while (accumulator >= FIXED_STEP) {
      stepFixed();
      accumulator -= FIXED_STEP;
    }
  }

  function stepOnce() {
    accumulator = 0;
    stepFixed();
  }

  function reset() {
    for (const constraint of constraints) {
      world.removeConstraint(constraint);
      Ammo.destroy(constraint);
    }
    constraints.length = 0;
    springs.length = 0;
    activeForces.clear();
    activeTorques.clear();
    for (const entry of bodyList) {
      world.removeRigidBody(entry.body);
      Ammo.destroy(entry.body);
      Ammo.destroy(entry.motionState);
      Ammo.destroy(entry.shape);
    }
    bodyList.length = 0;
    bodies.clear();
    elapsedTime = 0;
    accumulator = 0;
    contactCount = 0;
  }

  function resetBodies() {
    for (const entry of bodyList) {
      entry.animationTarget = null;
      entry.previousAnimationTarget = null;
      transform.setIdentity();
      const position = makeVector(entry.initialPosition);
      const rotation = new Ammo.btQuaternion(
        entry.initialRotation.x, entry.initialRotation.y, entry.initialRotation.z, entry.initialRotation.w
      );
      transform.setOrigin(position);
      transform.setRotation(rotation);
      entry.body.setWorldTransform(transform);
      entry.motionState.setWorldTransform(transform);
      entry.body.setLinearVelocity(zeroVector);
      entry.body.setAngularVelocity(zeroVector);
      entry.body.clearForces();
      entry.body.activate();
      world.updateSingleAabb(entry.body);
      syncMesh(entry);
      Ammo.destroy(position);
      Ammo.destroy(rotation);
    }
    elapsedTime = 0;
    accumulator = 0;
    contactCount = 0;
  }

  function snapshot() {
    let kineticEnergy = 0;
    let potentialEnergy = 0;
    let springEnergy = 0;
    const objects = [];

    for (const entry of bodyList) {
      if (entry.mass === 0) continue;
      const position = entry.mesh.getWorldPosition(new THREE.Vector3());
      const velocity = readVector(entry.body.getLinearVelocity());
      const angularVelocity = readVector(entry.body.getAngularVelocity());
      const translationalEnergy = 0.5 * entry.mass * velocity.lengthSq();
      const potential = -entry.mass * gravity.dot(position);

      const rotation = entry.mesh.getWorldQuaternion(new THREE.Quaternion());
      const angularLocal = angularVelocity.applyQuaternion(rotation.invert());
      const rotationalEnergy = 0.5 * (
        entry.inertia.x * angularLocal.x ** 2 +
        entry.inertia.y * angularLocal.y ** 2 +
        entry.inertia.z * angularLocal.z ** 2
      );
      const kinetic = translationalEnergy + rotationalEnergy;
      kineticEnergy += kinetic;
      potentialEnergy += potential;
      objects.push({
        name: entry.name,
        shape: entry.shapeName,
        mass: entry.mass,
        position,
        speed: velocity.length(),
        angularSpeed: angularVelocity.length(),
        kineticEnergy: kinetic,
        potentialEnergy: potential,
      });
    }

    const dispatcherRef = world.getDispatcher();
    contactCount = 0;
    for (let index = 0; index < dispatcherRef.getNumManifolds(); index++) {
      const manifold = dispatcherRef.getManifoldByIndexInternal(index);
      contactCount += manifold.getNumContacts();
    }
    for (const spring of springs) {
      const positionA = spring.entryA.mesh.getWorldPosition(new THREE.Vector3());
      const positionB = spring.entryB
        ? spring.entryB.mesh.getWorldPosition(new THREE.Vector3())
        : spring.anchor;
      const extension = positionB.distanceTo(positionA) - spring.restLength;
      springEnergy += 0.5 * spring.stiffness * extension ** 2;
    }

    return {
      time: elapsedTime,
      bodyCount: bodyList.length,
      dynamicBodyCount: objects.length,
      contactCount,
      kineticEnergy,
      potentialEnergy,
      springEnergy,
      totalEnergy: kineticEnergy + potentialEnergy + springEnergy,
      gravity: gravity.clone(),
      objects,
    };
  }

  return {
    add,
    captureAnimationTargets,
    clearAnimationTargets,
    syncBodies,
    addSpring,
    addPendulum,
    applyForce,
    clearForce,
    applyImpulse,
    applyTorque,
    clearTorque,
    setGravity,
    getGravity: () => gravity.clone(),
    advance,
    stepOnce,
    reset,
    resetBodies,
    snapshot,
  };
}
