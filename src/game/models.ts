import * as THREE from 'three';
import { PickupKind } from './types';
import { ProceduralTexturePack } from './textures';

export interface PlanePalette {
  fuselage: string;
  wing: string;
  trim: string;
  hatRibbon: string;
}

export const PLAYER_PLANE_PALETTE: PlanePalette = {
  fuselage: '#6eb8d8',
  wing: '#efe5a5',
  trim: '#6eb8d8',
  hatRibbon: '#e65b48',
};

export const ENEMY_PLANE_PALETTES: PlanePalette[] = [
  { fuselage: '#e87a6b', wing: '#f5e7b2', trim: '#d9534f', hatRibbon: '#386fa4' },
  { fuselage: '#6ec49c', wing: '#f3ebd0', trim: '#439c73', hatRibbon: '#e65b48' },
  { fuselage: '#9d85d6', wing: '#f0e6b6', trim: '#785ec4', hatRibbon: '#f2b134' },
  { fuselage: '#f0a65b', wing: '#f5ecc6', trim: '#d97a2b', hatRibbon: '#357ea8' },
];

const outlineMaterial = new THREE.MeshBasicMaterial({
  color: 0x1e1d1b,
  side: THREE.BackSide,
});

const edgeLineMaterial = new THREE.LineBasicMaterial({
  color: 0x22201d,
  transparent: true,
  opacity: 0.8,
});

function addInvertedOutline(mesh: THREE.Mesh, scale = 1.055): void {
  const outline = new THREE.Mesh(mesh.geometry, outlineMaterial);
  outline.scale.setScalar(scale);
  outline.castShadow = false;
  outline.receiveShadow = false;
  mesh.add(outline);
}

function addCrispEdges(mesh: THREE.Mesh, threshold = 22): void {
  const edges = new THREE.EdgesGeometry(mesh.geometry, threshold);
  const lines = new THREE.LineSegments(edges, edgeLineMaterial);
  mesh.add(lines);
}

export interface PlaneModelHandle {
  root: THREE.Group;
  propeller: THREE.Group;
  seatedPilot: THREE.Group;
  muzzleLeft: THREE.Object3D;
  muzzleRight: THREE.Object3D;
  beaconRing: THREE.Mesh;
  hitMeshes: THREE.Mesh[];
  setHitFlash: (amount: number) => void;
}

export interface CharacterModelHandle {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  headGroup: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  parachuteGroup: THREE.Group;
  muzzle: THREE.Object3D;
  contactShadow: THREE.Mesh;
  setHitFlash: (amount: number) => void;
}

