import * as THREE from 'three';
import { applyMetricTriplanarUvAndUv2, type ArchTrimMaterialBundle } from './architecturalDetails';
import { createAbavaPierDetails, createHuntingLodgeRuinsDetails } from './heroLandmarks';
import { BUILDING_UV_METER_SCALE } from './rendaMath';

function createLicensePlateTexture(text = 'LV · RN-2026'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#eef0ef';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#144496';
  ctx.fillRect(0, 0, 38, 64);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LV', 19, 36);
  ctx.fillStyle = '#16181a';
  ctx.font = '800 32px monospace';
  ctx.fillText(text.replace('LV · ', ''), 147, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(10, 14, 11, 0.72)');
  grad.addColorStop(0.6, 'rgba(10, 14, 11, 0.32)');
  grad.addColorStop(1, 'rgba(10, 14, 11, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let sharedShadowTex: THREE.CanvasTexture | null = null;

export function createContactShadowDisc(radius = 1.4): THREE.Mesh {
  if (!sharedShadowTex) sharedShadowTex = createContactShadowTexture();
  const geo = new THREE.CircleGeometry(radius, 24);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: sharedShadowTex,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.03;
  return mesh;
}

export interface ExplorerRig {
  group: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  head: THREE.Group;
  body: THREE.Group;
}

export function createExplorerGroup(): ExplorerRig {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const bootMat = new THREE.MeshStandardMaterial({ color: 0x3b281c, roughness: 0.78, metalness: 0.08 });
  const soleMat = new THREE.MeshStandardMaterial({ color: 0x181918, roughness: 0.94, metalness: 0.02 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2e3b43, roughness: 0.84, metalness: 0.04 });
  const kneePatchMat = new THREE.MeshStandardMaterial({ color: 0x232d34, roughness: 0.88, metalness: 0.04 });
  const jacketMat = new THREE.MeshStandardMaterial({ color: 0xc56232, roughness: 0.7, metalness: 0.05 });
  const yokeMat = new THREE.MeshStandardMaterial({ color: 0x733e24, roughness: 0.76, metalness: 0.05 });
  const beltMat = new THREE.MeshStandardMaterial({ color: 0x281e17, roughness: 0.56, metalness: 0.14 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd9ab52, roughness: 0.25, metalness: 0.86 });
  const packMat = new THREE.MeshStandardMaterial({ color: 0x45583a, roughness: 0.78, metalness: 0.05 });
  const bedrollMat = new THREE.MeshStandardMaterial({ color: 0xbba988, roughness: 0.86, metalness: 0.02 });
  const flaskMat = new THREE.MeshStandardMaterial({ color: 0xb9c2c6, roughness: 0.28, metalness: 0.82 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe6bc9d, roughness: 0.62, metalness: 0.02 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.78, metalness: 0.05 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.85 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x233529, roughness: 0.7, metalness: 0.05 });
  const scarfMat = new THREE.MeshStandardMaterial({ color: 0x3a5a49, roughness: 0.84 });

  // Sculpted rounded hiking boot profile (extruded cleanly with beveled heel & toe cap)
  const bootShape = new THREE.Shape();
  bootShape.moveTo(-0.11, -0.05);
  bootShape.lineTo(0.16, -0.05);
  bootShape.quadraticCurveTo(0.20, -0.01, 0.18, 0.05);
  bootShape.quadraticCurveTo(0.08, 0.08, 0.02, 0.13);
  bootShape.lineTo(-0.10, 0.13);
  bootShape.quadraticCurveTo(-0.13, 0.04, -0.11, -0.05);
  const bootGeo = new THREE.ExtrudeGeometry(bootShape, {
    depth: 0.13,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.02,
    bevelThickness: 0.02,
  });
  bootGeo.translate(0, 0, -0.065);
  bootGeo.rotateY(-Math.PI / 2); // +Z toe forward

  // Articulated Legs pivoted at hip (y = 0.82)
  const makeLeg = (xOff: number): THREE.Group => {
    const legPivot = new THREE.Group();
    legPivot.position.set(xOff, 0.82, 0);

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.108, 0.27, 6, 12), pantsMat);
    thigh.position.set(0, -0.21, 0);
    thigh.castShadow = true;
    legPivot.add(thigh);

    const kneePatch = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.095, 0.11, 10), kneePatchMat);
    kneePatch.position.set(0, -0.37, 0.015);
    legPivot.add(kneePatch);

    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.086, 0.27, 6, 12), pantsMat);
    shin.position.set(0, -0.52, 0);
    shin.castShadow = true;
    legPivot.add(shin);

    const boot = new THREE.Mesh(bootGeo, bootMat);
    boot.position.set(0, -0.73, 0.02);
    boot.castShadow = true;
    legPivot.add(boot);

    const ankleCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.095, 0.07, 10), yokeMat);
    ankleCuff.position.set(0, -0.63, 0.0);
    legPivot.add(ankleCuff);

    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.04, 0.31), soleMat);
    sole.position.set(0, -0.79, 0.04);
    legPivot.add(sole);

    return legPivot;
  };

  const leftLeg = makeLeg(-0.142);
  const rightLeg = makeLeg(0.142);
  body.add(leftLeg);
  body.add(rightLeg);

  // Tailored LatheGeometry organic field-jacket torso + hips
  const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.185, 0.14, 6, 12), pantsMat);
  hips.position.set(0, 0.84, 0);
  hips.scale.set(1.22, 0.9, 0.82);
  body.add(hips);

  const jacketPts = [
    new THREE.Vector2(0.01, 0.0),
    new THREE.Vector2(0.24, 0.02),
    new THREE.Vector2(0.23, 0.14),
    new THREE.Vector2(0.215, 0.26), // tailored waist
    new THREE.Vector2(0.255, 0.44), // chest
    new THREE.Vector2(0.265, 0.56), // broad curved shoulders
    new THREE.Vector2(0.15, 0.62),  // collar taper
    new THREE.Vector2(0.01, 0.62),
  ];
  const jacketGeo = new THREE.LatheGeometry(jacketPts, 16);
  const jacket = new THREE.Mesh(jacketGeo, jacketMat);
  jacket.position.set(0, 0.83, 0);
  jacket.scale.set(1.12, 1.0, 0.74);
  jacket.castShadow = true;
  body.add(jacket);

  // Rounded contoured shoulder yoke capelet + front storm-flap placket & pockets
  const yokeGeo = new THREE.SphereGeometry(0.268, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.48);
  const shoulderYoke = new THREE.Mesh(yokeGeo, yokeMat);
  shoulderYoke.position.set(0, 1.24, 0);
  shoulderYoke.scale.set(1.14, 0.86, 0.77);
  shoulderYoke.castShadow = true;
  body.add(shoulderYoke);

  const stormFlap = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.52, 0.04), yokeMat);
  stormFlap.position.set(0, 1.13, 0.195);
  body.add(stormFlap);

  for (const px of [-0.13, 0.13]) {
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.11, 0.04), yokeMat);
    pocket.position.set(px, 1.02, 0.19);
    pocket.rotation.y = px > 0 ? 0.22 : -0.22;
    body.add(pocket);
  }
  for (const by of [0.96, 1.12, 1.28]) {
    const snap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 8), brassMat);
    snap.rotation.x = Math.PI / 2;
    snap.position.set(0, by, 0.215);
    body.add(snap);
  }

  // Leather waist belt + brass buckle + side field pouch & stainless canteen flask
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.036, 8, 18), beltMat);
  belt.rotation.x = Math.PI / 2;
  belt.position.set(0, 0.94, 0);
  belt.scale.set(1.1, 0.76, 1.0);
  body.add(belt);

  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.035), brassMat);
  buckle.position.set(0, 0.94, 0.2);
  body.add(buckle);

  const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.08), beltMat);
  pouch.position.set(0.24, 0.92, 0.06);
  body.add(pouch);

  const canteen = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.14, 10), flaskMat);
  canteen.position.set(-0.24, 0.91, 0.05);
  body.add(canteen);

  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.048, 8, 16), scarfMat);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.set(0, 1.47, 0.01);
  body.add(scarf);

  // Articulated Arms pivoted at shoulders (y = 1.36)
  const makeArm = (side: -1 | 1): THREE.Group => {
    const armPivot = new THREE.Group();
    armPivot.position.set(side * 0.285, 1.35, 0);

    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 10), yokeMat);
    armPivot.add(shoulder);

    const upperSleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.078, 0.17, 5, 10), jacketMat);
    upperSleeve.position.set(side * 0.015, -0.14, 0);
    upperSleeve.rotation.z = side * 0.08;
    upperSleeve.castShadow = true;
    armPivot.add(upperSleeve);

    const foreSleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.16, 5, 10), jacketMat);
    foreSleeve.position.set(side * 0.032, -0.31, 0.02);
    foreSleeve.rotation.x = -0.12;
    foreSleeve.castShadow = true;
    armPivot.add(foreSleeve);

    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.076, 0.076, 0.05, 10), yokeMat);
    cuff.position.set(side * 0.038, -0.4, 0.03);
    armPivot.add(cuff);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.064, 10, 8), gloveMat);
    hand.position.set(side * 0.04, -0.48, 0.04);
    hand.scale.set(0.88, 1.15, 0.92);
    armPivot.add(hand);

    return armPivot;
  };

  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);
  body.add(leftArm);
  body.add(rightArm);

  // Sculpted Beveled Canvas Rucksack + Leather Straps + Brass Buckles + Bedroll
  const packProfile = new THREE.Shape();
  packProfile.moveTo(-0.15, 0);
  packProfile.lineTo(0.15, 0);
  packProfile.quadraticCurveTo(0.18, 0.22, 0.14, 0.42);
  packProfile.quadraticCurveTo(0, 0.47, -0.14, 0.42);
  packProfile.quadraticCurveTo(-0.18, 0.22, -0.15, 0);
  const packGeo = new THREE.ExtrudeGeometry(packProfile, {
    depth: 0.16,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.035,
    bevelThickness: 0.035,
  });
  packGeo.translate(0, 0, -0.08);
  const pack = new THREE.Mesh(packGeo, packMat);
  pack.position.set(0, 0.94, -0.24);
  pack.castShadow = true;
  body.add(pack);

  const packFlap = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.14, 5, 10), yokeMat);
  packFlap.rotation.z = Math.PI / 2;
  packFlap.scale.set(0.7, 1.0, 0.95);
  packFlap.position.set(0, 1.33, -0.25);
  body.add(packFlap);

  for (const sx of [-0.11, 0.11]) {
    const backStrap = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.36, 0.03), beltMat);
    backStrap.position.set(sx, 1.16, -0.34);
    body.add(backStrap);

    const strapBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.04, 0.04), brassMat);
    strapBuckle.position.set(sx, 1.04, -0.345);
    body.add(strapBuckle);

    const shoulderHarness = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.026, 6, 12, Math.PI * 0.85), beltMat);
    shoulderHarness.rotation.y = Math.PI / 2;
    shoulderHarness.rotation.z = -0.35;
    shoulderHarness.position.set(sx * 1.45, 1.27, -0.02);
    body.add(shoulderHarness);
  }

  const bedroll = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.36, 12), bedrollMat);
  bedroll.rotation.z = Math.PI / 2;
  bedroll.position.set(0, 1.43, -0.25);
  body.add(bedroll);

  // Articulated Head + Rounded Cap & Curved Visor Brim
  const head = new THREE.Group();
  head.position.set(0, 1.49, 0);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.086, 0.12, 12), skinMat);
  neck.position.set(0, 0.02, 0);
  head.add(neck);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 14), skinMat);
  skull.position.set(0, 0.16, 0);
  skull.scale.set(0.94, 1.04, 0.98);
  skull.castShadow = true;
  head.add(skull);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.06, 6), skinMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.15, 0.175);
  head.add(nose);

  const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.184, 14, 12), hairMat);
  hairBack.position.set(0, 0.175, -0.038);
  head.add(hairBack);

  const capDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.188, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
    capMat
  );
  capDome.position.set(0, 0.21, -0.01);
  head.add(capDome);

  const brimShape = new THREE.Shape();
  brimShape.moveTo(-0.145, 0);
  brimShape.quadraticCurveTo(0, 0.06, 0.145, 0);
  brimShape.quadraticCurveTo(0.13, 0.18, 0, 0.19);
  brimShape.quadraticCurveTo(-0.13, 0.18, -0.145, 0);
  const brimGeo = new THREE.ExtrudeGeometry(brimShape, {
    depth: 0.018,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.008,
    bevelThickness: 0.008,
  });
  brimGeo.rotateX(Math.PI / 2 + 0.12);
  const capBrim = new THREE.Mesh(brimGeo, capMat);
  capBrim.position.set(0, 0.245, 0.08);
  head.add(capBrim);

  body.add(head);

  group.add(createContactShadowDisc(0.78));
  return { group, leftLeg, rightLeg, leftArm, rightArm, head, body };
}

