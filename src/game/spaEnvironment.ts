import * as THREE from 'three';
import { ProceduralTexturePack } from './textures';

export const ARENA_HALF_W = 108;
export const ARENA_HALF_D = 84;
export const ARENA_EAVE_H = 68.0;
export const ARENA_PEAK_H = 104.0;

export const MAIN_POOL = {
  minX: -30,
  maxX: 30,
  minZ: -32,
  maxZ: 2,
  waterY: -0.22,
  floorY: -2.2,
};

export interface JacuzziDef {
  x: number;
  z: number;
  radius: number;
  waterY: number;
  floorY: number;
}

export const JACUZZIS: JacuzziDef[] = [
  { x: -20, z: 34, radius: 7.4, waterY: -0.18, floorY: -1.35 },
  { x: 20, z: 34, radius: 7.4, waterY: -0.18, floorY: -1.35 },
];

export interface BoxObstacle {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface SpaEnvironmentHandle {
  group: THREE.Group;
  obstacles: BoxObstacle[];
  update: (elapsed: number, dt: number) => void;
}

export function isPointInWater(x: number, z: number): 'main' | 'jacuzzi' | null {
  if (
    x >= MAIN_POOL.minX &&
    x <= MAIN_POOL.maxX &&
    z >= MAIN_POOL.minZ &&
    z <= MAIN_POOL.maxZ
  ) {
    return 'main';
  }
  for (const jac of JACUZZIS) {
    const dx = x - jac.x;
    const dz = z - jac.z;
    if (dx * dx + dz * dz <= jac.radius * jac.radius) {
      return 'jacuzzi';
    }
  }
  return null;
}

export function getWaterSurfaceY(x: number, z: number): number | null {
  const kind = isPointInWater(x, z);
  if (kind === 'main') return MAIN_POOL.waterY;
  if (kind === 'jacuzzi') return JACUZZIS[0].waterY;
  return null;
}

export function getDeckSurfaceY(x: number, z: number): number {
  const water = isPointInWater(x, z);
  if (water === 'main') return MAIN_POOL.waterY - 0.55;
  if (water === 'jacuzzi') return JACUZZIS[0].waterY - 0.45;
  return 0;
}

export function getRoofCeilingAt(x: number): number {
  const t = Math.min(1, Math.abs(x) / ARENA_HALF_W);
  return THREE.MathUtils.lerp(ARENA_PEAK_H - 1.8, ARENA_EAVE_H - 1.2, t);
}

export function buildSpaEnvironment(
  textures: ProceduralTexturePack,
  isSoftwareGl: boolean,
): SpaEnvironmentHandle {
  const group = new THREE.Group();
  const obstacles: BoxObstacle[] = [];

  const brickMat = new THREE.MeshStandardMaterial({
    map: textures.brickDeck,
    roughness: 0.42,
    metalness: 0.04,
  });

  const woodMat = new THREE.MeshStandardMaterial({
    map: textures.honeyWood,
    roughness: 0.68,
    metalness: 0.03,
  });

  const beamMat = new THREE.MeshStandardMaterial({
    color: 0xb97434,
    roughness: 0.72,
    metalness: 0.02,
  });

  const poolTileMat = new THREE.MeshStandardMaterial({
    map: textures.poolTile,
    roughness: 0.28,
    metalness: 0.05,
  });

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x7b746c,
    roughness: 0.88,
    metalness: 0.04,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xaad4f5,
    transparent: true,
    opacity: isSoftwareGl ? 0.22 : 0.18,
    roughness: 0.08,
    metalness: 0.05,
    reflectivity: 0.9,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // -------------------------------------------------------
  // 1. BRICK SPA DECK (4 slabs framing the central pool)
  // -------------------------------------------------------
  const addDeckSlab = (minX: number, maxX: number, minZ: number, maxZ: number) => {
    const w = maxX - minX;
    const d = maxZ - minZ;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), brickMat);
    mesh.position.set((minX + maxX) * 0.5, -0.25, (minZ + maxZ) * 0.5);
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  addDeckSlab(-ARENA_HALF_W, ARENA_HALF_W, -ARENA_HALF_D, MAIN_POOL.minZ);
  addDeckSlab(-ARENA_HALF_W, MAIN_POOL.minX, MAIN_POOL.minZ, MAIN_POOL.maxZ);
  addDeckSlab(MAIN_POOL.maxX, ARENA_HALF_W, MAIN_POOL.minZ, MAIN_POOL.maxZ);
  addDeckSlab(-ARENA_HALF_W, ARENA_HALF_W, MAIN_POOL.maxZ, ARENA_HALF_D);