function buildHeadAndHat(hatRibbonHex: string, includeOutline = true): THREE.Group {
  const headGroup = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xf7e4d2,
    roughness: 0.72,
    metalness: 0.02,
  });
  const hatMat = new THREE.MeshStandardMaterial({
    color: 0xf4e49c,
    roughness: 0.8,
    metalness: 0.0,
  });
  const ribbonMat = new THREE.MeshStandardMaterial({
    color: hatRibbonHex,
    roughness: 0.65,
    metalness: 0.05,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x1a1918,
    roughness: 0.25,
    metalness: 0.1,
  });
  const cheekMat = new THREE.MeshStandardMaterial({
    color: 0xf38b82,
    roughness: 0.85,
  });

  // Head capsule/cylinder with rounded top
  const headGeo = new THREE.CapsuleGeometry(0.24, 0.12, 8, 16);
  const headMesh = new THREE.Mesh(headGeo, skinMat);
  headMesh.position.y = 0.24;
  headMesh.castShadow = true;
  if (includeOutline) addInvertedOutline(headMesh, 1.06);
  headGroup.add(headMesh);

  // Eyes (facing -Z)
  const eyeGeo = new THREE.SphereGeometry(0.032, 10, 10);
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.085, 0.27, -0.225);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(0.085, 0.27, -0.225);
  headGroup.add(leftEye, rightEye);

  // Little round nose
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 10), skinMat);
  nose.position.set(0, 0.23, -0.25);
  if (includeOutline) addInvertedOutline(nose, 1.12);
  headGroup.add(nose);

  // Rosy cheeks
  const cheekGeo = new THREE.SphereGeometry(0.042, 10, 8);
  const leftCheek = new THREE.Mesh(cheekGeo, cheekMat);
  leftCheek.scale.set(1.1, 0.7, 0.5);
  leftCheek.position.set(-0.145, 0.205, -0.195);
  const rightCheek = new THREE.Mesh(cheekGeo, cheekMat);
  rightCheek.scale.set(1.1, 0.7, 0.5);
  rightCheek.position.set(0.145, 0.205, -0.195);
  headGroup.add(leftCheek, rightCheek);

  // Smile arc
  const smileCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.065, 0.175, -0.225),
    new THREE.Vector3(0, 0.148, -0.242),
    new THREE.Vector3(0.065, 0.175, -0.225),
  ]);
  const smileMesh = new THREE.Mesh(new THREE.TubeGeometry(smileCurve, 10, 0.011, 6, false), eyeMat);
  headGroup.add(smileMesh);

  // Straw Boater Hat
  const brimGeo = new THREE.CylinderGeometry(0.45, 0.47, 0.042, 24);
  const brim = new THREE.Mesh(brimGeo, hatMat);
  brim.position.y = 0.43;
  brim.castShadow = true;
  if (includeOutline) addInvertedOutline(brim, 1.04);
  headGroup.add(brim);

  const crownGeo = new THREE.CylinderGeometry(0.24, 0.27, 0.2, 20);
  const crown = new THREE.Mesh(crownGeo, hatMat);
  crown.position.y = 0.53;
  crown.castShadow = true;
  if (includeOutline) addInvertedOutline(crown, 1.05);
  headGroup.add(crown);

  const ribbonGeo = new THREE.CylinderGeometry(0.264, 0.272, 0.062, 20);
  const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
  ribbon.position.y = 0.475;
  headGroup.add(ribbon);

  return headGroup;
}