export interface CourierCarRig {
  group: THREE.Group;
  bodyPivot: THREE.Group;
  wheels: THREE.Mesh[];
  frontLeftPivot: THREE.Group;
  frontRightPivot: THREE.Group;
  brakeLightMat: THREE.MeshStandardMaterial;
}

export function createCourierCarGroup(): CourierCarRig {
  const group = new THREE.Group();
  const bodyPivot = new THREE.Group();
  group.add(bodyPivot);

  const paintMat = new THREE.MeshPhysicalMaterial({
    color: 0xcc7631,
    roughness: 0.24,
    metalness: 0.28,
    clearcoat: 0.92,
    clearcoatRoughness: 0.1,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x222528, roughness: 0.65, metalness: 0.38 });
  const interiorMat = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.85, metalness: 0.08 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xdde1e4, roughness: 0.18, metalness: 0.92 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x5c7f94,
    roughness: 0.08,
    metalness: 0.22,
    clearcoat: 1.0,
    transparent: true,
    opacity: 0.68,
  });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x191b1d, roughness: 0.88, metalness: 0.06 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd6dade, roughness: 0.22, metalness: 0.9 });
  const caliperMat = new THREE.MeshStandardMaterial({ color: 0xb82924, roughness: 0.4, metalness: 0.3 });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfff5d6,
    emissive: 0xffd584,
    emissiveIntensity: 1.45,
    roughness: 0.12,
  });
  const indicatorMat = new THREE.MeshStandardMaterial({
    color: 0xe6841c,
    emissive: 0xc26512,
    emissiveIntensity: 0.5,
    roughness: 0.22,
  });
  const brakeLightMat = new THREE.MeshStandardMaterial({
    color: 0xa62020,
    emissive: 0xd92626,
    emissiveIntensity: 0.55,
    roughness: 0.22,
  });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x9b7447, roughness: 0.82, metalness: 0.04 });
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xc6b48c, roughness: 0.9 });

  // Sculpted beveled side-profile estate / Baltic courier wagon silhouette
  const profile = new THREE.Shape();
  profile.moveTo(-2.12, 0.34);
  profile.lineTo(2.12, 0.34);
  profile.lineTo(2.18, 0.74);
  profile.lineTo(1.12, 0.94);
  profile.lineTo(0.56, 1.48);
  profile.lineTo(-1.38, 1.48);
  profile.lineTo(-1.95, 0.98);
  profile.lineTo(-2.14, 0.72);
  profile.closePath();

  const bodyGeo = new THREE.ExtrudeGeometry(profile, {
    depth: 1.78,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.08,
    bevelThickness: 0.08,
  });
  bodyGeo.translate(0, 0, -0.89);
  bodyGeo.rotateY(-Math.PI / 2); // +Z forward
  const chassis = new THREE.Mesh(bodyGeo, paintMat);
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  bodyPivot.add(chassis);

  // Cabin Interior Silhouette (dashboard, seats + headrests, steering wheel visible behind glass)
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.22, 0.36), interiorMat);
  dash.position.set(0, 1.0, 0.62);
  bodyPivot.add(dash);

  const steeringWheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 8, 16), trimMat);
  steeringWheel.position.set(0.38, 1.12, 0.42);
  steeringWheel.rotation.x = 0.42;
  bodyPivot.add(steeringWheel);

  for (const sx of [-0.42, 0.42]) {
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.14), interiorMat);
    seatBack.position.set(sx, 1.14, -0.05);
    seatBack.rotation.x = -0.16;
    bodyPivot.add(seatBack);

    const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.11), interiorMat);
    headrest.position.set(sx, 1.44, -0.11);
    bodyPivot.add(headrest);
  }
  const rearBench = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.46, 0.15), interiorMat);
  rearBench.position.set(0, 1.14, -0.82);
  rearBench.rotation.x = -0.15;
  bodyPivot.add(rearBench);

  // Cabin glass wrapping cleanly outside upper beveled greenhouse
  const sideGlassGeo = new THREE.BoxGeometry(1.98, 0.36, 1.66);
  const glassBand = new THREE.Mesh(sideGlassGeo, glassMat);
  glassBand.position.set(0, 1.24, -0.38);
  bodyPivot.add(glassBand);

  for (const pz of [-1.18, -0.34, 0.42]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.38, 0.1), trimMat);
    pillar.position.set(0, 1.24, pz);
    bodyPivot.add(pillar);
  }

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.54, 0.1), glassMat);
  windshield.position.set(0, 1.23, 0.84);
  windshield.rotation.x = -0.78;
  bodyPivot.add(windshield);

  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.56, 0.14), glassMat);
  rearGlass.position.set(0, 1.23, -1.68);
  rearGlass.rotation.x = 0.78;
  bodyPivot.add(rearGlass);

  // Semicircular wheel arch flares aligned cleanly in the YZ plane over each wheel
  const flareGeo = new THREE.TorusGeometry(0.43, 0.055, 8, 16, Math.PI);
  flareGeo.rotateY(Math.PI / 2);
  for (const [fx, fz] of [
    [-0.96, 1.32],
    [0.96, 1.32],
    [-0.96, -1.28],
    [0.96, -1.28],
  ]) {
    const flare = new THREE.Mesh(flareGeo, trimMat);
    flare.position.set(fx, 0.37, fz);
    bodyPivot.add(flare);
  }

  for (const sx of [-0.95, 0.95]) {
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 1.85), trimMat);
    sill.position.set(sx, 0.36, 0.02);
    bodyPivot.add(sill);

    // Door handles
    for (const hz of [0.22, -0.58]) {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.16), chromeMat);
      handle.position.set(sx * 1.02, 0.88, hz);
      bodyPivot.add(handle);
    }
  }

  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.2, 0.24), trimMat);
  frontBumper.position.set(0, 0.4, 2.15);
  bodyPivot.add(frontBumper);
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.2, 0.24), trimMat);
  rearBumper.position.set(0, 0.4, -2.14);
  bodyPivot.add(rearBumper);

  // Dual chrome exhaust pipes under rear bumper
  const pipeGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.18, 10);
  pipeGeo.rotateX(Math.PI / 2);
  for (const ex of [-0.62, -0.48]) {
    const tailpipe = new THREE.Mesh(pipeGeo, chromeMat);
    tailpipe.position.set(ex, 0.32, -2.24);
    bodyPivot.add(tailpipe);
  }

  // Multi-slat grille bezel
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.22, 0.08), chromeMat);
  grille.position.set(0, 0.63, 2.18);
  bodyPivot.add(grille);

  const grilleInset = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.16, 0.09),
    new THREE.MeshStandardMaterial({ color: 0x16181a, roughness: 0.75, metalness: 0.25 })
  );
  grilleInset.position.set(0, 0.63, 2.19);
  bodyPivot.add(grilleInset);

  for (const gy of [0.59, 0.63, 0.67]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.018, 0.1), chromeMat);
    slat.position.set(0, gy, 2.195);
    bodyPivot.add(slat);
  }

  // Wing side mirrors & Latvian LV license plates front and rear
  for (const sx of [-1.05, 1.05]) {
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.06), trimMat);
    stalk.position.set(sx * 0.96, 1.02, 0.56);
    bodyPivot.add(stalk);
    const mirrorCap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.1), paintMat);
    mirrorCap.position.set(sx * 1.03, 1.04, 0.54);
    bodyPivot.add(mirrorCap);
  }
  const plateMat = new THREE.MeshStandardMaterial({
    map: createLicensePlateTexture('LV · RN-2026'),
    roughness: 0.42,
    metalness: 0.12,
  });
  const frontPlate = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.03), plateMat);
  frontPlate.position.set(0, 0.4, 2.275);
  bodyPivot.add(frontPlate);
  const rearPlate = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.03), plateMat);
  rearPlate.position.set(0, 0.58, -2.23);
  bodyPivot.add(rearPlate);

  // Roof rails + slatted courier parcel crate + cross ropes + whip antenna
  for (const rx of [-0.66, 0.66]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 1.65), trimMat);
    rail.position.set(rx, 1.59, -0.42);
    bodyPivot.add(rail);
  }
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.34, 0.92), crateMat);
  crate.position.set(0, 1.74, -0.45);
  crate.castShadow = true;
  bodyPivot.add(crate);

  for (const sz of [-0.65, -0.45, -0.25]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.04, 0.06), trimMat);
    slat.position.set(0, 1.91, sz);
    bodyPivot.add(slat);
  }
  const ropeCross1 = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.37, 0.045), ropeMat);
  ropeCross1.position.set(0, 1.74, -0.62);
  bodyPivot.add(ropeCross1);
  const ropeCross2 = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.37, 0.045), ropeMat);
  ropeCross2.position.set(0, 1.74, -0.28);
  bodyPivot.add(ropeCross2);

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.85, 6), trimMat);
  antenna.position.set(0.72, 1.9, -1.25);
  antenna.rotation.x = -0.18;
  bodyPivot.add(antenna);

  // Recessed Headlight Reflectors + Projectors + Amber Indicators + Reactive Tail Lamps
  const hlBezelGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.07, 14);
  hlBezelGeo.rotateX(Math.PI / 2);
  const hlGeo = new THREE.CylinderGeometry(0.115, 0.115, 0.09, 14);
  hlGeo.rotateX(Math.PI / 2);
  for (const sx of [-0.68, 0.68]) {
    const bezel = new THREE.Mesh(hlBezelGeo, chromeMat);
    bezel.position.set(sx, 0.66, 2.16);
    bodyPivot.add(bezel);

    const hl = new THREE.Mesh(hlGeo, headlightMat);
    hl.position.set(sx, 0.66, 2.175);
    bodyPivot.add(hl);

    const ind = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.09), indicatorMat);
    ind.position.set(sx + Math.sign(sx) * 0.18, 0.66, 2.16);
    bodyPivot.add(ind);

    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.1), brakeLightMat);
    tl.position.set(sx, 0.68, -2.22);
    bodyPivot.add(tl);

    const rearInd = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.105), indicatorMat);
    rearInd.position.set(sx + Math.sign(sx) * 0.16, 0.68, -2.22);
    bodyPivot.add(rearInd);
  }

  // Wheels + 5-Spoke Alloy Hubs + Stationary Red Brake Calipers
  const tireGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.25, 24);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.26, 16);
  rimGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.29, 10);
  hubGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.275, 0.036, 0.39);
  const caliperGeo = new THREE.BoxGeometry(0.12, 0.16, 0.12);

  const wheels: THREE.Mesh[] = [];
  const makeWheel = () => {
    const w = new THREE.Mesh(tireGeo, tireMat);
    w.castShadow = true;
    w.add(new THREE.Mesh(rimGeo, rimMat));
    w.add(new THREE.Mesh(hubGeo, trimMat));
    for (let si = 0; si < 3; si++) {
      const sp = new THREE.Mesh(spokeGeo, rimMat);
      sp.rotation.x = (si * Math.PI) / 3;
      w.add(sp);
    }
    wheels.push(w);
    return w;
  };

  const frontLeftPivot = new THREE.Group();
  frontLeftPivot.position.set(-0.96, 0.37, 1.32);
  frontLeftPivot.add(makeWheel());
  const flCal = new THREE.Mesh(caliperGeo, caliperMat);
  flCal.position.set(0.03, 0.06, -0.14);
  frontLeftPivot.add(flCal);
  group.add(frontLeftPivot);

  const frontRightPivot = new THREE.Group();
  frontRightPivot.position.set(0.96, 0.37, 1.32);
  frontRightPivot.add(makeWheel());
  const frCal = new THREE.Mesh(caliperGeo, caliperMat);
  frCal.position.set(-0.03, 0.06, -0.14);
  frontRightPivot.add(frCal);
  group.add(frontRightPivot);

  const rl = makeWheel();
  rl.position.set(-0.96, 0.37, -1.28);
  group.add(rl);
  const rlCal = new THREE.Mesh(caliperGeo, caliperMat);
  rlCal.position.set(-0.93, 0.43, -1.14);
  group.add(rlCal);

  const rr = makeWheel();
  rr.position.set(0.96, 0.37, -1.28);
  group.add(rr);
  const rrCal = new THREE.Mesh(caliperGeo, caliperMat);
  rrCal.position.set(0.93, 0.43, -1.14);
  group.add(rrCal);

  group.add(createContactShadowDisc(2.75));
  return { group, bodyPivot, wheels, frontLeftPivot, frontRightPivot, brakeLightMat };
}

