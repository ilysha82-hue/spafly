import * as THREE from 'three';

export interface ProceduralTexturePack {
  brickDeck: THREE.CanvasTexture;
  honeyWood: THREE.CanvasTexture;
  poolTile: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  glowSprite: THREE.CanvasTexture;
  wingRoundel: THREE.CanvasTexture;
  paintTexture: (baseHex: string, streakHex: string) => THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTexturePack {
  const created: THREE.Texture[] = [];

  const configureColorTex = (tex: THREE.CanvasTexture, repeatX = 1, repeatY = 1) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = Math.min(8, maxAnisotropy || 1);
    tex.needsUpdate = true;
    created.push(tex);
    return tex;
  };

  // 1. Terracotta / golden-ochre brick spa deck
  const brickCanvas = document.createElement('canvas');
  brickCanvas.width = 512;
  brickCanvas.height = 512;
  const bCtx = brickCanvas.getContext('2d')!;
  bCtx.fillStyle = '#8b6a46';
  bCtx.fillRect(0, 0, 512, 512);

  const rows = 16;
  const cols = 8;
  const brickH = 512 / rows;
  const brickW = 512 / cols;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (brickW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * brickW + offset;
      const y = r * brickH;
      const shade = 0.86 + Math.random() * 0.24;
      const red = Math.min(255, Math.round(176 * shade));
      const green = Math.min(255, Math.round(132 * shade));
      const blue = Math.min(255, Math.round(82 * shade));
      bCtx.fillStyle = `rgb(${red},${green},${blue})`;
      bCtx.fillRect(x + 2, y + 2, brickW - 4, brickH - 4);
      // Subtle specular highlight strip
      bCtx.fillStyle = `rgba(255, 224, 175, ${0.06 + Math.random() * 0.08})`;
      bCtx.fillRect(x + 3, y + 3, brickW - 6, 4);
    }
  }
  const brickDeck = configureColorTex(new THREE.CanvasTexture(brickCanvas), 44, 36);

  // 2. Warm honey-pine timber planks for trusses, walls, and pitched roof
  const woodCanvas = document.createElement('canvas');
  woodCanvas.width = 512;
  woodCanvas.height = 512;
  const wCtx = woodCanvas.getContext('2d')!;
  wCtx.fillStyle = '#c8823c';
  wCtx.fillRect(0, 0, 512, 512);
  const plankCount = 8;
  const plankH = 512 / plankCount;
  for (let p = 0; p < plankCount; p++) {
    const py = p * plankH;
    const tone = 0.9 + Math.random() * 0.18;
    wCtx.fillStyle = `rgb(${Math.round(205 * tone)},${Math.round(134 * tone)},${Math.round(62 * tone)})`;
    wCtx.fillRect(0, py + 2, 512, plankH - 3);
    // Grain streaks
    for (let g = 0; g < 18; g++) {
      const gy = py + 4 + Math.random() * (plankH - 8);
      wCtx.fillStyle = `rgba(115, 62, 18, ${0.08 + Math.random() * 0.12})`;
      wCtx.fillRect(0, gy, 512, 1 + Math.random() * 2);
    }
    wCtx.fillStyle = 'rgba(72, 38, 12, 0.45)';
    wCtx.fillRect(0, py, 512, 2);
  }
  const honeyWood = configureColorTex(new THREE.CanvasTexture(woodCanvas), 8, 8);

  // 3. Turquoise mosaic pool tile
  const poolCanvas = document.createElement('canvas');
  poolCanvas.width = 256;
  poolCanvas.height = 256;
  const pCtx = poolCanvas.getContext('2d')!;
  pCtx.fillStyle = '#1b88c9';
  pCtx.fillRect(0, 0, 256, 256);
  const tiles = 8;
  const tSize = 256 / tiles;
  for (let r = 0; r < tiles; r++) {
    for (let c = 0; c < tiles; c++) {
      const v = Math.random();
      pCtx.fillStyle = v > 0.65 ? '#29a6e0' : v > 0.3 ? '#1a85c4' : '#156da8';
      pCtx.fillRect(c * tSize + 2, r * tSize + 2, tSize - 4, tSize - 4);
    }
  }
  const poolTile = configureColorTex(new THREE.CanvasTexture(poolCanvas), 20, 11);

  // 4. Radial soft contact shadow
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sCtx = shadowCanvas.getContext('2d')!;
  const grad = sCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(18, 16, 14, 0.55)');
  grad.addColorStop(0.55, 'rgba(18, 16, 14, 0.25)');
  grad.addColorStop(1, 'rgba(18, 16, 14, 0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 128, 128);
  const contactShadow = configureColorTex(new THREE.CanvasTexture(shadowCanvas), 1, 1);
  contactShadow.wrapS = THREE.ClampToEdgeWrapping;
  contactShadow.wrapT = THREE.ClampToEdgeWrapping;

  // 5. Soft warm chandelier / underwater light glow sprite
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 128;
  glowCanvas.height = 128;
  const gCtx = glowCanvas.getContext('2d')!;
  const glowGrad = gCtx.createRadialGradient(64, 64, 2, 64, 64, 62);
  glowGrad.addColorStop(0, 'rgba(255, 248, 220, 1)');
  glowGrad.addColorStop(0.28, 'rgba(255, 214, 130, 0.65)');
  glowGrad.addColorStop(0.65, 'rgba(255, 175, 70, 0.16)');
  glowGrad.addColorStop(1, 'rgba(255, 150, 40, 0)');
  gCtx.fillStyle = glowGrad;
  gCtx.fillRect(0, 0, 128, 128);
  const glowSprite = configureColorTex(new THREE.CanvasTexture(glowCanvas), 1, 1);
  glowSprite.wrapS = THREE.ClampToEdgeWrapping;
  glowSprite.wrapT = THREE.ClampToEdgeWrapping;

  // 6. Wing Roundel decal (matching Image 1: sky-blue ring + white center + crisp dark rim)
  const roundelCanvas = document.createElement('canvas');
  roundelCanvas.width = 128;
  roundelCanvas.height = 128;
  const rCtx = roundelCanvas.getContext('2d')!;
  rCtx.clearRect(0, 0, 128, 128);
  rCtx.beginPath();
  rCtx.arc(64, 64, 58, 0, Math.PI * 2);
  rCtx.fillStyle = '#6db6d6';
  rCtx.fill();
  rCtx.lineWidth = 4;
  rCtx.strokeStyle = '#1f2328';
  rCtx.stroke();
  rCtx.beginPath();
  rCtx.arc(64, 64, 34, 0, Math.PI * 2);
  rCtx.fillStyle = '#f8f7f2';
  rCtx.fill();
  rCtx.lineWidth = 3;
  rCtx.strokeStyle = '#1f2328';
  rCtx.stroke();
  const wingRoundel = configureColorTex(new THREE.CanvasTexture(roundelCanvas), 1, 1);
  wingRoundel.wrapS = THREE.ClampToEdgeWrapping;
  wingRoundel.wrapT = THREE.ClampToEdgeWrapping;

  // 7. Painterly brush-mottled texture helper for toy plane & character overalls
  const paintCache = new Map<string, THREE.CanvasTexture>();
  const paintTexture = (baseHex: string, streakHex: string): THREE.CanvasTexture => {
    const key = `${baseHex}_${streakHex}`;
    const existing = paintCache.get(key);
    if (existing) return existing;

    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 65; i++) {
      ctx.fillStyle = streakHex;
      ctx.globalAlpha = 0.08 + Math.random() * 0.14;
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      ctx.beginPath();
      ctx.ellipse(x, y, 8 + Math.random() * 18, 3 + Math.random() * 6, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const tex = configureColorTex(new THREE.CanvasTexture(c), 1, 1);
    paintCache.set(key, tex);
    return tex;
  };

  return {
    brickDeck,
    honeyWood,
    poolTile,
    contactShadow,
    glowSprite,
    wingRoundel,
    paintTexture,
    dispose: () => {
      created.forEach((t) => t.dispose());
    },
  };
}