export function createPlaneModel(
  palette: PlanePalette,
  textures: ProceduralTexturePack,
  isPlayer = false,
): PlaneModelHandle {
  const root = new THREE.Group();
  const hitMeshes: THREE.Mesh[] = [];

  const fuselageTex = textures.paintTexture(palette.fuselage, '#ffffff');
  const wingTex = textures.paintTexture(palette.wing, '#f7f1d0');

  const fuselageMat = new THREE.MeshStandardMaterial({
    map: fuselageTex,
    roughness: 0.52,
    metalness: 0.08,
  });
  const wingMat = new THREE.MeshStandardMaterial({
    map: wingTex,
    roughness: 0.65,
    metalness: 0.05,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: palette.trim,
    roughness: 0.48,
    metalness: 0.12,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x8d5428,
    roughness: 0.78,
    metalness: 0.02,
  });
  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xf4f5f7,
    roughness: 0.5,
    metalness: 0.05,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x2f3136,
    roughness: 0.6,
    metalness: 0.2,
  });

  const flashableMats: THREE.MeshStandardMaterial[] = [fuselageMat, wingMat, trimMat, whiteMat];

  // 1. Main Fuselage (Lathe profile oriented along -Z forward)
  const fusePoints = [
    new THREE.Vector2(0.01, -1.65),
    new THREE.Vector2(0.18, -1.58),
    new THREE.Vector2(0.42, -1.25),
    new THREE.Vector2(0.46, -0.55),
    new THREE.Vector2(0.45, 0.25),
    new THREE.Vector2(0.32, 0.95),
    new THREE.Vector2(0.15, 1.55),
    new THREE.Vector2(0.01, 1.68),
  ];
  const fuseGeo = new THREE.LatheGeometry(fusePoints, 20);
  fuseGeo.rotateX(Math.PI / 2);
  const fuselage = new THREE.Mesh(fuseGeo, fuselageMat);
  fuselage.castShadow = true;
  fuselage.receiveShadow = true;
  addInvertedOutline(fuselage, 1.045);
  root.add(fuselage);
  hitMeshes.push(fuselage);

  // Yellow Cowling Ring at front
  const cowlGeo = new THREE.CylinderGeometry(0.44, 0.48, 0.26, 20);
  cowlGeo.rotateX(Math.PI / 2);
  const cowl = new THREE.Mesh(cowlGeo, wingMat);
  cowl.position.set(0, 0, -1.22);
  cowl.castShadow = true;
  addInvertedOutline(cowl, 1.05);
  root.add(cowl);

  // Cockpit Rim & Interior seat
  const cockpitWell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.31, 0.28, 0.25, 16),
    darkMat,
  );
  cockpitWell.position.set(0, 0.34, 0.06);
  root.add(cockpitWell);

  const cockpitRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.31, 0.055, 8, 20),
    woodMat,
  );
  cockpitRim.rotation.x = Math.PI / 2;
  cockpitRim.position.set(0, 0.44, 0.06);
  root.add(cockpitRim);

  // Translucent Windshield
  const shieldMat = new THREE.MeshPhysicalMaterial({
    color: 0xd9f4ff,
    transparent: true,
    opacity: 0.55,
    roughness: 0.12,
    metalness: 0.05,
    clearcoat: 1.0,
    side: THREE.DoubleSide,
  });
  const shieldGeo = new THREE.CylinderGeometry(0.31, 0.34, 0.24, 14, 1, true, Math.PI * 0.65, Math.PI * 0.7);
  const windshield = new THREE.Mesh(shieldGeo, shieldMat);
  windshield.position.set(0, 0.54, -0.05);
  windshield.rotation.x = 0.28;
  root.add(windshield);

  // 2. Propeller Group
  const propeller = new THREE.Group();
  propeller.position.set(0, 0, -1.52);

  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.28, 14), trimMat);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -0.08;
  addInvertedOutline(spinner, 1.08);
  propeller.add(spinner);

  const bladeGeo = new THREE.BoxGeometry(1.42, 0.14, 0.045);
  const blade = new THREE.Mesh(bladeGeo, woodMat);
  blade.rotation.z = 0.35;
  blade.castShadow = true;
  addCrispEdges(blade, 25);
  propeller.add(blade);
  root.add(propeller);

  // 3. Wings (Left & Right flat wings with blue tips and roundels)
  const roundelMat = new THREE.MeshStandardMaterial({
    map: textures.wingRoundel,
    transparent: true,
    roughness: 0.55,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const buildWingSide = (side: -1 | 1) => {
    const wingGroup = new THREE.Group();
    const mainWing = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.1, 0.78), wingMat);
    mainWing.position.set(side * 1.18, 0.05, -0.25);
    mainWing.castShadow = true;
    mainWing.receiveShadow = true;
    addCrispEdges(mainWing, 25);
    wingGroup.add(mainWing);
    hitMeshes.push(mainWing);

    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.11, 0.79), trimMat);
    tip.position.set(side * 2.15, 0.05, -0.25);
    tip.castShadow = true;
    addCrispEdges(tip, 25);
    wingGroup.add(tip);

    // Roundel decal on top
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.54), roundelMat);
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(side * 1.25, 0.105, -0.25);
    wingGroup.add(decal);

    // White fuselage side rail
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 1.05), whiteMat);
    rail.position.set(side * 0.44, 0.18, -0.1);
    addCrispEdges(rail, 25);
    wingGroup.add(rail);

    return wingGroup;
  };
  root.add(buildWingSide(-1), buildWingSide(1));

  // 4. Twin Pontoons / Floats + Diagonal Struts + Side Wheel
  const buildPontoon = (side: -1 | 1) => {
    const pontoonGroup = new THREE.Group();
    const px = side * 0.62;
    const py = -0.82;

    const floatBody = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.16, 1.25, 8, 14),
      whiteMat,
    );
    floatBody.rotation.x = Math.PI / 2;
    floatBody.position.set(px, py, -0.25);
    floatBody.castShadow = true;
    addInvertedOutline(floatBody, 1.06);
    pontoonGroup.add(floatBody);

    const floatNose = new THREE.Mesh(new THREE.SphereGeometry(0.165, 12, 10), trimMat);
    floatNose.position.set(px, py, -0.94);
    addInvertedOutline(floatNose, 1.06);
    pontoonGroup.add(floatNose);

    // Front & rear diagonal wooden struts
    const strutGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.85, 8);
    const frontStrut = new THREE.Mesh(strutGeo, woodMat);
    frontStrut.position.set(px * 0.65, -0.44, -0.58);
    frontStrut.rotation.z = side * -0.42;
    frontStrut.rotation.x = 0.15;
    pontoonGroup.add(frontStrut);

    const rearStrut = new THREE.Mesh(strutGeo, woodMat);
    rearStrut.position.set(px * 0.65, -0.44, 0.12);
    rearStrut.rotation.z = side * -0.42;
    rearStrut.rotation.x = -0.15;
    pontoonGroup.add(rearStrut);

    // Cute side wheel detail (matching Image 1)
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.09, 14), darkMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(px + side * 0.16, py + 0.02, -0.35);
    addInvertedOutline(wheel, 1.07);
    pontoonGroup.add(wheel);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.105, 12), wingMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(px + side * 0.16, py + 0.02, -0.35);
    pontoonGroup.add(hub);

    return pontoonGroup;
  };
  root.add(buildPontoon(-1), buildPontoon(1));

  // 5. Tail Assembly
  const tailGroup = new THREE.Group();
  const hStab = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.08, 0.42), wingMat);
  hStab.position.set(0, 0.12, 1.38);
  hStab.castShadow = true;
  addCrispEdges(hStab, 25);
  tailGroup.add(hStab);

  const vFinWhite = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.68, 0.45), whiteMat);
  vFinWhite.position.set(0, 0.48, 1.38);
  vFinWhite.castShadow = true;
  addCrispEdges(vFinWhite, 25);
  tailGroup.add(vFinWhite);

  const vFinStripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.66, 0.2), trimMat);
  vFinStripe.position.set(0, 0.48, 1.24);
  tailGroup.add(vFinStripe);
  root.add(tailGroup);

  // 6. Seated Pilot inside cockpit (hidden when player ejects!)
  const seatedPilot = new THREE.Group();
  seatedPilot.position.set(0, 0.36, 0.06);

  const overallsMat = new THREE.MeshStandardMaterial({
    map: textures.paintTexture('#4a8ab5', '#74b5de'),
    roughness: 0.72,
  });
  const sleeveMat = new THREE.MeshStandardMaterial({
    color: 0xf7f7f5,
    roughness: 0.7,
  });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.24), overallsMat);
  torso.position.y = 0.15;
  addCrispEdges(torso, 25);
  seatedPilot.add(torso);

  const armGeo = new THREE.CapsuleGeometry(0.065, 0.2, 6, 8);
  const leftArm = new THREE.Mesh(armGeo, sleeveMat);
  leftArm.position.set(-0.22, 0.18, -0.06);
  leftArm.rotation.x = 0.7;
  leftArm.rotation.z = 0.2;
  const rightArm = new THREE.Mesh(armGeo, sleeveMat);
  rightArm.position.set(0.22, 0.18, -0.06);
  rightArm.rotation.x = 0.7;
  rightArm.rotation.z = -0.2;
  seatedPilot.add(leftArm, rightArm);

  const pilotHead = buildHeadAndHat(palette.hatRibbon, true);
  pilotHead.position.y = 0.3;
  pilotHead.scale.setScalar(0.92);
  seatedPilot.add(pilotHead);
  root.add(seatedPilot);

  // Muzzle anchors for twin wing blasters
  const muzzleLeft = new THREE.Object3D();
  muzzleLeft.position.set(-1.15, 0.05, -0.75);
  const muzzleRight = new THREE.Object3D();
  muzzleRight.position.set(1.15, 0.05, -0.75);
  root.add(muzzleLeft, muzzleRight);

  // Beacon ring shown when player is on foot so they can easily find their plane
  const beaconMat = new THREE.MeshBasicMaterial({
    color: isPlayer ? 0x38bdf8 : 0xff6b6b,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const beaconRing = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.85, 32), beaconMat);
  beaconRing.rotation.x = -Math.PI / 2;
  beaconRing.position.y = -0.75;
  beaconRing.visible = false;
  root.add(beaconRing);

  return {
    root,
    propeller,
    seatedPilot,
    muzzleLeft,
    muzzleRight,
    beaconRing,
    hitMeshes,
    setHitFlash: (amount: number) => {
      const clamped = THREE.MathUtils.clamp(amount, 0, 1);
      flashableMats.forEach((m) => {
        m.emissive.setRGB(clamped * 0.9, clamped * 0.35, clamped * 0.2);
      });
    },
  };
}