export interface CanoeRig {
  group: THREE.Group;
  paddleGroup: THREE.Group;
}

export function createCanoeGroup(): CanoeRig {
  const group = new THREE.Group();

  const hullMat = new THREE.MeshPhysicalMaterial({
    color: 0x8f562e,
    roughness: 0.4,
    metalness: 0.08,
    clearcoat: 0.78,
    clearcoatRoughness: 0.2,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x452b18, roughness: 0.75, metalness: 0.05 });
  const caneMat = new THREE.MeshStandardMaterial({ color: 0xc2a470, roughness: 0.85, metalness: 0.02 });
  const vestMat = new THREE.MeshStandardMaterial({ color: 0xd9612b, roughness: 0.65, metalness: 0.04 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xc29e53, roughness: 0.28, metalness: 0.8 });

  // Tapered canoe hull profile extruded
  const shape = new THREE.Shape();
  shape.moveTo(0, 2.35);
  shape.quadraticCurveTo(0.68, 1.1, 0.62, 0);
  shape.quadraticCurveTo(0.68, -1.1, 0, -2.35);
  shape.quadraticCurveTo(-0.68, -1.1, -0.62, 0);
  shape.quadraticCurveTo(-0.68, 1.1, 0, 2.35);

  const hullGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.44,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.08,
    bevelThickness: 0.12,
  });
  hullGeo.rotateX(Math.PI / 2);
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.position.y = 0.46;
  hull.castShadow = true;
  group.add(hull);

  // Curved cedar gunwale rim rails along port & starboard edges
  for (const side of [-1, 1]) {
    const gunwaleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.56, 2.34),
      new THREE.Vector3(side * 0.48, 0.52, 1.25),
      new THREE.Vector3(side * 0.64, 0.50, 0),
      new THREE.Vector3(side * 0.48, 0.52, -1.25),
      new THREE.Vector3(0, 0.56, -2.34),
    ]);
    const gunwale = new THREE.Mesh(new THREE.TubeGeometry(gunwaleCurve, 24, 0.036, 8, false), trimMat);
    group.add(gunwale);
  }

  // Cane-woven seats, cedar ribs & carry thwarts
  const seatFrameGeo = new THREE.BoxGeometry(0.92, 0.06, 0.30);
  const caneInsertGeo = new THREE.BoxGeometry(0.76, 0.068, 0.22);
  for (const sz of [0.65, -0.65]) {
    const sf = new THREE.Mesh(seatFrameGeo, trimMat);
    sf.position.set(0, 0.48, sz);
    group.add(sf);
    const cane = new THREE.Mesh(caneInsertGeo, caneMat);
    cane.position.set(0, 0.485, sz);
    group.add(cane);
  }

  for (let ri = -3; ri <= 3; ri++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(1.04 - Math.abs(ri) * 0.12, 0.05, 0.06), trimMat);
    rib.position.set(0, 0.44, ri * 0.42);
    group.add(rib);
  }
  const centerThwart = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.05, 0.14), trimMat);
  centerThwart.position.set(0, 0.5, 0.05);
  group.add(centerThwart);

  // Stowed life vest resting on bow seat
  const lifeVest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 0.38), vestMat);
  lifeVest.position.set(0, 0.55, 0.72);
  lifeVest.rotation.y = 0.14;
  group.add(lifeVest);

  // Bow & stern brass stem caps
  const capGeo = new THREE.ConeGeometry(0.14, 0.22, 8);
  const bow = new THREE.Mesh(capGeo, brassMat);
  bow.position.set(0, 0.58, 2.28);
  group.add(bow);
  const stern = new THREE.Mesh(capGeo, brassMat);
  stern.position.set(0, 0.58, -2.28);
  group.add(stern);

  // Seated paddler torso + life jacket + head + brim cap
  const paddler = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.2, 0.35, 6, 10),
    new THREE.MeshStandardMaterial({ color: 0xc26334, roughness: 0.72 })
  );
  paddler.position.set(0, 0.82, -0.2);
  group.add(paddler);

  const paddlerVest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.36), vestMat);
  paddlerVest.position.set(0, 0.85, -0.2);
  group.add(paddlerVest);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0xe3b899, roughness: 0.65 })
  );
  head.position.set(0, 1.24, -0.2);
  group.add(head);

  const paddlerCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.168, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ color: 0x233529, roughness: 0.7 })
  );
  paddlerCap.position.set(0, 1.27, -0.2);
  group.add(paddlerCap);

  // Animated sculpted oak paddle with contoured tapered blades
  const paddleGroup = new THREE.Group();
  paddleGroup.position.set(0, 0.9, 0.1);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.35, 10), trimMat);
  shaft.rotation.z = Math.PI / 2;
  paddleGroup.add(shaft);

  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, -0.04);
  bladeShape.quadraticCurveTo(0.24, -0.10, 0.44, -0.075);
  bladeShape.quadraticCurveTo(0.48, 0, 0.44, 0.075);
  bladeShape.quadraticCurveTo(0.24, 0.10, 0, 0.04);
  bladeShape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.024,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.006,
    bevelThickness: 0.006,
  });
  bladeGeo.translate(0, 0, -0.012);

  const bL = new THREE.Mesh(bladeGeo, hullMat);
  bL.position.set(-0.98, 0, 0);
  bL.rotation.z = Math.PI;
  paddleGroup.add(bL);

  const bR = new THREE.Mesh(bladeGeo, hullMat);
  bR.position.set(0.98, 0, 0);
  paddleGroup.add(bR);
  group.add(paddleGroup);

  return { group, paddleGroup };
}