  const poolCenterZ = (MAIN_POOL.minZ + MAIN_POOL.maxZ) * 0.5;
  const poolWidth = MAIN_POOL.maxX - MAIN_POOL.minX;
  const poolLength = MAIN_POOL.maxZ - MAIN_POOL.minZ;

  // Pool coping border rim
  const copingMat = new THREE.MeshStandardMaterial({
    color: 0xd9c2a3,
    roughness: 0.45,
  });
  const addCoping = (w: number, d: number, x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), copingMat);
    m.position.set(x, 0.03, z);
    m.receiveShadow = true;
    group.add(m);
  };
  addCoping(poolWidth + 1.3, 0.7, 0, MAIN_POOL.minZ - 0.35);
  addCoping(poolWidth + 1.3, 0.7, 0, MAIN_POOL.maxZ + 0.35);
  addCoping(0.7, poolLength + 0.7, MAIN_POOL.minX - 0.35, poolCenterZ);
  addCoping(0.7, poolLength + 0.7, MAIN_POOL.maxX + 0.35, poolCenterZ);

  // -------------------------------------------------------
  // 2. MAIN SWIMMING POOL BASIN & ANIMATED WATER SHADER
  // -------------------------------------------------------
  const poolFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(poolWidth + 0.2, poolLength + 0.2),
    poolTileMat,
  );
  poolFloor.rotation.x = -Math.PI / 2;
  poolFloor.position.set(0, MAIN_POOL.floorY, poolCenterZ);
  poolFloor.receiveShadow = true;
  group.add(poolFloor);

  const wallHeight = Math.abs(MAIN_POOL.floorY);
  const addPoolWall = (w: number, d: number, x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallHeight, d), poolTileMat);
    m.position.set(x, MAIN_POOL.floorY * 0.5, z);
    group.add(m);
  };
  addPoolWall(poolWidth + 0.2, 0.3, 0, MAIN_POOL.minZ);
  addPoolWall(poolWidth + 0.2, 0.3, 0, MAIN_POOL.maxZ);
  addPoolWall(0.3, poolLength + 0.2, MAIN_POOL.minX, poolCenterZ);
  addPoolWall(0.3, poolLength + 0.2, MAIN_POOL.maxX, poolCenterZ);

  // Underwater glowing cyan LED strips along pool walls
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x38e4ff });
  const ledNorth = new THREE.Mesh(new THREE.BoxGeometry(poolWidth - 0.6, 0.18, 0.08), ledMat);
  ledNorth.position.set(0, -0.55, MAIN_POOL.minZ + 0.18);
  const ledSouth = new THREE.Mesh(new THREE.BoxGeometry(poolWidth - 0.6, 0.18, 0.08), ledMat);
  ledSouth.position.set(0, -0.55, MAIN_POOL.maxZ - 0.18);
  group.add(ledNorth, ledSouth);

  const waterUniforms = { uTime: { value: 0 } };
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x1ba8f0,
    emissive: 0x094d80,
    emissiveIntensity: 0.48,
    roughness: 0.12,
    metalness: 0.05,
    clearcoat: 0.9,
    clearcoatRoughness: 0.1,
    transparent: true,
    opacity: 0.78,
  });
  waterMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterUniforms.uTime;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       uniform float uTime;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float wave = sin(position.x * 0.45 + uTime * 2.1) * 0.06
                  + cos(position.y * 0.55 - uTime * 1.7) * 0.06;
       transformed.z += wave;`,
    );
  };

  const poolWaterGeo = new THREE.PlaneGeometry(poolWidth - 0.2, poolLength - 0.2, 56, 32);
  const poolWater = new THREE.Mesh(poolWaterGeo, waterMat);
  poolWater.rotation.x = -Math.PI / 2;
  poolWater.position.set(0, MAIN_POOL.waterY, poolCenterZ);
  group.add(poolWater);

  // -------------------------------------------------------
  // 3. CENTERPIECE POOL FOUNTAIN & WATER ARCS
  // -------------------------------------------------------
  const fountainGroup = new THREE.Group();
  fountainGroup.position.set(0, MAIN_POOL.floorY, poolCenterZ);

  const basePedestal = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.3, 2.3, 14), stoneMat);
  basePedestal.position.y = 1.15;
  basePedestal.castShadow = true;
  basePedestal.receiveShadow = true;
  fountainGroup.add(basePedestal);

  const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 1.8, 0.7, 14), copingMat);
  basin.position.y = 2.5;
  fountainGroup.add(basin);

  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.05, 1.8, 12), stoneMat);
  spire.position.y = 3.45;
  fountainGroup.add(spire);

  const jetMat = new THREE.MeshBasicMaterial({
    color: 0xbef2ff,
    transparent: true,
    opacity: 0.7,
  });
  const fountainJets: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI * 2) / 8;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a) * 0.6, 4.1, Math.sin(a) * 0.6),
      new THREE.Vector3(Math.cos(a) * 2.4, 5.2, Math.sin(a) * 2.4),
      new THREE.Vector3(Math.cos(a) * 4.2, 2.1, Math.sin(a) * 4.2),
    ]);
    const jet = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.09, 6, false), jetMat);
    fountainJets.push(jet);
    fountainGroup.add(jet);
  }
  group.add(fountainGroup);
  obstacles.push({
    minX: -3.5,
    maxX: 3.5,
    minY: -1,
    maxY: 3.0,
    minZ: poolCenterZ - 3.5,
    maxZ: poolCenterZ + 3.5,
  });

  // -------------------------------------------------------
  // 4. TWO FOREGROUND CIRCULAR JACUZZIS (внизу слева и справа)
  // -------------------------------------------------------
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.18,
    metalness: 0.92,
  });

  const jacuzziBubbleRings: THREE.Mesh[] = [];
  JACUZZIS.forEach((jac) => {
    const jacGroup = new THREE.Group();
    jacGroup.position.set(jac.x, 0, jac.z);

    const jacRim = new THREE.Mesh(
      new THREE.TorusGeometry(jac.radius, 0.48, 12, 40),
      copingMat,
    );
    jacRim.rotation.x = Math.PI / 2;
    jacRim.position.y = 0.16;
    jacRim.receiveShadow = true;
    jacGroup.add(jacRim);

    const jacWater = new THREE.Mesh(
      new THREE.CircleGeometry(jac.radius - 0.15, 36),
      waterMat,
    );
    jacWater.rotation.x = -Math.PI / 2;
    jacWater.position.y = 0.07;
    jacGroup.add(jacWater);

    const jacGlowRing = new THREE.Mesh(
      new THREE.RingGeometry(jac.radius - 0.9, jac.radius - 0.4, 36),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide }),
    );
    jacGlowRing.rotation.x = -Math.PI / 2;
    jacGlowRing.position.y = 0.03;
    jacGroup.add(jacGlowRing);

    // Animated inner bubble ring
    const bubbleRing = new THREE.Mesh(
      new THREE.RingGeometry(jac.radius * 0.42, jac.radius * 0.56, 28),
      new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
      }),
    );
    bubbleRing.rotation.x = -Math.PI / 2;
    bubbleRing.position.y = 0.1;
    jacGroup.add(bubbleRing);
    jacuzziBubbleRings.push(bubbleRing);

    // Stainless handrail into jacuzzi
    for (const side of [-0.3, 0.3]) {
      const railCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side, -0.4, jac.radius - 0.4),
        new THREE.Vector3(side, 0.9, jac.radius - 0.2),
        new THREE.Vector3(side, 1.0, jac.radius + 0.35),
        new THREE.Vector3(side, 0, jac.radius + 0.55),
      ]);
      jacGroup.add(new THREE.Mesh(new THREE.TubeGeometry(railCurve, 12, 0.045, 8, false), chromeMat));
    }

    group.add(jacGroup);
  });

  // Pool Ladders
  const addLadder = (x: number, z: number, rotY: number) => {
    const ladder = new THREE.Group();
    ladder.position.set(x, 0, z);
    ladder.rotation.y = rotY;
    for (const side of [-0.32, 0.32]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side, -1.2, 0.15),
        new THREE.Vector3(side, 0.95, 0.15),
        new THREE.Vector3(side, 1.1, -0.25),
        new THREE.Vector3(side, 0, -0.45),
      ]);
      ladder.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.045, 8, false), chromeMat));
    }
    group.add(ladder);
  };
  addLadder(-22, MAIN_POOL.maxZ + 0.15, 0);
  addLadder(22, MAIN_POOL.maxZ + 0.15, 0);
  addLadder(-22, MAIN_POOL.minZ - 0.15, Math.PI);
  addLadder(22, MAIN_POOL.minZ - 0.15, Math.PI);

  // -------------------------------------------------------
  // 5. MANY SUN LOUNGERS & SIDE TABLES (InstancedMesh!)
  // -------------------------------------------------------
  const loungerPositions: Array<{ x: number; z: number; rotY: number }> = [];

  // North & South rows along the main pool (14 each)
  for (let i = 0; i < 14; i++) {
    const lx = -26 + i * 4.0;
    loungerPositions.push({ x: lx, z: MAIN_POOL.minZ - 4.2, rotY: 0 });
    loungerPositions.push({ x: lx, z: MAIN_POOL.maxZ + 4.4, rotY: Math.PI });
  }
  // East & West rows along the main pool (8 each)
  for (let i = 0; i < 8; i++) {
    const lz = MAIN_POOL.minZ + 3 + i * 4.0;
    loungerPositions.push({ x: MAIN_POOL.maxX + 4.6, z: lz, rotY: -Math.PI / 2 });
    loungerPositions.push({ x: MAIN_POOL.minX - 4.6, z: lz, rotY: Math.PI / 2 });
  }
  // Extra sun loungers along the left panoramic glass promenade (12 loungers)
  for (let i = 0; i < 12; i++) {
    loungerPositions.push({ x: -84, z: -20 + i * 6.2, rotY: Math.PI / 2 });
  }
  // Extra sun loungers in the foreground flanking the two jacuzzis (12 loungers)
  for (let i = 0; i < 6; i++) {
    loungerPositions.push({ x: -50 + i * 3.8, z: 54, rotY: Math.PI });
    loungerPositions.push({ x: 31 + i * 3.8, z: 54, rotY: Math.PI });
  }
  // Center lounging island between the two jacuzzis (4 loungers)
  for (let i = 0; i < 4; i++) {
    loungerPositions.push({ x: -6 + i * 4.0, z: 34, rotY: i < 2 ? -Math.PI / 2 : Math.PI / 2 });
  }

  const loungerMat = new THREE.MeshStandardMaterial({
    color: 0xebe6db,
    roughness: 0.65,
  });
  const cushionMat = new THREE.MeshStandardMaterial({
    color: 0xfff8e7,
    roughness: 0.8,
  });
  const loungerBaseGeo = new THREE.BoxGeometry(1.18, 0.34, 2.4);
  const loungerBackGeo = new THREE.BoxGeometry(1.14, 0.16, 0.98);
  const tableGeo = new THREE.CylinderGeometry(0.36, 0.32, 0.44, 10);

  const baseInst = new THREE.InstancedMesh(loungerBaseGeo, loungerMat, loungerPositions.length);
  const backInst = new THREE.InstancedMesh(loungerBackGeo, cushionMat, loungerPositions.length);
  const tableCount = Math.floor(loungerPositions.length / 2);
  const tableInst = new THREE.InstancedMesh(tableGeo, beamMat, tableCount);

  baseInst.castShadow = true;
  baseInst.receiveShadow = true;
  backInst.castShadow = true;

  const dummy = new THREE.Object3D();
  loungerPositions.forEach((p, idx) => {
    dummy.position.set(p.x, 0.17, p.z);
    dummy.rotation.set(0, p.rotY, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    baseInst.setMatrixAt(idx, dummy.matrix);

    const backOffsetZ = -0.84 * Math.cos(p.rotY);
    const backOffsetX = -0.84 * Math.sin(p.rotY);
    dummy.position.set(p.x + backOffsetX, 0.56, p.z + backOffsetZ);
    dummy.rotation.set(0.45, p.rotY, 0);
    dummy.updateMatrix();
    backInst.setMatrixAt(idx, dummy.matrix);

    if (idx % 2 === 0 && idx / 2 < tableCount) {
      const sideX = Math.cos(p.rotY) * 1.35;
      const sideZ = -Math.sin(p.rotY) * 1.35;
      dummy.position.set(p.x + sideX, 0.22, p.z + sideZ);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      tableInst.setMatrixAt(idx / 2, dummy.matrix);
    }
  });
  baseInst.instanceMatrix.needsUpdate = true;
  backInst.instanceMatrix.needsUpdate = true;
  tableInst.instanceMatrix.needsUpdate = true;
  baseInst.computeBoundingSphere();
  backInst.computeBoundingSphere();
  tableInst.computeBoundingSphere();
  group.add(baseInst, backInst, tableInst);

  // -------------------------------------------------------
  // 6. THATCHED SAUNA PAVILION & ROCK GROTTO (Back-Left)
  // -------------------------------------------------------
  const saunaGroup = new THREE.Group();
  saunaGroup.position.set(-62, 0, -54);
  const stuccoMat = new THREE.MeshStandardMaterial({ color: 0xf0e9dc, roughness: 0.8 });
  const thatchMat = new THREE.MeshStandardMaterial({ color: 0xa6895b, roughness: 0.95 });
  const warmWinMat = new THREE.MeshStandardMaterial({
    color: 0xffe4a0,
    emissive: 0xffb347,
    emissiveIntensity: 0.8,
  });

  const saunaBody = new THREE.Mesh(new THREE.BoxGeometry(16, 5.2, 10), stuccoMat);
  saunaBody.position.y = 2.6;
  saunaBody.castShadow = true;
  saunaBody.receiveShadow = true;
  saunaGroup.add(saunaBody);

  const saunaRoof = new THREE.Mesh(new THREE.ConeGeometry(12.2, 4.0, 4), thatchMat);
  saunaRoof.rotation.y = Math.PI / 4;
  saunaRoof.position.y = 7.0;
  saunaRoof.castShadow = true;
  saunaGroup.add(saunaRoof);

  const win1 = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.8), warmWinMat);
  win1.position.set(-3.4, 2.8, 5.05);
  const win2 = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.8), warmWinMat);
  win2.position.set(3.4, 2.8, 5.05);
  saunaGroup.add(win1, win2);
  group.add(saunaGroup);

  obstacles.push({
    minX: -70.5,
    maxX: -53.5,
    minY: 0,
    maxY: 9.0,
    minZ: -59.5,
    maxZ: -48.5,
  });

  // Rock Grotto beside sauna
  const grottoGroup = new THREE.Group();
  grottoGroup.position.set(-86, 0, -52);
  const grottoRocks = [
    { x: -4.2, y: 2.8, z: 0, r: 4.4 },
    { x: 4.2, y: 2.8, z: 0, r: 4.0 },
    { x: 0, y: 6.0, z: -0.6, r: 4.6 },
    { x: -2.4, y: 4.6, z: 2.2, r: 2.8 },
    { x: 2.4, y: 4.6, z: 2.2, r: 2.8 },
  ];
  grottoRocks.forEach((rk) => {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rk.r, 1), stoneMat);
    rock.position.set(rk.x, rk.y, rk.z);
    rock.scale.set(1.1, 0.92, 1.15);
    rock.castShadow = true;
    grottoGroup.add(rock);
  });
  const grottoGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 4.4),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
  );
  grottoGlow.position.set(0, 2.2, -1.4);
  grottoGroup.add(grottoGlow);
  group.add(grottoGroup);

  // -------------------------------------------------------
  // 7. GRAND DOMED HAMMAM PAVILION (ХАМАМ - Back-Right!)
  // -------------------------------------------------------
  const hammamGroup = new THREE.Group();
  hammamGroup.position.set(64, 0, -48);
  hammamGroup.rotation.y = -0.35; // Angled welcomingly toward center pool

  const marbleMat = new THREE.MeshStandardMaterial({
    color: 0xf4eee4,
    roughness: 0.35,
    metalness: 0.05,
  });
  const sandstoneMat = new THREE.MeshStandardMaterial({
    color: 0xe6d3b3,
    roughness: 0.62,
  });
  const mosaicGoldMat = new THREE.MeshStandardMaterial({
    color: 0xd4a44a,
    roughness: 0.25,
    metalness: 0.65,
  });
  const turquoiseBandMat = new THREE.MeshStandardMaterial({
    color: 0x1d9ab8,
    roughness: 0.3,
    metalness: 0.15,
  });
  const hammamGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffd28a,
  });

  // Stepped marble plinth
  const hammamPlinth = new THREE.Mesh(new THREE.BoxGeometry(22, 0.45, 16), marbleMat);
  hammamPlinth.position.y = 0.22;
  hammamPlinth.receiveShadow = true;
  hammamGroup.add(hammamPlinth);

  // Main sandstone hall structure
  const hammamWalls = new THREE.Mesh(new THREE.BoxGeometry(19.5, 6.2, 13.5), sandstoneMat);
  hammamWalls.position.y = 3.55;
  hammamWalls.castShadow = true;
  hammamWalls.receiveShadow = true;
  hammamGroup.add(hammamWalls);

  // Decorative turquoise mosaic cornice frieze
  const frieze = new THREE.Mesh(new THREE.BoxGeometry(20.1, 0.65, 14.1), turquoiseBandMat);
  frieze.position.y = 6.55;
  hammamGroup.add(frieze);

  // Central large scalloped Eastern dome + drum
  const centralDrum = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.5, 1.5, 16), marbleMat);
  centralDrum.position.y = 7.4;
  hammamGroup.add(centralDrum);

  const centralDome = new THREE.Mesh(
    new THREE.SphereGeometry(5.1, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.54),
    marbleMat,
  );
  centralDome.position.y = 8.05;
  centralDome.castShadow = true;
  hammamGroup.add(centralDome);

  const mainFinial = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.6, 10), mosaicGoldMat);
  mainFinial.position.y = 13.6;
  hammamGroup.add(mainFinial);

  // Flanking smaller twin domes
  for (const sx of [-6.8, 6.8]) {
    const subDrum = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.9, 12), marbleMat);
    subDrum.position.set(sx, 7.1, 0);
    const subDome = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      turquoiseBandMat,
    );
    subDome.position.set(sx, 7.5, 0);
    const subFinial = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.9, 8), mosaicGoldMat);
    subFinial.position.set(sx, 10.4, 0);
    hammamGroup.add(subDrum, subDome, subFinial);
  }

  // Grand arched doorway & warm amber glowing steam portal
  const archFrame = new THREE.Mesh(new THREE.BoxGeometry(5.6, 5.2, 1.2), marbleMat);
  archFrame.position.set(0, 3.0, 6.9);
  hammamGroup.add(archFrame);

  const portalRect = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.8), hammamGlowMat);
  portalRect.position.set(0, 2.3, 7.55);
  const portalArch = new THREE.Mesh(new THREE.CircleGeometry(1.7, 16, 0, Math.PI), hammamGlowMat);
  portalArch.position.set(0, 4.2, 7.55);
  hammamGroup.add(portalRect, portalArch);

  // Twin columns flanking the arch
  for (const cx of [-2.3, 2.3]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 4.8, 12), mosaicGoldMat);
    col.position.set(cx, 2.8, 7.5);
    hammamGroup.add(col);
  }

  // Rising translucent steam wisps above Hammam domes & entrance
  const steamWisps: Array<{ sprite: THREE.Sprite; baseY: number; phase: number }> = [];
  for (let i = 0; i < 8; i++) {
    const wisp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: textures.glowSprite,
        color: 0xe2f1ff,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    const isPortal = i < 3;
    const baseY = isPortal ? 4.8 + i * 1.1 : 11.2 + (i % 3) * 1.4;
    wisp.position.set(
      isPortal ? (i - 1) * 1.1 : (i - 5) * 2.4,
      baseY,
      isPortal ? 7.8 : 0,
    );
    wisp.scale.set(3.8, 3.2, 1);
    hammamGroup.add(wisp);
    steamWisps.push({ sprite: wisp, baseY, phase: i * 0.9 });
  }

  group.add(hammamGroup);
  obstacles.push({
    minX: 52,
    maxX: 76,
    minY: 0,
    maxY: 13.5,
    minZ: -58,
    maxZ: -38,
  });

  // -------------------------------------------------------
  // 8. SOARING TIMBER PITCHED ROOF, TRUSSES & CHANDELIERS (2x Scale)
  // -------------------------------------------------------
  const slopeAngle = Math.atan2(ARENA_PEAK_H - ARENA_EAVE_H, ARENA_HALF_W);
  const slopeWidth = Math.hypot(ARENA_HALF_W, ARENA_PEAK_H - ARENA_EAVE_H) + 2.0;

  const leftRoof = new THREE.Mesh(
    new THREE.BoxGeometry(slopeWidth, 0.8, ARENA_HALF_D * 2 + 3),
    woodMat,
  );
  leftRoof.position.set(-ARENA_HALF_W * 0.5, (ARENA_PEAK_H + ARENA_EAVE_H) * 0.5, 0);
  leftRoof.rotation.z = slopeAngle;
  group.add(leftRoof);

  const rightRoof = new THREE.Mesh(
    new THREE.BoxGeometry(slopeWidth, 0.8, ARENA_HALF_D * 2 + 3),
    woodMat,
  );
  rightRoof.position.set(ARENA_HALF_W * 0.5, (ARENA_PEAK_H + ARENA_EAVE_H) * 0.5, 0);
  rightRoof.rotation.z = -slopeAngle;
  group.add(rightRoof);

  const chandelierBulbMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
  const chandelierCageMat = new THREE.MeshStandardMaterial({
    color: 0xd4a45c,
    roughness: 0.3,
    metalness: 0.85,
  });

  const trussZPositions = [-70, -54, -38, -22, -6, 10, 26, 42, 58, 72];
  trussZPositions.forEach((tz, tIdx) => {
    const truss = new THREE.Group();
    truss.position.z = tz;

    const tieBeam = new THREE.Mesh(
      new THREE.BoxGeometry(ARENA_HALF_W * 2, 1.1, 0.9),
      beamMat,
    );
    tieBeam.position.y = ARENA_EAVE_H;
    tieBeam.castShadow = true;
    truss.add(tieBeam);

    const kingPost = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, ARENA_PEAK_H - ARENA_EAVE_H, 0.85),
      beamMat,
    );
    kingPost.position.y = (ARENA_PEAK_H + ARENA_EAVE_H) * 0.5;
    truss.add(kingPost);

    for (const side of [-1, 1]) {
      const rafter = new THREE.Mesh(new THREE.BoxGeometry(slopeWidth, 1.0, 0.9), beamMat);
      rafter.position.set(side * ARENA_HALF_W * 0.5, (ARENA_PEAK_H + ARENA_EAVE_H) * 0.5 - 0.5, 0);
      rafter.rotation.z = -side * slopeAngle;
      truss.add(rafter);

      const webStrut = new THREE.Mesh(new THREE.BoxGeometry(0.65, 40, 0.65), beamMat);
      webStrut.position.set(side * 28, ARENA_EAVE_H + 10.5, 0);
      webStrut.rotation.z = side * 0.92;
      truss.add(webStrut);
    }

    if (tIdx % 2 === 0 || tIdx === 5) {
      for (const cx of [-42, 0, 42]) {
        if (cx === 0 && tIdx % 2 !== 0) continue;
        const dropLen = cx === 0 ? 22.0 : 16.0;
        const chan = new THREE.Group();
        chan.position.set(cx, ARENA_EAVE_H - dropLen, 0);

        const cord = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.09, dropLen, 6),
          chandelierCageMat,
        );
        cord.position.y = dropLen * 0.5;
        chan.add(cord);

        const cage = new THREE.Mesh(
          new THREE.CylinderGeometry(1.45, 1.2, 2.6, 8, 1, true),
          chandelierCageMat,
        );
        chan.add(cage);

        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 10), chandelierBulbMat);
        chan.add(bulb);

        const halo = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: textures.glowSprite,
            color: 0xffcf70,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        halo.scale.set(16, 16, 1);
        chan.add(halo);

        truss.add(chan);
      }
    }

    group.add(truss);
  });

  // -------------------------------------------------------
  // 9. PANORAMIC GLASS CURTAIN WALLS & TIMBER WALL RELIEF
  // -------------------------------------------------------
  const buildMullionWall = (
    length: number,
    height: number,
    bays: number,
    pos: THREE.Vector3,
    rotY: number,
  ) => {
    const wallGroup = new THREE.Group();
    wallGroup.position.copy(pos);
    wallGroup.rotation.y = rotY;

    const glass = new THREE.Mesh(new THREE.PlaneGeometry(length, height), glassMat);
    glass.position.y = height * 0.5;
    wallGroup.add(glass);

    const bayStep = length / bays;
    for (let i = 0; i <= bays; i++) {
      const mx = -length * 0.5 + i * bayStep;
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.8, height + 2, 0.9), beamMat);
      mullion.position.set(mx, height * 0.5, 0);
      wallGroup.add(mullion);
    }
    for (let hy = 8.5; hy < height + 0.5; hy += 8.5) {
      const transom = new THREE.Mesh(new THREE.BoxGeometry(length, 0.55, 0.72), beamMat);
      transom.position.set(0, hy, 0);
      wallGroup.add(transom);
    }

    group.add(wallGroup);
  };

  buildMullionWall(ARENA_HALF_D * 2, ARENA_EAVE_H, 16, new THREE.Vector3(-ARENA_HALF_W, 0, 0), Math.PI / 2);
  buildMullionWall(ARENA_HALF_W * 2, ARENA_EAVE_H, 20, new THREE.Vector3(0, 0, -ARENA_HALF_D), 0);

  const gableShape = new THREE.Shape();
  gableShape.moveTo(-ARENA_HALF_W, ARENA_EAVE_H);
  gableShape.lineTo(0, ARENA_PEAK_H);
  gableShape.lineTo(ARENA_HALF_W, ARENA_EAVE_H);
  gableShape.closePath();
  const gableGlass = new THREE.Mesh(new THREE.ShapeGeometry(gableShape), glassMat);
  gableGlass.position.z = -ARENA_HALF_D;
  group.add(gableGlass);

  buildMullionWall(ARENA_HALF_W * 2, ARENA_EAVE_H, 20, new THREE.Vector3(0, 0, ARENA_HALF_D), Math.PI);
  const nearGable = new THREE.Mesh(new THREE.ShapeGeometry(gableShape), woodMat);
  nearGable.position.z = ARENA_HALF_D;
  nearGable.rotation.y = Math.PI;
  group.add(nearGable);

  const rightWoodWall = new THREE.Mesh(new THREE.BoxGeometry(1.0, 32.0, ARENA_HALF_D * 2), woodMat);
  rightWoodWall.position.set(ARENA_HALF_W, 16.0, 0);
  group.add(rightWoodWall);
  buildMullionWall(ARENA_HALF_D * 2, ARENA_EAVE_H - 32, 16, new THREE.Vector3(ARENA_HALF_W, 32, 0), -Math.PI / 2);

  // Sculptural tree mural on right timber wall
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x5c3618, roughness: 0.85 });
  const muralGroup = new THREE.Group();
  muralGroup.position.set(ARENA_HALF_W - 0.75, 0, 12);
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 10, 1.6),
    new THREE.Vector3(0, 20, -1.0),
    new THREE.Vector3(0, 30, 2.2),
  ]);
  muralGroup.add(new THREE.Mesh(new THREE.TubeGeometry(trunkCurve, 16, 0.72, 8, false), treeMat));
  for (let b = 0; b < 5; b++) {
    const branchCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 8.5 + b * 4.2, 0),
      new THREE.Vector3(0, 12.0 + b * 4.2, (b % 2 === 0 ? 1 : -1) * 7.2),
      new THREE.Vector3(0, 14.8 + b * 4.2, (b % 2 === 0 ? 1 : -1) * 12.0),
    ]);
    muralGroup.add(new THREE.Mesh(new THREE.TubeGeometry(branchCurve, 10, 0.3, 6, false), treeMat));
  }
  group.add(muralGroup);

  // -------------------------------------------------------
  // 10. TWILIGHT WINTER EXTERIOR OUTSIDE THE 2x GLASS WALLS
  // -------------------------------------------------------
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xbdd1e8, roughness: 0.9 });
  const outerApron = new THREE.Mesh(new THREE.PlaneGeometry(680, 680), snowMat);
  outerApron.rotation.x = -Math.PI / 2;
  outerApron.position.y = -0.65;
  group.add(outerApron);

  // Outdoor glowing thermal pool visible through left glass windows
  const outdoorPool = new THREE.Mesh(
    new THREE.PlaneGeometry(36, 54),
    new THREE.MeshBasicMaterial({ color: 0x2299ee }),
  );
  outdoorPool.rotation.x = -Math.PI / 2;
  outdoorPool.position.set(-136, -0.45, -8);
  group.add(outdoorPool);

  // Snowy pine trees outside the doubled perimeter
  const treeCount = 88;
  const pineGeo = new THREE.ConeGeometry(4.6, 17, 7);
  const pineMat = new THREE.MeshStandardMaterial({ color: 0x2c475c, roughness: 0.9 });
  const pineInst = new THREE.InstancedMesh(pineGeo, pineMat, treeCount);
  const pineDummy = new THREE.Object3D();
  for (let i = 0; i < treeCount; i++) {
    const angle = (i / treeCount) * Math.PI * 2;
    const distX = 132 + (i % 5) * 18 + Math.random() * 12;
    const distZ = 108 + (i % 5) * 18 + Math.random() * 12;
    const tx = Math.cos(angle) * distX;
    const tz = Math.sin(angle) * distZ;
    const sc = 0.9 + Math.random() * 0.8;
    pineDummy.position.set(tx, 8.2 * sc, tz);
    pineDummy.scale.setScalar(sc);
    pineDummy.rotation.y = Math.random() * Math.PI;
    pineDummy.updateMatrix();
    pineInst.setMatrixAt(i, pineDummy.matrix);
  }
  pineInst.instanceMatrix.needsUpdate = true;
  pineInst.computeBoundingSphere();
  group.add(pineInst);

  return {
    group,
    obstacles,
    update: (elapsed: number, _dt: number) => {
      waterUniforms.uTime.value = elapsed;
      fountainJets.forEach((jet, idx) => {
        const pulse = 0.95 + Math.sin(elapsed * 5.2 + idx * 1.1) * 0.06;
        jet.scale.set(1, pulse, 1);
      });
      jacuzziBubbleRings.forEach((ring, idx) => {
        const s = 0.85 + Math.sin(elapsed * 3.8 + idx * 1.5) * 0.14;
        ring.scale.setScalar(s);
      });
      steamWisps.forEach((w) => {
        const cycle = ((elapsed * 0.45 + w.phase) % 2.4) / 2.4;
        w.sprite.position.y = w.baseY + cycle * 2.8;
        (w.sprite.material as THREE.SpriteMaterial).opacity =
          Math.sin(cycle * Math.PI) * 0.25;
      });
    },
  };
}