export function createCharacterModel(
  textures: ProceduralTexturePack,
  hatRibbonHex = '#e65b48',
): CharacterModelHandle {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const overallsMat = new THREE.MeshStandardMaterial({
    map: textures.paintTexture('#4a8ab5', '#74b5de'),
    roughness: 0.72,
    metalness: 0.02,
  });
  const sleeveMat = new THREE.MeshStandardMaterial({
    color: 0xf8f8f4,
    roughness: 0.75,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xf7e4d2,
    roughness: 0.7,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: 0x6b4226,
    roughness: 0.72,
  });
  const blasterMat = new THREE.MeshStandardMaterial({
    color: 0x3c4043,
    roughness: 0.45,
    metalness: 0.4,
  });

  const flashableMats = [overallsMat, sleeveMat];

  // Legs (feet bottom sits flush at y = 0)
  const buildLeg = (side: -1 | 1) => {
    const legPivot = new THREE.Group();
    legPivot.position.set(side * 0.11, 0.42, 0);

    const pant = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.08, 0.28, 12), overallsMat);
    pant.position.y = -0.15;
    pant.castShadow = true;
    addInvertedOutline(pant, 1.07);
    legPivot.add(pant);

    const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 10), shoeMat);
    shoe.scale.set(0.95, 0.75, 1.25);
    shoe.position.set(0, -0.34, -0.03);
    shoe.castShadow = true;
    addInvertedOutline(shoe, 1.08);
    legPivot.add(shoe);

    return legPivot;
  };
  const leftLegPivot = buildLeg(-1);
  const rightLegPivot = buildLeg(1);
  bodyPivot.add(leftLegPivot, rightLegPivot);

  // Torso (blue denim overalls + bib pocket)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.48, 0.25), overallsMat);
  torso.position.y = 0.68;
  torso.castShadow = true;
  addCrispEdges(torso, 25);
  bodyPivot.add(torso);

  const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.04), overallsMat);
  pocket.position.set(0, 0.72, -0.135);
  addCrispEdges(pocket, 25);
  bodyPivot.add(pocket);

  // Arms
  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.27, 0.86, 0);
  const leftSleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.24, 6, 10), sleeveMat);
  leftSleeve.position.y = -0.16;
  leftSleeve.castShadow = true;
  addInvertedOutline(leftSleeve, 1.07);
  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), skinMat);
  leftHand.position.y = -0.34;
  leftArmPivot.add(leftSleeve, leftHand);
  bodyPivot.add(leftArmPivot);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.27, 0.86, 0);
  const rightSleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.24, 6, 10), sleeveMat);
  rightSleeve.position.y = -0.16;
  rightSleeve.castShadow = true;
  addInvertedOutline(rightSleeve, 1.07);
  const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), skinMat);
  rightHand.position.y = -0.34;

  // Handheld Water/Cork Blaster on right hand (like Image 2!)
  const blasterGroup = new THREE.Group();
  blasterGroup.position.set(0, -0.34, -0.09);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.26), blasterMat);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.07), blasterMat);
  grip.position.set(0, -0.07, 0.07);
  blasterGroup.add(barrel, grip);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -0.16);
  blasterGroup.add(muzzle);

  rightArmPivot.add(rightSleeve, rightHand, blasterGroup);
  bodyPivot.add(rightArmPivot);

  // Head + Hat
  const headGroup = buildHeadAndHat(hatRibbonHex, true);
  headGroup.position.y = 0.94;
  bodyPivot.add(headGroup);

  // Parachute Parasol (for mid-air ejection!)
  const parachuteGroup = new THREE.Group();
  parachuteGroup.position.set(0, 1.65, 0);
  parachuteGroup.visible = false;

  const canopyGeo = new THREE.SphereGeometry(1.15, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45);
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0xff8a75,
    roughness: 0.75,
    side: THREE.DoubleSide,
  });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.y = 0.45;
  addCrispEdges(canopy, 35);
  parachuteGroup.add(canopy);

  const stripeCanopy = new THREE.Mesh(
    new THREE.SphereGeometry(1.16, 8, 8, 0, Math.PI * 2, 0, Math.PI * 0.45),
    new THREE.MeshStandardMaterial({ color: 0xfff3c4, wireframe: true }),
  );
  stripeCanopy.position.y = 0.45;
  parachuteGroup.add(stripeCanopy);

  const cordMat = new THREE.LineBasicMaterial({ color: 0xf4f1ea, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -0.55, 0),
      new THREE.Vector3(Math.cos(angle) * 0.95, 0.48, Math.sin(angle) * 0.95),
    ]);
    parachuteGroup.add(new THREE.Line(lineGeo, cordMat));
  }
  bodyPivot.add(parachuteGroup);

  // Contact shadow disc grounded at y = 0.02
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 0.95),
    new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.75,
    }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.025;
  root.add(contactShadow);

  return {
    root,
    bodyPivot,
    headGroup,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    parachuteGroup,
    muzzle,
    contactShadow,
    setHitFlash: (amount: number) => {
      const c = THREE.MathUtils.clamp(amount, 0, 1);
      flashableMats.forEach((m) => {
        m.emissive.setRGB(c * 0.9, c * 0.3, c * 0.2);
      });
    },
  };
}