export function createRendaChurchGroup(
  wallMat: THREE.Material,
  roofMat: THREE.Material,
  spireMat: THREE.Material,
  totalLength = 35.5,
  naveWidth = 12.4,
  spireTotalH = 26.43,
  archMats?: ArchTrimMaterialBundle
): THREE.Group {
  const group = new THREE.Group();
  const stoneMat = archMats?.stonePlinthMat ?? new THREE.MeshStandardMaterial({ color: 0x6f6b62, roughness: 0.92, metalness: 0.04 });
  const graniteCapMat = archMats?.graniteStepMat ?? new THREE.MeshStandardMaterial({ color: 0x938f84, roughness: 0.86, metalness: 0.04 });
  const winMat = archMats?.windowGlassMat ?? new THREE.MeshStandardMaterial({
    color: 0x223340,
    emissive: 0x3b2c1a,
    emissiveIntensity: 0.16,
    roughness: 0.14,
    metalness: 0.45,
  });
  const louverMat = new THREE.MeshStandardMaterial({ color: 0x26282a, roughness: 0.72, metalness: 0.15 });
  const slatMat = new THREE.MeshStandardMaterial({ color: 0x46484b, roughness: 0.68, metalness: 0.12 });
  const doorMat = archMats?.woodDoorMat ?? new THREE.MeshStandardMaterial({ color: 0x9b6836, roughness: 0.68, metalness: 0.05 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x222528, roughness: 0.38, metalness: 0.72 });
  const copperOrbMat = new THREE.MeshStandardMaterial({ color: 0x7a5c3c, roughness: 0.32, metalness: 0.78 });
  const trimMat = archMats
    ? (() => {
        const m = archMats.woodFrameMat.clone();
        m.color.setHex(0xf2ede2);
        return m;
      })()
    : new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.62 });
  const zincMat = archMats?.zincRidgeMat ?? new THREE.MeshStandardMaterial({ color: 0x52585e, roughness: 0.4, metalness: 0.64 });

  // Local +X = East (polygonal apse), -X = West (belltower)
  const towerSize = Math.max(4.8, Math.min(6.2, naveWidth * 0.48));
  const apseLen = Math.max(4.8, totalLength * 0.19);
  const naveLen = Math.max(16, totalLength - towerSize * 0.7 - apseLen * 0.6);
  const naveCenterX = -towerSize * 0.15;
  const westTowerX = naveCenterX - naveLen * 0.5 - towerSize * 0.25;
  const eastApseX = naveCenterX + naveLen * 0.5 + apseLen * 0.25;

  // LGIA LiDAR proportions: ~6.0m plastered nave walls, ~5.3m steep clay gable, ~26.43m octagonal spire
  const wallH = 6.0;
  const roofH = 5.3;
  const plinthTop = 0.52;

  // Stepped fieldstone foundation plinth (-1.45m below grade to +0.52m above) [children[0]]
  const plinthGeo = applyMetricTriplanarUvAndUv2(
    new THREE.BoxGeometry(naveLen + 1.1, 1.95, naveWidth + 0.9),
    BUILDING_UV_METER_SCALE
  );
  const plinth = new THREE.Mesh(plinthGeo, stoneMat);
  plinth.position.set(naveCenterX, plinthTop - 0.97, 0);
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  group.add(plinth);

  // Main nave [children[1] -> interactable wallMesh]
  const naveGeo = applyMetricTriplanarUvAndUv2(
    new THREE.BoxGeometry(naveLen, wallH, naveWidth),
    BUILDING_UV_METER_SCALE
  );
  const nave = new THREE.Mesh(naveGeo, wallMat);
  nave.position.set(naveCenterX, plinthTop + wallH * 0.5, 0);
  nave.castShadow = true;
  nave.receiveShadow = true;
  group.add(nave);

  // Pitched nave gable roof oriented along X [children[2] -> interactable roofMesh]
  const roofShape = new THREE.Shape();
  const halfW = naveWidth * 0.5 + 0.55;
  roofShape.moveTo(-halfW, 0);
  roofShape.lineTo(0, roofH);
  roofShape.lineTo(halfW, 0);
  roofShape.closePath();
  const naveRoofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: naveLen + 0.9, bevelEnabled: false });
  naveRoofGeo.translate(0, 0, -(naveLen + 0.9) * 0.5);
  naveRoofGeo.rotateY(Math.PI / 2);
  applyMetricTriplanarUvAndUv2(naveRoofGeo, BUILDING_UV_METER_SCALE);
  const naveRoof = new THREE.Mesh(naveRoofGeo, roofMat);
  naveRoof.position.set(naveCenterX, plinthTop + wallH - 0.02, 0);
  naveRoof.castShadow = true;
  group.add(naveRoof);

  // West & East plastered gable tympanum walls + sloping white moulded rake cornices (church.jpg)
  const gableWallShape = new THREE.Shape();
  gableWallShape.moveTo(-naveWidth * 0.5, 0);
  gableWallShape.lineTo(0, roofH - 0.04);
  gableWallShape.lineTo(naveWidth * 0.5, 0);
  gableWallShape.closePath();
  const gableGeo = new THREE.ExtrudeGeometry(gableWallShape, { depth: 0.32, bevelEnabled: false });
  gableGeo.translate(0, 0, -0.16);
  gableGeo.rotateY(Math.PI / 2);
  applyMetricTriplanarUvAndUv2(gableGeo, BUILDING_UV_METER_SCALE);

  for (const gx of [naveCenterX - naveLen * 0.5 + 0.16, naveCenterX + naveLen * 0.5 - 0.16]) {
    const gw = new THREE.Mesh(gableGeo, wallMat);
    gw.position.set(gx, plinthTop + wallH - 0.04, 0);
    gw.castShadow = true;
    group.add(gw);
  }

  // Moulded sloping rake cornices & corner pilasters on the West nave facade flanking the belltower
  const rakeLen = Math.hypot(halfW, roofH);
  const rakeAng = Math.atan2(roofH, halfW);
  const westNaveFaceX = naveCenterX - naveLen * 0.5 - 0.08;
  for (const side of [-1, 1]) {
    const rake = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, rakeLen), trimMat);
    rake.position.set(westNaveFaceX - 0.05, plinthTop + wallH + roofH * 0.5, side * halfW * 0.5);
    rake.rotation.x = side * rakeAng;
    group.add(rake);

    // Corner pilasters on West nave corners
    const wPil = new THREE.Mesh(new THREE.BoxGeometry(0.32, wallH + 0.1, 0.48), trimMat);
    wPil.position.set(westNaveFaceX, plinthTop + wallH * 0.5, side * (naveWidth * 0.5 - 0.16));
    group.add(wPil);
  }

  // Polygonal Eastern Apse + Chancel Window
  const apseBodyGeo = applyMetricTriplanarUvAndUv2(
    new THREE.CylinderGeometry(naveWidth * 0.42, naveWidth * 0.44, wallH + 1.2, 6),
    BUILDING_UV_METER_SCALE
  );
  const apseBody = new THREE.Mesh(apseBodyGeo, wallMat);
  apseBody.position.set(eastApseX, plinthTop - 0.4 + wallH * 0.5, 0);
  apseBody.castShadow = true;
  apseBody.receiveShadow = true;
  group.add(apseBody);

  const apseRoofGeo = applyMetricTriplanarUvAndUv2(
    new THREE.ConeGeometry(naveWidth * 0.46, roofH * 0.84, 6),
    BUILDING_UV_METER_SCALE
  );
  const apseRoof = new THREE.Mesh(apseRoofGeo, roofMat);
  apseRoof.position.set(eastApseX, plinthTop + wallH + roofH * 0.41, 0);
  apseRoof.castShadow = true;
  group.add(apseRoof);

  // Eastern Chancel arched window
  const eastWinX = eastApseX + naveWidth * 0.42;
  const eastFrame = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.55, 1.24), trimMat);
  eastFrame.position.set(eastWinX, plinthTop + wallH * 0.52, 0);
  group.add(eastFrame);
  const eastGlass = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.32, 0.98), winMat);
  eastGlass.position.set(eastWinX + 0.02, plinthTop + wallH * 0.52, 0);
  group.add(eastGlass);

  // Square West Belltower base (aligned with OSM 1372184084) + Fieldstone plinth collar
  const lowerTowerTop = 12.6;
  const towerPlinthGeo = applyMetricTriplanarUvAndUv2(
    new THREE.BoxGeometry(towerSize + 0.42, 1.5, towerSize + 0.42),
    BUILDING_UV_METER_SCALE
  );
  const towerPlinth = new THREE.Mesh(towerPlinthGeo, stoneMat);
  towerPlinth.position.set(westTowerX, -0.25, 0);
  towerPlinth.receiveShadow = true;
  group.add(towerPlinth);

  const towerGeo = applyMetricTriplanarUvAndUv2(
    new THREE.BoxGeometry(towerSize, lowerTowerTop + 1.0, towerSize),
    BUILDING_UV_METER_SCALE
  );
  const tower = new THREE.Mesh(towerGeo, wallMat);
  tower.position.set(westTowerX, (lowerTowerTop - 1.0) * 0.5, 0);
  tower.castShadow = true;
  tower.receiveShadow = true;
  group.add(tower);

  // Stone entry steps + Deep recessed West Portal with oak double doors, strap hinges & spoked fanlight (church.jpg)
  const westFaceX = westTowerX - towerSize * 0.5;
  for (let st = 0; st < 3; st++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.55 + st * 0.45, 0.2, 3.1 - st * 0.25), graniteCapMat);
    step.position.set(westFaceX - 0.35 - (2 - st) * 0.28, 0.1 + st * 0.16, 0);
    step.receiveShadow = true;
    group.add(step);
  }

  const portalTrim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.65, 2.55), trimMat);
  portalTrim.position.set(westFaceX - 0.08, 1.75, 0);
  group.add(portalTrim);

  const portalArchOuter = new THREE.Mesh(
    new THREE.CylinderGeometry(1.27, 1.27, 0.42, 14, 1, false, 0, Math.PI),
    trimMat
  );
  portalArchOuter.rotation.z = Math.PI / 2;
  portalArchOuter.rotation.x = Math.PI / 2;
  portalArchOuter.position.set(westFaceX - 0.08, 3.05, 0);
  group.add(portalArchOuter);

  const portalDoor = new THREE.Mesh(new THREE.BoxGeometry(0.46, 2.42, 1.95), doorMat);
  portalDoor.position.set(westFaceX - 0.1, 1.65, 0);
  group.add(portalDoor);

  // Center door stile, wrought-iron strap hinges & brass ring pulls
  const doorStile = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.42, 0.08), ironMat);
  doorStile.position.set(westFaceX - 0.11, 1.65, 0);
  group.add(doorStile);
  for (const hy of [1.05, 2.25]) {
    for (const hz of [-0.72, 0.72]) {
      const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.51, 0.07, 0.42), ironMat);
      hinge.position.set(westFaceX - 0.11, hy, hz);
      group.add(hinge);
    }
  }

  // Semicircular glass fanlight above doors with radial muntin spokes
  const fanlight = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 0.95, 0.47, 12, 1, false, 0, Math.PI),
    winMat
  );
  fanlight.rotation.z = Math.PI / 2;
  fanlight.rotation.x = Math.PI / 2;
  fanlight.position.set(westFaceX - 0.1, 2.9, 0);
  group.add(fanlight);
  for (const ang of [-0.65, 0, 0.65]) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.92, 0.05), doorMat);
    spoke.position.set(westFaceX - 0.11, 3.3, Math.sin(ang) * 0.38);
    spoke.rotation.x = ang;
    group.add(spoke);
  }

  // Warm wall lanterns flanking West portal
  for (const lz of [-1.55, 1.55]) {
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), winMat);
    lantern.position.set(westFaceX - 0.25, 2.55, lz);
    group.add(lantern);
  }

  // Arched upper tower louver window above west entry (per church.jpg)
  const towerWinFrame = new THREE.Mesh(new THREE.BoxGeometry(0.26, 2.45, 1.38), trimMat);
  towerWinFrame.position.set(westFaceX - 0.04, 8.2, 0);
  group.add(towerWinFrame);
  const towerWin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.25, 1.15), louverMat);
  towerWin.position.set(westFaceX - 0.05, 8.2, 0);
  group.add(towerWin);
  for (let si = -3; si <= 3; si++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 1.12), slatMat);
    slat.position.set(westFaceX - 0.06, 8.15 + si * 0.28, 0);
    group.add(slat);
  }
  const towerArch = new THREE.Mesh(
    new THREE.CylinderGeometry(0.68, 0.68, 0.3, 12, 1, false, 0, Math.PI),
    trimMat
  );
  towerArch.rotation.z = Math.PI / 2;
  towerArch.rotation.x = Math.PI / 2;
  towerArch.position.set(westFaceX - 0.05, 9.42, 0);
  group.add(towerArch);

  // Octagonal plaster belfry stage with cornice, 8 arched louver bays, & visible bell silhouette
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(towerSize * 1.09, 0.38, towerSize * 1.09), trimMat);
  cornice.position.set(westTowerX, lowerTowerTop, 0);
  group.add(cornice);

  const belfryH = 3.85;
  const belfryTop = lowerTowerTop + belfryH;
  const belfryGeo = applyMetricTriplanarUvAndUv2(
    new THREE.CylinderGeometry(towerSize * 0.43, towerSize * 0.46, belfryH, 8),
    BUILDING_UV_METER_SCALE
  );
  const belfry = new THREE.Mesh(belfryGeo, wallMat);
  belfry.position.set(westTowerX, lowerTowerTop + belfryH * 0.5, 0);
  belfry.rotation.y = Math.PI / 8;
  belfry.castShadow = true;
  group.add(belfry);

  const belfryUpperCornice = new THREE.Mesh(
    new THREE.CylinderGeometry(towerSize * 0.47, towerSize * 0.44, 0.28, 8),
    trimMat
  );
  belfryUpperCornice.position.set(westTowerX, belfryTop - 0.08, 0);
  belfryUpperCornice.rotation.y = Math.PI / 8;
  group.add(belfryUpperCornice);

  const belfryRadius = towerSize * 0.435;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const isCardinal = i % 2 === 0;
    const bx = westTowerX + Math.cos(a) * belfryRadius;
    const bz = Math.sin(a) * belfryRadius;
    const vGroup = new THREE.Group();
    vGroup.position.set(bx, lowerTowerTop + belfryH * 0.5, bz);
    vGroup.rotation.y = -a + Math.PI / 2;

    const vFrame = new THREE.Mesh(
      new THREE.BoxGeometry(isCardinal ? 0.96 : 0.72, 2.15, 0.16),
      trimMat
    );
    vGroup.add(vFrame);
    const vRecess = new THREE.Mesh(
      new THREE.BoxGeometry(isCardinal ? 0.78 : 0.54, 1.98, 0.2),
      louverMat
    );
    vGroup.add(vRecess);
    for (let si = -3; si <= 3; si++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(isCardinal ? 0.76 : 0.52, 0.05, 0.24),
        slatMat
      );
      slat.position.y = si * 0.24;
      vGroup.add(slat);
    }
    group.add(vGroup);
  }

  // Dark grey slate/sheet-metal octagonal spire with 8 raised seam ribs (church.jpg)
  const spireH = Math.max(8.5, spireTotalH - belfryTop);
  const spireBaseR = towerSize * 0.49;
  const spireGeo = applyMetricTriplanarUvAndUv2(
    new THREE.ConeGeometry(spireBaseR, spireH, 8),
    BUILDING_UV_METER_SCALE
  );
  const spire = new THREE.Mesh(spireGeo, spireMat);
  spire.position.set(westTowerX, belfryTop + spireH * 0.5, 0);
  spire.rotation.y = Math.PI / 8;
  spire.castShadow = true;
  group.add(spire);

  // Raised standing-seam corner hip battens on the octagonal spire
  const ribLen = Math.hypot(spireBaseR, spireH);
  const ribTilt = Math.atan2(spireBaseR, spireH);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.08, ribLen, 0.08), zincMat);
    rib.position.set(
      westTowerX + Math.cos(a) * (spireBaseR * 0.5),
      belfryTop + spireH * 0.5,
      Math.sin(a) * (spireBaseR * 0.5)
    );
    rib.rotation.y = -a;
    rib.rotation.z = ribTilt;
    group.add(rib);
  }

  // Weathered copper/iron finial orb & wrought-iron cross
  const finialY = belfryTop + spireH;
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), copperOrbMat);
  orb.position.set(westTowerX, finialY + 0.08, 0);
  group.add(orb);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.9, 0.13), ironMat);
  crossV.position.set(westTowerX, finialY + 0.98, 0);
  group.add(crossV);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.98), ironMat);
  crossH.position.set(westTowerX, finialY + 1.35, 0);
  group.add(crossH);

  // Tall recessed arched sanctuary windows + mullions + projecting sills + classical pilasters (church.jpg)
  const winGeo = new THREE.BoxGeometry(1.18, 2.75, 0.18);
  const archCapGeo = new THREE.CylinderGeometry(0.59, 0.59, 0.2, 12);
  archCapGeo.rotateX(Math.PI / 2);
  const frameGeo = new THREE.BoxGeometry(1.44, 2.94, 0.14);
  const archFrameGeo = new THREE.CylinderGeometry(0.72, 0.72, 0.16, 12);
  archFrameGeo.rotateX(Math.PI / 2);
  const sillGeo = new THREE.BoxGeometry(1.58, 0.12, 0.28);
  const vMullGeo = new THREE.BoxGeometry(0.06, 2.95, 0.22);
  const hMullGeo = new THREE.BoxGeometry(1.18, 0.055, 0.22);
  const pilasterGeo = new THREE.BoxGeometry(0.45, wallH + 0.1, 0.22);

  const winCount = 4;
  for (const side of [-1, 1]) {
    for (let wi = 0; wi < winCount; wi++) {
      const wx = naveCenterX + ((wi / (winCount - 1)) - 0.5) * (naveLen * 0.72);
      const wz = side * (naveWidth * 0.5 + 0.04);
      const wy = plinthTop + wallH * 0.5;

      const frame = new THREE.Mesh(frameGeo, trimMat);
      frame.position.set(wx, wy, wz - side * 0.02);
      group.add(frame);

      const archFrame = new THREE.Mesh(archFrameGeo, trimMat);
      archFrame.position.set(wx, wy + 1.44, wz - side * 0.02);
      group.add(archFrame);

      const w = new THREE.Mesh(winGeo, winMat);
      w.position.set(wx, wy, wz);
      group.add(w);

      const arch = new THREE.Mesh(archCapGeo, winMat);
      arch.position.set(wx, wy + 1.38, wz);
      group.add(arch);

      const sill = new THREE.Mesh(sillGeo, graniteCapMat);
      sill.position.set(wx, wy - 1.48, wz + side * 0.05);
      group.add(sill);

      // Window cross muntin grid
      const vm = new THREE.Mesh(vMullGeo, trimMat);
      vm.position.set(wx, wy + 0.25, wz + side * 0.02);
      group.add(vm);
      for (const hy of [-0.55, 0.35, 1.15]) {
        const hm = new THREE.Mesh(hMullGeo, trimMat);
        hm.position.set(wx, wy + hy, wz + side * 0.02);
        group.add(hm);
      }
    }

    // Pilasters flanking nave bays + moulded eave cornice + zinc gutters & downspouts
    for (let pi = 0; pi <= winCount; pi++) {
      const px = naveCenterX + ((pi / winCount) - 0.5) * (naveLen * 0.9);
      const pil = new THREE.Mesh(pilasterGeo, trimMat);
      pil.position.set(px, plinthTop + wallH * 0.5, side * (naveWidth * 0.5 + 0.04));
      group.add(pil);
    }
    const eaveBand = new THREE.Mesh(new THREE.BoxGeometry(naveLen + 0.32, 0.24, 0.26), trimMat);
    eaveBand.position.set(naveCenterX, plinthTop + wallH - 0.08, side * (naveWidth * 0.5 + 0.06));
    group.add(eaveBand);

    const gutter = new THREE.Mesh(new THREE.BoxGeometry(naveLen + 0.6, 0.1, 0.13), zincMat);
    gutter.position.set(naveCenterX, plinthTop + wallH - 0.04, side * (naveWidth * 0.5 + 0.45));
    group.add(gutter);

    for (const dx of [naveCenterX - naveLen * 0.46, naveCenterX + naveLen * 0.46]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, wallH, 6), zincMat);
      pipe.position.set(dx, plinthTop + wallH * 0.5, side * (naveWidth * 0.5 + 0.18));
      group.add(pipe);
    }
  }

  return group;
}

export function createWaterTowerGroup(totalH = 27.49): THREE.Group {
  const g = new THREE.Group();
  // Real Rendas ūdenstornis (water_tower.jpg): 19.2m pale silicate-brick shaft, dark steel utility base shed,
  // dark catwalk balcony, weathered concrete cylinder tank, top guardrail + telecom dishes to ~27.49m LiDAR peak
  const creamBrickMat = new THREE.MeshStandardMaterial({ color: 0xd9d3c5, roughness: 0.84, metalness: 0.03 });
  const basePlinthMat = new THREE.MeshStandardMaterial({ color: 0x7a766c, roughness: 0.9, metalness: 0.04 });
  const shedMat = new THREE.MeshStandardMaterial({ color: 0x2b3033, roughness: 0.65, metalness: 0.35 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x2f3438, roughness: 0.48, metalness: 0.62 });
  const concreteTankMat = new THREE.MeshStandardMaterial({ color: 0x9b978c, roughness: 0.82, metalness: 0.05 });
  const slitMat = new THREE.MeshStandardMaterial({ color: 0x3b4044, roughness: 0.5 });
  const dishMat = new THREE.MeshStandardMaterial({ color: 0xe6eaee, roughness: 0.38, metalness: 0.15 });

  const clampedH = Math.max(21, Math.min(34, totalH));
  const shaftTop = clampedH - 8.2; // ~19.29m at 27.49m
  const tankH = 5.1;
  const tankMidY = shaftTop + 0.25 + tankH * 0.5;
  const tankTop = shaftTop + 0.25 + tankH;

  // Base fieldstone plinth + adjacent dark corrugated utility shed
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.65, 2.85, 1.4, 14), basePlinthMat);
  plinth.position.y = 0.1;
  plinth.receiveShadow = true;
  g.add(plinth);

  const shed = new THREE.Mesh(new THREE.BoxGeometry(5.6, 3.1, 4.2), shedMat);
  shed.position.set(-2.6, 1.35, 0.2);
  shed.castShadow = true;
  shed.receiveShadow = true;
  g.add(shed);

  // Tall silicate-brick cylindrical shaft
  const shaftH = Math.max(12, shaftTop - 0.4);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.22, 2.48, shaftH, 16), creamBrickMat);
  shaft.position.y = 0.4 + shaftH * 0.5;
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  g.add(shaft);

  // Vertical shaft window slits per reference photo
  for (let row = 0; row < 4; row++) {
    const sy = 4.2 + row * ((shaftH - 4.5) / 3.5);
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.35, 0.2), slitMat);
    slit.position.set(0, sy, 2.32);
    g.add(slit);
  }

  // Steel observation/maintenance catwalk balcony below upper concrete tank
  const catwalk = new THREE.Mesh(new THREE.CylinderGeometry(3.45, 3.35, 0.32, 18), steelMat);
  catwalk.position.y = shaftTop;
  catwalk.castShadow = true;
  g.add(catwalk);

  const catwalkRail = new THREE.Mesh(new THREE.CylinderGeometry(3.42, 3.42, 0.92, 18, 1, true), steelMat);
  catwalkRail.position.y = shaftTop + 0.56;
  g.add(catwalkRail);

  // Cylindrical concrete water tank
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(3.02, 3.02, tankH, 18), concreteTankMat);
  tank.position.y = tankMidY;
  tank.castShadow = true;
  g.add(tank);

  // Concrete rim + top steel safety guardrail
  const capRim = new THREE.Mesh(new THREE.CylinderGeometry(3.14, 3.14, 0.26, 18), steelMat);
  capRim.position.y = tankTop + 0.05;
  g.add(capRim);

  const topRail = new THREE.Mesh(new THREE.CylinderGeometry(2.85, 2.85, 0.85, 16, 1, true), steelMat);
  topRail.position.y = tankTop + 0.55;
  g.add(topRail);

  // Slender telecom mast & white microwave dishes reaching exact LiDAR peak
  const mastH = Math.max(1.8, clampedH - tankTop);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, mastH, 8), steelMat);
  mast.position.y = tankTop + mastH * 0.5;
  g.add(mast);

  const dish1 = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.14, 12), dishMat);
  dish1.rotation.z = Math.PI / 2;
  dish1.position.set(0.32, tankTop + mastH * 0.65, 0);
  g.add(dish1);

  const dish2 = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.12, 12), dishMat);
  dish2.rotation.x = Math.PI / 2;
  dish2.position.set(0, tankTop + mastH * 0.45, 0.3);
  g.add(dish2);

  return g;
}