export function createPickupModel(kind: PickupKind): THREE.Group {
  const group = new THREE.Group();

  if (kind === 'duck') {
    const yellowMat = new THREE.MeshStandardMaterial({
      color: 0xffd54f,
      roughness: 0.35,
      metalness: 0.05,
    });
    const orangeMat = new THREE.MeshStandardMaterial({
      color: 0xff7043,
      roughness: 0.5,
    });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), yellowMat);
    body.scale.set(1, 0.8, 1.2);
    addInvertedOutline(body, 1.06);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), yellowMat);
    head.position.set(0, 0.48, -0.28);
    addInvertedOutline(head, 1.06);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 8), orangeMat);
    beak.rotation.x = -Math.PI / 2;
    beak.position.set(0, 0.44, -0.64);
    group.add(body, head, beak);
  } else if (kind === 'repair') {
    const greenMat = new THREE.MeshStandardMaterial({
      color: 0x34d399,
      roughness: 0.35,
      emissive: 0x059669,
      emissiveIntensity: 0.35,
    });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.5), greenMat);
    addCrispEdges(box, 25);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.54), whiteMat);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.54), whiteMat);
    group.add(box, crossH, crossV);
  } else {
    const starMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.25,
      metalness: 0.3,
      emissive: 0x0284c7,
      emissiveIntensity: 0.5,
    });
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.65, 0), starMat);
    addCrispEdges(core, 20);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.08, 8, 20),
      new THREE.MeshBasicMaterial({ color: 0xbae6fd }),
    );
    group.add(core, ring);
  }

  return group;
}