export function createBandstandGroup(): THREE.Group {
  const g = new THREE.Group();
  const timberMat = new THREE.MeshStandardMaterial({ color: 0x9c6e44, roughness: 0.82 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8e4232, roughness: 0.72 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7e796e, roughness: 0.9 });

  const deck = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.9, 8), stoneMat);
  deck.position.y = 0.25;
  deck.receiveShadow = true;
  g.add(deck);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 3.2, 8), timberMat);
    post.position.set(Math.cos(a) * 3.5, 2.1, Math.sin(a) * 3.5);
    post.castShadow = true;
    g.add(post);
  }

  const canopy = new THREE.Mesh(new THREE.ConeGeometry(4.8, 2.1, 8), roofMat);
  canopy.position.y = 4.7;
  canopy.castShadow = true;
  g.add(canopy);
  return g;
}

export function createGateArchGroup(): THREE.Group {
  const g = new THREE.Group();
  const plasterMat = new THREE.MeshStandardMaterial({ color: 0xe8e0cf, roughness: 0.85 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xa44d34, roughness: 0.72 });
  const ridgeMat = new THREE.MeshStandardMaterial({ color: 0x7a3423, roughness: 0.78 });
  const fieldstoneMat = new THREE.MeshStandardMaterial({ color: 0x736f65, roughness: 0.92 });
  const copingMat = new THREE.MeshStandardMaterial({ color: 0x9b9589, roughness: 0.88 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x222528, roughness: 0.45, metalness: 0.65 });
  const paverMat = new THREE.MeshStandardMaterial({ color: 0x9c9689, roughness: 0.9 });
  const soilMat = new THREE.MeshStandardMaterial({ color: 0x453527, roughness: 0.96 });
  const blossomMat = new THREE.MeshStandardMaterial({ color: 0xd14c42, roughness: 0.82 });

  // Stout cylindrical plastered gate pillars + stone bases + neck rings (church.jpg)
  for (const sz of [-1.72, 1.72]) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.68, 0.45, 14), copingMat);
    base.position.set(0, 0.05, sz);
    g.add(base);

    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.58, 3.1, 14), plasterMat);
    pillar.position.set(0, 1.45, sz);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    g.add(pillar);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.16, 14), plasterMat);
    neck.position.set(0, 2.95, sz);
    g.add(neck);
  }

  // Timber lintel beam + clay pantile saddle roof hood with gable ends & ridge tiles (church.jpg)
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.42, 4.65), plasterMat);
  lintel.position.set(0, 3.15, 0);
  lintel.castShadow = true;
  g.add(lintel);

  const hoodShape = new THREE.Shape();
  hoodShape.moveTo(-0.92, 0);
  hoodShape.lineTo(0, 1.12);
  hoodShape.lineTo(0.92, 0);
  hoodShape.closePath();
  const hoodGeo = new THREE.ExtrudeGeometry(hoodShape, { depth: 4.95, bevelEnabled: false });
  hoodGeo.translate(0, 0, -2.475);
  const hood = new THREE.Mesh(hoodGeo, roofMat);
  hood.position.set(0, 3.34, 0);
  hood.castShadow = true;
  g.add(hood);

  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 5.05), ridgeMat);
  ridge.position.set(0, 4.48, 0);
  g.add(ridge);

  // Open scrolled wrought-iron churchyard gate leaves + dry-laid fieldstone wing walls
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.64, 1.32, 14.5), fieldstoneMat);
    wall.position.set(0, 0.42, side * 9.6);
    wall.castShadow = true;
    wall.receiveShadow = true;
    g.add(wall);

    const coping = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.14, 14.5), copingMat);
    coping.position.set(0, 1.12, side * 9.6);
    g.add(coping);

    // Wrought-iron gate leaf with vertical pickets & rails
    const leaf = new THREE.Group();
    leaf.position.set(0.1, 0.25, side * 1.18);
    leaf.rotation.y = side * 0.42;
    for (const ry of [0.22, 1.35]) {
      const hBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.12), ironMat);
      hBar.position.set(0, ry, -side * 0.56);
      leaf.add(hBar);
    }
    for (let pi = 0; pi < 6; pi++) {
      const picket = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.48, 0.04), ironMat);
      picket.position.set(0, 0.85, -side * (0.1 + pi * 0.19));
      leaf.add(picket);
    }
    g.add(leaf);
  }

  // Flagstone paved walkway leading straight from gate to church West portal (+Z in local gate space -> check rotation!)
  // Note: gate in RendaSceneEngine is rotated by (-obb.angle + PI/2), so local +X points straight toward the church door!
  for (let pi = 0; pi < 11; pi++) {
    const paver = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 1.65), paverMat);
    paver.position.set(0.4 + pi * 1.22, 0.04, 0);
    paver.receiveShadow = true;
    g.add(paver);
  }

  // Low stone-edged flowerbeds near the church entrance steps
  for (const side of [-1, 1]) {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.2, 1.55), soilMat);
    bed.position.set(11.4, 0.1, side * 2.75);
    g.add(bed);
    const blossoms = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.22, 1.25), blossomMat);
    blossoms.position.set(11.4, 0.28, side * 2.75);
    g.add(blossoms);
  }

  return g;
}

export function createBusShelterGroup(): THREE.Group {
  const g = new THREE.Group();
  const galvMat = new THREE.MeshStandardMaterial({ color: 0x767f84, roughness: 0.42, metalness: 0.68 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xbdd1d6,
    roughness: 0.12,
    metalness: 0.1,
    clearcoat: 0.9,
    clearcoatRoughness: 0.08,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x4b5357,
    roughness: 0.48,
    metalness: 0.42,
    transparent: true,
    opacity: 0.86,
  });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x825937, roughness: 0.82 });
  const padMat = new THREE.MeshStandardMaterial({ color: 0x8b8880, roughness: 0.92 });
  const binMat = new THREE.MeshStandardMaterial({ color: 0x3b4852, roughness: 0.52, metalness: 0.45 });

  // Concrete paving pad
  const floor = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.24, 2.5), padMat);
  floor.position.y = 0.04;
  floor.receiveShadow = true;
  g.add(floor);

  // Back & side galvanized frame posts
  for (const sx of [-1.85, 0, 1.85]) {
    const backPost = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.048, 2.38, 8), galvMat);
    backPost.position.set(sx, 1.24, -0.92);
    backPost.castShadow = true;
    g.add(backPost);
  }
  for (const sx of [-1.85, 1.85]) {
    const frontPost = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.045, 2.28, 8), galvMat);
    frontPost.position.set(sx, 1.18, 0.68);
    frontPost.castShadow = true;
    g.add(frontPost);
  }

  // Tempered glass rear & side windbreak panels
  const backGlass = new THREE.Mesh(new THREE.BoxGeometry(3.62, 1.98, 0.04), glassMat);
  backGlass.position.set(0, 1.18, -0.92);
  g.add(backGlass);
  for (const sx of [-1.85, 1.85]) {
    const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.92, 1.52), glassMat);
    sideGlass.position.set(sx, 1.16, -0.12);
    g.add(sideGlass);
  }

  // Curved polycarbonate arched canopy roof
  const roofGeo = new THREE.CylinderGeometry(1.18, 1.18, 4.2, 14, 1, true, -Math.PI * 0.42, Math.PI * 0.84);
  roofGeo.rotateZ(Math.PI / 2);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(0, 1.72, -0.06);
  roof.scale.set(1, 0.62, 1.0);
  roof.castShadow = true;
  g.add(roof);

  // Slatted wooden bench & metal waste bin (Ref 3)
  const benchSeat = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.08, 0.48), woodMat);
  benchSeat.position.set(-0.22, 0.56, -0.52);
  g.add(benchSeat);
  for (const lx of [-1.15, 0.72]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.52, 0.44), galvMat);
    leg.position.set(lx, 0.3, -0.52);
    g.add(leg);
  }

  const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.68, 10), binMat);
  bin.position.set(1.42, 0.42, -0.58);
  g.add(bin);

  return g;
}

export function createLandmarkMonument(
  id: string,
  flowOpts?: { widthM?: number; dropM?: number; cascadeTex?: THREE.Texture | null }
): THREE.Group {
  const g = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7b776d, roughness: 0.9, metalness: 0.04 });
  const dolomiteMat = new THREE.MeshStandardMaterial({ color: 0x45433c, roughness: 0.94, metalness: 0.03 });
  const darkDolomiteMat = new THREE.MeshStandardMaterial({ color: 0x2f2e29, roughness: 0.92, metalness: 0.04 });
  const mossRockMat = new THREE.MeshStandardMaterial({ color: 0x576a45, roughness: 0.88, metalness: 0.02 });
  const timberMat = new THREE.MeshStandardMaterial({ color: 0x7d5736, roughness: 0.82, metalness: 0.04 });
  const cascadeMat = new THREE.MeshStandardMaterial({
    color: 0xdff2f7,
    map: flowOpts?.cascadeTex ?? null,
    roughness: 0.22,
    metalness: 0.06,
    transparent: true,
    opacity: 0.9,
  });
  const foamMat = new THREE.MeshStandardMaterial({ color: 0xedf6f8, roughness: 0.42, metalness: 0.04 });

  if (id === 'velna_laiva') {
    // Ancient stone ship burial formation
    for (let i = 0; i < 14; i++) {
      const t = (i / 13) * Math.PI * 2;
      const rx = Math.sin(t) * 2.8;
      const rz = Math.cos(t) * 6.5;
      const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65 + (i % 3) * 0.2, 0), stoneMat);
      boulder.position.set(rx, 0.55, rz);
      boulder.scale.set(1, 1.35, 1);
      boulder.castShadow = true;
      g.add(boulder);
    }
  } else if (id === 'hunting_lodge') {
    return createHuntingLodgeRuinsDetails();
  } else if (id === 'abava_boats') {
    return createAbavaPierDetails();
  } else if (id === 'ivande_rumba' || id === 'valdatu_rumba') {
    // Stepped Devonian dolomite limestone ledge anchored from downstreamElev (y=0) up to dropM
    const widthM = flowOpts?.widthM ?? (id === 'ivande_rumba' ? 11.4 : 9.4);
    const dropM = Math.max(1.35, Math.min(2.6, flowOpts?.dropM ?? (id === 'ivande_rumba' ? 1.85 : 1.55)));
    const halfW = widthM * 0.5;

    // Stratified horizontal Devonian dolomite rock shelves (Ref 2)
    const shelfTiers = [
      { y: 0.15, h: 0.38, z: 1.05, w: widthM + 2.4, d: 3.1, mat: darkDolomiteMat },
      { y: dropM * 0.42, h: 0.34, z: 0.35, w: widthM + 1.8, d: 2.8, mat: dolomiteMat },
      { y: dropM * 0.72, h: 0.32, z: -0.25, w: widthM + 1.4, d: 2.9, mat: darkDolomiteMat },
      { y: dropM - 0.16, h: 0.34, z: -0.75, w: widthM + 0.9, d: 3.2, mat: dolomiteMat },
    ];
    for (const st of shelfTiers) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(st.w, st.h, st.d), st.mat);
      shelf.position.set(0, st.y, st.z);
      shelf.castShadow = true;
      shelf.receiveShadow = true;
      g.add(shelf);
    }

    // Jagged stratified rock ledges & mossy cap plates along waterfall face
    for (let li = -4; li <= 4; li++) {
      const lx = (li / 4) * (halfW + 0.6);
      const tierH = dropM * (0.28 + ((Math.abs(li) * 3) % 4) * 0.14);
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(1.5 + (Math.abs(li) % 2) * 0.6, 0.26, 1.15),
        li % 2 === 0 ? dolomiteMat : darkDolomiteMat
      );
      plate.position.set(lx, tierH, 0.55 + (li % 3) * 0.22);
      plate.rotation.y = (li % 3 - 1) * 0.12;
      g.add(plate);
    }

    // Flat-shaded angular dolomite stepping stones & stratified wing walls tying shelf into banks
    const facetedDolomite = new THREE.DodecahedronGeometry(1, 0);
    for (const [bx, by, bz, sx, sy, sz, isMoss] of [
      [-halfW - 1.4, dropM * 0.45, -0.4, 2.1, 0.72, 1.8, 0],
      [halfW + 1.4, dropM * 0.42, -0.3, 2.0, 0.68, 1.7, 0],
      [-halfW - 2.9, dropM * 0.56, -1.2, 1.9, 0.8, 1.9, 1],
      [halfW + 2.9, dropM * 0.54, -1.0, 1.85, 0.78, 1.8, 1],
      [0.25, dropM - 0.12, -0.6, 1.25, 0.48, 0.95, 0],
      [-2.4, 0.08, 4.1, 0.72, 0.34, 0.62, 0],
      [0.9, 0.06, 4.6, 0.62, 0.28, 0.54, 0],
      [2.9, 0.08, 3.9, 0.78, 0.35, 0.68, 0],
      [-0.8, 0.05, 5.4, 0.55, 0.25, 0.52, 0],
    ] as [number, number, number, number, number, number, number][]) {
      const rock = new THREE.Mesh(facetedDolomite, isMoss ? mossRockMat : darkDolomiteMat);
      rock.position.set(bx, by, bz);
      rock.scale.set(sx, sy, sz);
      rock.rotation.set((bx * 0.3) % 0.25, bz * 0.4, (bz * 0.2) % 0.2);
      rock.castShadow = true;
      rock.receiveShadow = true;
      g.add(rock);
    }

    // Unified wide multi-stream rushing cascades & plunge pool foam rings
    const streamOffsets = [-0.40, -0.27, -0.14, 0.0, 0.14, 0.28, 0.41];
    for (const frac of streamOffsets) {
      const wx = frac * widthM;
      const sheet = new THREE.Mesh(new THREE.CylinderGeometry(widthM * 0.095, widthM * 0.115, dropM + 0.32, 8, 1, false), cascadeMat);
      sheet.scale.set(1, 1, 0.32);
      sheet.position.set(wx, dropM * 0.48, 0.95);
      sheet.rotation.x = 0.42;
      sheet.userData.isWaterfallStream = true;
      g.add(sheet);

      const upperRiffle = new THREE.Mesh(new THREE.BoxGeometry(widthM * 0.18, 0.1, 1.95), cascadeMat);
      upperRiffle.position.set(wx, dropM + 0.02, -0.25);
      upperRiffle.userData.isWaterfallStream = true;
      g.add(upperRiffle);

      const foamSplash = new THREE.Mesh(
        new THREE.CircleGeometry(1.18, 14).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xf4fafc, roughness: 0.35, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false })
      );
      foamSplash.position.set(wx, 0.14, 1.95);
      g.add(foamSplash);

      const foamRing = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1.55, 16).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xf4fafc, roughness: 0.35, transparent: true, opacity: 0.56, side: THREE.DoubleSide, depthWrite: false })
      );
      foamRing.position.set(wx, 0.12, 2.55);
      g.add(foamRing);
    }

    // Rustic wooden viewpoint boardwalk & handrail on the left upper slope (ivande_rumba.jpg)
    const railX = -halfW - 1.65;
    const railDeck = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.14, 5.4), timberMat);
    railDeck.position.set(railX, dropM * 0.72, 0.3);
    railDeck.rotation.x = 0.14;
    g.add(railDeck);
    for (const pz of [-1.8, 0.3, 2.4]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1.5, 6), timberMat);
      post.position.set(railX + 0.55, dropM * 0.72 + 0.55 - pz * 0.12, pz);
      g.add(post);
    }
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 4.6), timberMat);
    topRail.position.set(railX + 0.55, dropM * 0.72 + 1.25, 0.3);
    topRail.rotation.x = 0.14;
    g.add(topRail);
  } else if (id === 'pilskalns') {
    // Wooden hillfort watchtower post & palisade
    const palisade = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 2.2, 12, 1, true), timberMat);
    palisade.position.y = 1.1;
    g.add(palisade);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 6.2, 8), timberMat);
    pole.position.y = 3.1;
    g.add(pole);
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.9, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x8f2c2c, roughness: 0.7 })
    );
    banner.position.set(0.9, 5.4, 0);
    g.add(banner);
  } else {
    // Traditional Latvian wooden trail signboard + stone cairn
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.7, 8), stoneMat);
    base.position.y = 0.35;
    g.add(base);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 2.6, 8), timberMat);
    post.position.y = 1.3;
    g.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.85, 0.14), timberMat);
    board.position.y = 2.2;
    g.add(board);
  }

  return g;
}

export class RendaAudioEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) this.ctx = new Ctor();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playTone(freq: number, duration = 0.14, gainPeak = 0.08, type: OscillatorType = 'triangle'): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playDiscovery(): void {
    this.playTone(523.25, 0.18, 0.09, 'sine');
    setTimeout(() => this.playTone(659.25, 0.22, 0.09, 'sine'), 90);
    setTimeout(() => this.playTone(783.99, 0.34, 0.09, 'triangle'), 180);
  }

  playMissionComplete(): void {
    this.playTone(587.33, 0.16, 0.09, 'triangle');
    setTimeout(() => this.playTone(739.99, 0.16, 0.09, 'triangle'), 100);
    setTimeout(() => this.playTone(880, 0.36, 0.1, 'sine'), 200);
  }

  playStep(): void {
    const jitter = 0.92 + Math.random() * 0.16;
    this.playTone(130 * jitter, 0.06, 0.025, 'sine');
  }

  playPaddle(): void {
    const jitter = 0.9 + Math.random() * 0.2;
    this.playTone(170 * jitter, 0.11, 0.035, 'sine');
  }

  playJump(): void {
    const jitter = 0.94 + Math.random() * 0.12;
    this.playTone(230 * jitter, 0.09, 0.04, 'triangle');
  }

  playLand(): void {
    const jitter = 0.9 + Math.random() * 0.16;
    this.playTone(105 * jitter, 0.07, 0.045, 'sine');
  }

  playModeSwitch(): void {
    this.playTone(392, 0.09, 0.045, 'sine');
    setTimeout(() => this.playTone(523.25, 0.12, 0.045, 'triangle'), 55);
  }

  playGunshot(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Supersonic crack + muzzle blast noise buffer
    const len = Math.floor(ctx.sampleRate * 0.18);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.032));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1450, now);
    filter.frequency.exponentialRampToValueAtTime(320, now + 0.14);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);

    // Low chest thump
    const osc = ctx.createOscillator();
    const oGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(155, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.09);
    oGain.gain.setValueAtTime(0.16, now);
    oGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(oGain);
    oGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playReload(): void {
    this.playTone(310, 0.05, 0.045, 'square');
    setTimeout(() => this.playTone(220, 0.06, 0.05, 'triangle'), 240);
    setTimeout(() => this.playTone(460, 0.07, 0.05, 'square'), 980);
  }

  playDryFire(): void {
    this.playTone(620, 0.028, 0.035, 'square');
  }

  dispose(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
