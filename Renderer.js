import { TILE, MAP_CONFIG } from './data.js';

const S  = MAP_CONFIG.TILE_SIZE;
const CW = MAP_CONFIG.COLS * S;
const CH = MAP_CONFIG.ROWS * S;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.canvas.width  = CW;
    this.canvas.height = CH;
    this.frameCount = 0;

    this._lc = document.createElement('canvas');
    this._lc.width  = CW;
    this._lc.height = CH;
    this._lx = this._lc.getContext('2d');

    this._particles = [];

    this._rng = new Float32Array(512);
    let seed = 0x4A3F2E1D;
    for (let i = 0; i < 512; i++) {
      seed = (Math.imul(seed, 0x6D2B79F5) + 0x14E6B0C3) | 0;
      this._rng[i] = ((seed >>> 16) & 0xFFFF) / 65535;
    }
  }

  _rnd(col, row, offset = 0) {
    return this._rng[((col * 17) ^ (row * 31) ^ (offset * 7)) & 511];
  }

  clear() {
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, CW, CH);
  }

  tick() { this.frameCount++; }

  drawMap(era, completedMachines) {
    const ctx = this.ctx;

    ctx.fillStyle = era.bgColor; ctx.fillRect(0, 0, CW, CH);

    this._drawEraBackground(era);

    this._drawFloorAO(era);

    const map = era.map;
    for (let row = 0; row < map.length; row++) {
      for (let col = 0; col < map[row].length; col++) {
        const tile = map[row][col];
        this._drawTile(tile, col * S, row * S, era, col, row, completedMachines);
      }
    }

    this._drawPortalFields(era);

    this._drawMachineAuras(era, completedMachines);

    this._spawnEraParticles(era);
    this._updateParticles();
    this._drawParticles();

    this._drawLightingPass(era);

    this._drawPostProcessing(era);
  }

  _drawFloorAO(era) {
    const ctx = this.ctx;
    const map = era.map;
    for (let row = 0; row < map.length; row++) {
      for (let col = 0; col < map[row].length; col++) {
        if (map[row][col] !== TILE.FLOOR && map[row][col] !== TILE.DECOR) continue;
        const x = col * S, y = row * S;
        if (map[row - 1]?.[col] === TILE.WALL) {
          const g = ctx.createLinearGradient(x, y, x, y + S * 0.6);
          g.addColorStop(0, 'rgba(0,0,0,0.45)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.fillRect(x, y, S, S);
        }
        if (map[row]?.[col - 1] === TILE.WALL) {
          const g = ctx.createLinearGradient(x, y, x + S * 0.6, y);
          g.addColorStop(0, 'rgba(0,0,0,0.3)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.fillRect(x, y, S, S);
        }
        if (map[row]?.[col + 1] === TILE.WALL) {
          const g = ctx.createLinearGradient(x + S, y, x + S * 0.4, y);
          g.addColorStop(0, 'rgba(0,0,0,0.25)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.fillRect(x, y, S, S);
        }
      }
    }
  }

  _drawLightingPass(era) {
    const lx = this._lx;
    const f  = this.frameCount;

    const ambientDark = {
      workbench:  0.42,
      military:   0.56,
      garage_sv:  0.36,
      corporate:  0.28,
      theater:    0.65,
      datacenter: 0.54,
    }[era.decorType] ?? 0.40;

    lx.clearRect(0, 0, CW, CH);
    lx.fillStyle = `rgba(0,0,0,${ambientDark})`; lx.fillRect(0, 0, CW, CH);

    lx.globalCompositeOperation = 'destination-out';

    const lights = this._getEraLights(era, f);
    for (const lt of lights) {
      const pf = lt.flicker ? Math.sin(f * lt.flicker + (lt.phase || 0)) * 0.08 + 0.92 : 1;
      const r  = lt.r * pf;
      const g  = lx.createRadialGradient(lt.x, lt.y, 0, lt.x, lt.y, r);
      g.addColorStop(0,   `rgba(0,0,0,${lt.i * pf})`);
      g.addColorStop(0.4, `rgba(0,0,0,${lt.i * pf * 0.55})`);
      g.addColorStop(1,   'rgba(0,0,0,0)');
      lx.fillStyle = g; lx.fillRect(0, 0, CW, CH);
    }

    lx.globalCompositeOperation = 'source-over';

    this.ctx.drawImage(this._lc, 0, 0);

    for (const lt of lights) {
      if (!lt.rgb) continue;
      const pf = lt.flicker ? Math.sin(f * lt.flicker + (lt.phase || 0)) * 0.04 + 0.96 : 1;
      const bloom = this.ctx.createRadialGradient(lt.x, lt.y, 0, lt.x, lt.y, lt.r * 0.55);
      bloom.addColorStop(0, `rgba(${lt.rgb},${(lt.bloom || 0.07) * pf})`);
      bloom.addColorStop(1, 'rgba(0,0,0,0)');
      this.ctx.fillStyle = bloom;
      this.ctx.fillRect(0, 0, CW, CH);
    }
  }

  _getEraLights(era, f) {
    const mp = era.machinePos;
    const pp = era.portalPos;
    const lights = [];

    if (mp) {
      const mx = mp.col * S + S / 2, my = mp.row * S + S / 2;
      const glowRgb = this._machineGlowRgb(era.decorType);
      lights.push({ x: mx, y: my, r: 100, i: 0.85, flicker: 0.05, phase: 1.3, rgb: glowRgb, bloom: 0.14 });
    }

    if (pp) {
      const px = pp.col * S + S / 2, py = pp.row * S + S / 2;
      const portalRgb = this._portalGlowRgb(era.decorType);
      lights.push({ x: px, y: py, r: 88, i: 0.8, flicker: 0.09, rgb: portalRgb, bloom: 0.12 });
    }

    switch (era.decorType) {
      case 'workbench':
        lights.push({ x: CW / 2, y: 80, r: 180, i: 0.65, flicker: 0.008, rgb: '255,200,90', bloom: 0.06 });
        lights.push({ x: 20, y: CH * 0.5, r: 60, i: 0.4, rgb: '180,140,60', bloom: 0.03 });
        lights.push({ x: CW - 20, y: CH * 0.5, r: 60, i: 0.4, rgb: '180,140,60', bloom: 0.03 });
        break;

      case 'military':
        lights.push({ x: S * 3, y: S, r: 80, i: 0.5, flicker: 0.04, rgb: '180,160,0', bloom: 0.05 });
        lights.push({ x: S * 11, y: S, r: 80, i: 0.5, flicker: 0.04, phase: 1.8, rgb: '180,160,0', bloom: 0.05 });
        lights.push({ x: CW - S, y: CH * 0.4, r: 55, i: 0.45, flicker: 0.06, phase: 0.3, rgb: '220,60,0', bloom: 0.06 });
        break;

      case 'garage_sv':
        lights.push({ x: 0, y: CH * 0.45, r: 130, i: 0.58, rgb: '200,240,190', bloom: 0.05 });
        lights.push({ x: S, y: CH * 0.7, r: 50, i: 0.35, rgb: '40,200,80', bloom: 0.04 });
        break;

      case 'corporate':
        lights.push({ x: CW * 0.25, y: S, r: 150, i: 0.65, flicker: 0.001, rgb: '180,195,255', bloom: 0.04 });
        lights.push({ x: CW * 0.75, y: S, r: 150, i: 0.65, flicker: 0.001, phase: 3, rgb: '180,195,255', bloom: 0.04 });
        if (Math.sin(f * 0.007) > 0.97) {
          lights.push({ x: CW / 2, y: S, r: 200, i: 0.1, rgb: '200,210,255', bloom: 0.08 });
        }
        break;

      case 'theater':
        lights.push({ x: CW / 2, y: S, r: 200, i: 0.88, flicker: 0.018, rgb: '255,220,140', bloom: 0.12 });
        lights.push({ x: S, y: S * 3, r: 80, i: 0.55, flicker: 0.025, phase: 0.5, rgb: '180,0,220', bloom: 0.07 });
        lights.push({ x: CW - S, y: S * 3, r: 80, i: 0.55, flicker: 0.025, phase: 2.1, rgb: '180,0,220', bloom: 0.07 });
        break;

      case 'datacenter':
        lights.push({ x: S * 3, y: 0, r: 110, i: 0.52, rgb: '0,200,255', bloom: 0.06 });
        lights.push({ x: CW / 2, y: 0, r: 110, i: 0.52, rgb: '0,200,255', bloom: 0.06 });
        lights.push({ x: CW - S * 3, y: 0, r: 110, i: 0.52, rgb: '0,200,255', bloom: 0.06 });
        lights.push({ x: S * 2, y: CH * 0.3, r: 40, i: 0.3, flicker: 0.12, rgb: '0,255,180', bloom: 0.05 });
        lights.push({ x: CW - S * 2, y: CH * 0.6, r: 40, i: 0.3, flicker: 0.15, phase: 1, rgb: '0,255,180', bloom: 0.05 });
        break;
    }

    return lights;
  }

  _machineGlowRgb(decorType) {
    return { workbench: '255,180,80', military: '220,150,0', garage_sv: '40,220,80',
             corporate: '80,140,255', theater: '255,80,80', datacenter: '0,220,255' }[decorType] ?? '255,200,100';
  }

  _portalGlowRgb(decorType) {
    return { workbench: '60,160,255', military: '200,180,0', garage_sv: '0,220,80',
             corporate: '60,120,255', theater: '200,60,220', datacenter: '0,200,255' }[decorType] ?? '100,180,255';
  }

  _drawPostProcessing(era) {
    const ctx = this.ctx;
    const f   = this.frameCount;

    const vig = ctx.createRadialGradient(CW / 2, CH / 2, CW * 0.22, CW / 2, CH / 2, CW * 0.78);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, CW, CH);

    ctx.fillStyle = 'rgba(0,0,0,0.055)';
    for (let y = 0; y < CH; y += 2) ctx.fillRect(0, y, CW, 1);

    if (f % 4 === 0) {
      for (let i = 0; i < 60; i++) {
        const gx = this._rng[(f * 7 + i * 13) & 511] * CW;
        const gy = this._rng[(f * 11 + i * 17) & 511] * CH;
        const ga = this._rng[(f * 3 + i * 5) & 511] * 0.04;
        ctx.fillStyle = `rgba(255,255,255,${ga})`; ctx.fillRect(gx, gy, 1, 1);
      }
    }

    const grade = {
      workbench:  'rgba(40,15,0,0.06)',
      military:   'rgba(10,20,0,0.08)',
      garage_sv:  'rgba(0,20,5,0.06)',
      corporate:  'rgba(0,5,30,0.06)',
      theater:    'rgba(20,0,10,0.08)',
      datacenter: 'rgba(0,10,25,0.08)',
    }[era.decorType];
    if (grade) {
      ctx.fillStyle = grade; ctx.fillRect(0, 0, CW, CH);
    }

    const scanY = ((f * 2) % (CH + 40)) - 20;
    const scanG = ctx.createLinearGradient(0, scanY - 6, 0, scanY + 6);
    scanG.addColorStop(0, 'rgba(255,255,255,0)');
    scanG.addColorStop(0.5, 'rgba(255,255,255,0.025)');
    scanG.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = scanG; ctx.fillRect(0, scanY - 6, CW, 12);
  }

  _drawPortalFields(era) {
    const pp = era.portalPos;
    if (!pp) return;
    const f  = this.frameCount;
    const px = pp.col * S + S / 2;
    const py = pp.row * S + S / 2;
    this._drawPortalAura(px, py, era, f);
  }

  _drawPortalAura(cx, cy, era, f) {
    const ctx = this.ctx;
    const pulse = Math.sin(f * 0.07) * 0.5 + 0.5;
    const rgb   = this._portalGlowRgb(era.decorType);

    const r1 = 24 + pulse * 6;
    const g1 = ctx.createRadialGradient(cx, cy, r1 * 0.5, cx, cy, r1 + 8);
    g1.addColorStop(0, `rgba(${rgb},0)`);
    g1.addColorStop(0.7, `rgba(${rgb},${0.25 + pulse * 0.1})`);
    g1.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g1; ctx.fillRect(cx - r1 - 10, cy - r1 - 10, (r1 + 10) * 2, (r1 + 10) * 2);

    const angle = f * 0.05;
    for (let i = 0; i < 8; i++) {
      const a = angle + i * (Math.PI / 4);
      const r = 17 + Math.sin(f * 0.09 + i) * 3;
      const ox = Math.cos(a) * r, oy = Math.sin(a) * r;
      const alpha = Math.sin(f * 0.08 + i * 0.6) * 0.4 + 0.5;
      ctx.fillStyle = `rgba(${rgb},${alpha})`; ctx.fillRect(cx + ox - 2, cy + oy - 2, 4, 4);
    }

    const r2 = 10 + pulse * 3;
    const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r2);
    g2.addColorStop(0, `rgba(${rgb},${0.5 + pulse * 0.2})`);
    g2.addColorStop(0.5, `rgba(${rgb},${0.2 + pulse * 0.1})`);
    g2.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g2; ctx.fillRect(cx - r2 - 2, cy - r2 - 2, (r2 + 2) * 2, (r2 + 2) * 2);
  }

  _drawMachineAuras(era, completedMachines) {
    const mp = era.machinePos;
    if (!mp) return;
    const done = era.machine && completedMachines.has(era.machine.id);
    const f    = this.frameCount;
    const cx   = mp.col * S + S / 2;
    const cy   = mp.row * S + S / 2;

    if (!done) {
      const pulse = Math.sin(f * 0.08) * 0.5 + 0.5;
      const rgb   = this._machineGlowRgb(era.decorType);

      const g1 = this.ctx.createRadialGradient(cx, cy, 10, cx, cy, 40 + pulse * 8);
      g1.addColorStop(0, `rgba(${rgb},0)`);
      g1.addColorStop(0.6, `rgba(${rgb},${0.15 + pulse * 0.08})`);
      g1.addColorStop(1, `rgba(${rgb},0)`);
      this.ctx.fillStyle = g1;
      this.ctx.fillRect(cx - 52, cy - 52, 104, 104);

      for (let i = 0; i < 5; i++) {
        const a = (f * 0.04 + i * 1.256) % (Math.PI * 2);
        const r = 22 + Math.sin(f * 0.06 + i) * 4;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        const alpha = Math.sin(f * 0.07 + i * 1.2) * 0.4 + 0.5;
        this.ctx.fillStyle = `rgba(${rgb},${alpha})`;
        this.ctx.fillRect(px - 2, py - 2, 4, 4);
      }

      const ealpha = Math.sin(f * 0.12) * 0.5 + 0.5;
      this.ctx.fillStyle = `rgba(255,230,0,${ealpha * 0.9})`;
      this.ctx.fillRect(cx - 10, cy - S / 2 - 12, 20, 9);
      this.ctx.fillStyle = `rgba(20,10,0,${ealpha})`;
      this.ctx.font = 'bold 6px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('[E]', cx, cy - S / 2 - 4);
      this.ctx.textAlign = 'left';

    } else {
      const g = this.ctx.createRadialGradient(cx, cy, 5, cx, cy, 28);
      g.addColorStop(0, 'rgba(0,255,80,0.18)');
      g.addColorStop(1, 'rgba(0,255,80,0)');
      this.ctx.fillStyle = g;
      this.ctx.fillRect(cx - 30, cy - 30, 60, 60);
    }
  }

  _spawnEraParticles(era) {
    if (this._particles.length >= 70) return;
    const f  = this.frameCount;

    switch (era.decorType) {
      case 'workbench':
        if (f % 8 === 0) {
          const x = this._rng[(f * 7) & 511] * CW;
          this._spawnParticle(x, CH * 0.7, (this._rng[(f * 11) & 511] - 0.5) * 0.3,
            -(this._rng[(f * 13) & 511] * 0.4 + 0.1), 120 + (this._rng[(f * 5) & 511] * 80 | 0),
            `rgba(${200 + (this._rng[(f * 17) & 511] * 55 | 0)},${150 + (this._rng[(f * 19) & 511] * 50 | 0)},60,`, 2);
        }
        break;

      case 'military':
        if (f % 12 === 0) {
          const sx = this._rng[(f * 3) & 511] * CW;
          this._spawnParticle(sx, CH * 0.6, (this._rng[(f * 7) & 511] - 0.5) * 0.2,
            -(this._rng[(f * 9) & 511] * 0.3 + 0.05), 80,
            `rgba(${130 + (this._rng[(f * 5) & 511] * 40 | 0)},130,110,`, 3);
        }
        break;

      case 'garage_sv':
        if (f % 6 === 0) {
          const gx = this._rng[(f * 17) & 511] * CW;
          this._spawnParticle(gx, CH * 0.8, 0, -(this._rng[(f * 11) & 511] * 0.8 + 0.2),
            60, 'rgba(40,220,80,', 2);
        }
        break;

      case 'corporate':
        if (f % 18 === 0) {
          const cx2 = this._rng[(f * 23) & 511] * CW;
          this._spawnParticle(cx2, this._rng[(f * 29) & 511] * CH,
            (this._rng[(f * 7) & 511] - 0.5) * 0.4, this._rng[(f * 11) & 511] * 0.3,
            100, 'rgba(240,235,220,', 3);
        }
        break;

      case 'theater':
        if (f % 5 === 0) {
          const tx = CW / 2 + (this._rng[(f * 7) & 511] - 0.5) * 80;
          this._spawnParticle(tx, S * 4, (this._rng[(f * 13) & 511] - 0.5) * 0.5,
            -(this._rng[(f * 9) & 511] * 0.2 + 0.05), 150,
            `rgba(${255},${200 + (this._rng[(f * 5) & 511] * 50 | 0)},120,`, 1);
        }
        break;

      case 'datacenter':
        if (f % 4 === 0) {
          const dy = this._rng[(f * 19) & 511] * CH;
          this._spawnParticle(this._rng[(f * 7) & 511] * CW, dy,
            (this._rng[(f * 11) & 511] - 0.5) * 1.2, 0,
            40, 'rgba(0,220,255,', 2);
        }
        break;
    }
  }

  _spawnParticle(x, y, vx, vy, life, colorPrefix, size) {
    this._particles.push({ x, y, vx, vy, life, maxLife: life, colorPrefix, size });
  }

  _updateParticles() {
    let i = this._particles.length - 1;
    while (i >= 0) {
      const p = this._particles[i];
      p.x  += p.vx;
      p.y  += p.vy;
      p.vx *= 0.995;
      p.life--;
      if (p.life <= 0) {
        this._particles[i] = this._particles[this._particles.length - 1];
        this._particles.pop();
      }
      i--;
    }
  }

  _drawParticles() {
    const ctx = this.ctx;
    for (const p of this._particles) {
      const a = p.life / p.maxLife;
      ctx.fillStyle = `${p.colorPrefix}${a})`;
      ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
    }
  }

  _drawEraBackground(era) {
    const ctx = this.ctx;
    const f   = this.frameCount;

    switch (era.decorType) {

      case 'workbench': {
        const glow = Math.sin(f * 0.018) * 0.05 + 0.20;
        const g = ctx.createRadialGradient(CW / 2, CH * 0.28, 8, CW / 2, CH * 0.28, 210);
        g.addColorStop(0,   `rgba(255,195,90,${glow})`);
        g.addColorStop(0.4, `rgba(200,130,50,${glow * 0.4})`);
        g.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
        const floorGlow = ctx.createLinearGradient(0, CH * 0.5, 0, CH);
        floorGlow.addColorStop(0, 'rgba(60,30,0,0.08)');
        floorGlow.addColorStop(1, 'rgba(30,10,0,0.04)');
        ctx.fillStyle = floorGlow; ctx.fillRect(0, CH * 0.5, CW, CH * 0.5);
        for (let i = 0; i < 4; i++) {
          const sx = this._rng[(i * 31 + f * 0.2 | 0) & 511] * CW;
          const sy = this._rng[(i * 37 + f * 0.15 | 0) & 511] * CH * 0.6;
          const alpha = Math.sin(f * 0.025 + i * 1.7) * 0.04 + 0.05;
          const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, 40);
          gr.addColorStop(0, `rgba(200,160,80,${alpha})`);
          gr.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gr; ctx.fillRect(sx - 40, sy - 40, 80, 80);
        }
        break;
      }

      case 'military': {
        const vm = ctx.createRadialGradient(CW / 2, CH / 2, 80, CW / 2, CH / 2, CW * 0.8);
        vm.addColorStop(0, 'rgba(0,0,0,0)');
        vm.addColorStop(1, 'rgba(0,0,0,0.6)');
        ctx.fillStyle = vm; ctx.fillRect(0, 0, CW, CH);
        const alert = Math.abs(Math.sin(f * 0.028)) * 0.07;
        const ag = ctx.createRadialGradient(CW - S, CH / 2, 0, CW - S, CH / 2, 120);
        ag.addColorStop(0, `rgba(200,170,0,${alert})`);
        ag.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = ag; ctx.fillRect(0, 0, CW, CH);
        ctx.fillStyle = 'rgba(160,140,0,0.025)';
        for (let y = 0; y < CH; y += 3) ctx.fillRect(0, y, CW, 1);
        break;
      }

      case 'garage_sv': {
        const sunG = ctx.createLinearGradient(0, 0, CW * 0.35, 0);
        sunG.addColorStop(0,   'rgba(190,230,170,0.14)');
        sunG.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = sunG; ctx.fillRect(0, 0, CW, CH);
        const oscA = Math.sin(f * 0.035) * 0.03 + 0.06;
        const og = ctx.createRadialGradient(S, CH * 0.7, 0, S, CH * 0.7, 70);
        og.addColorStop(0, `rgba(30,200,70,${oscA})`);
        og.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = og; ctx.fillRect(0, CH * 0.4, CW * 0.2, CH * 0.6);
        break;
      }

      case 'corporate': {
        const fFreq = Math.sin(f * 0.007);
        ctx.fillStyle = `rgba(175,190,255,${fFreq > 0.98 ? 0.12 : 0.025})`;
        for (let y = 0; y < CH; y += 14) ctx.fillRect(0, y, CW, 5);
        const carpetG = ctx.createLinearGradient(0, CH * 0.55, 0, CH);
        carpetG.addColorStop(0, 'rgba(0,0,30,0)');
        carpetG.addColorStop(1, 'rgba(0,0,30,0.22)');
        ctx.fillStyle = carpetG; ctx.fillRect(0, 0, CW, CH);
        break;
      }

      case 'theater': {
        const spot = ctx.createRadialGradient(CW / 2, S, 4, CW / 2, S, 180);
        spot.addColorStop(0,   'rgba(255,200,140,0.38)');
        spot.addColorStop(0.4, 'rgba(255,80,60,0.10)');
        spot.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = spot; ctx.fillRect(0, 0, CW, CH);
        const sl = Math.sin(f * 0.022) * 0.04 + 0.12;
        const lSpot = ctx.createRadialGradient(S, S * 3, 0, S, S * 3, 110);
        lSpot.addColorStop(0, `rgba(180,0,220,${sl})`);
        lSpot.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lSpot; ctx.fillRect(0, 0, CW, CH);
        const rSpot = ctx.createRadialGradient(CW - S, S * 3, 0, CW - S, S * 3, 110);
        rSpot.addColorStop(0, `rgba(180,0,220,${sl * 0.9})`);
        rSpot.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rSpot; ctx.fillRect(0, 0, CW, CH);
        const audG = ctx.createLinearGradient(0, CH * 0.4, 0, CH);
        audG.addColorStop(0, 'rgba(0,0,0,0)');
        audG.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = audG; ctx.fillRect(0, 0, CW, CH);
        break;
      }

      case 'datacenter': {
        const dcV = ctx.createRadialGradient(CW / 2, CH / 2, 30, CW / 2, CH / 2, CW * 0.85);
        dcV.addColorStop(0, 'rgba(0,20,40,0)');
        dcV.addColorStop(1, 'rgba(0,0,15,0.55)');
        ctx.fillStyle = dcV; ctx.fillRect(0, 0, CW, CH);
        ctx.fillStyle = 'rgba(0,190,255,0.03)';
        for (let x = 0; x < CW; x += S) ctx.fillRect(x, 0, 1, CH);
        for (let y = 0; y < CH; y += S) ctx.fillRect(0, y, CW, 1);
        const netPulse = Math.abs(Math.sin(f * 0.045)) * 0.04;
        ctx.fillStyle = `rgba(0,160,255,${netPulse})`; ctx.fillRect(0, 0, CW, CH);
        break;
      }
    }
  }

  _drawTile(tile, x, y, era, col, row, completedMachines) {
    const f = this.frameCount;
    switch (tile) {
      case TILE.FLOOR:
        this._drawFloor(x, y, era, col, row, f);
        break;
      case TILE.WALL:
        this._drawWall(x, y, era, col, row, f);
        break;
      case TILE.MACHINE:
        this._drawFloor(x, y, era, col, row, f);
        const done = era.machine && completedMachines.has(era.machine.id);
        this._drawMachineSprite(x, y, era, done, f);
        break;
      case TILE.DECOR:
        this._drawFloor(x, y, era, col, row, f);
        this._drawDecor(x, y, era, col, row, f);
        break;
      case TILE.PORTAL:
      case TILE.WARP:
        this._drawFloor(x, y, era, col, row, f);
        this._drawPortal(x, y, era, f);
        break;
      default:
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(x, y, S, S);
    }
  }

  _drawFloor(x, y, era, col, row, f) {
    const ctx = this.ctx;
    const n   = this._rnd(col, row);
    const n2  = this._rnd(col, row, 1);

    switch (era.decorType) {

      case 'workbench': {
        const shade = n * 0.06;
        ctx.fillStyle = this._darken(era.floorColor, shade); ctx.fillRect(x, y, S, S);
        ctx.fillStyle = this._darken(era.floorColor, 0.22); ctx.fillRect(x, y, S, 1);
        ctx.fillRect(x, y, 1, S);
        if (n < 0.08) {
          ctx.fillStyle = 'rgba(8,5,2,0.5)'; ctx.fillRect(x + 5, y + 6, 14, 9);
          ctx.fillStyle = 'rgba(14,10,4,0.3)'; ctx.fillRect(x + 4, y + 5, 16, 11);
          ctx.fillStyle = `rgba(0,30,60,${0.15 + Math.sin(f * 0.04 + col) * 0.05})`;
          ctx.fillRect(x + 7, y + 8, 8, 4);
        }
        if (n > 0.88) {
          ctx.fillStyle = this._darken(era.floorColor, 0.3);
          if (n2 > 0.5) ctx.fillRect(x + (n * 20 | 0), y + 4, 1, S - 8);
          else          ctx.fillRect(x + 4, y + (n * 20 | 0), S - 8, 1);
        }
        if (n > 0.7 && n < 0.8) {
          ctx.fillStyle = 'rgba(180,150,100,0.06)'; ctx.fillRect(x + 2, y + 2, S - 4, S - 4);
        }
        break;
      }

      case 'military': {
        const base = (col + row) % 2 === 0 ? era.floorColor : this._darken(era.floorColor, 0.07);
        ctx.fillStyle = base; ctx.fillRect(x, y, S, S);
        ctx.fillStyle = this._darken(era.floorColor, 0.28); ctx.fillRect(x, y, S, 1);
        ctx.fillRect(x, y, 1, S);
        if (col % 4 === 0 && row % 4 === 0) {
          ctx.fillStyle = '#2e2c00'; ctx.fillRect(x + 1, y + 1, 4, 4);
          ctx.fillStyle = '#5a5600'; ctx.fillRect(x + 2, y + 2, 2, 2);
          ctx.fillStyle = '#8a8200'; ctx.fillRect(x + 2, y + 2, 1, 1);
        }
        if (n > 0.85) {
          ctx.fillStyle = this._darken(era.floorColor, 0.18); ctx.fillRect(x + 3, y + 3, S - 6, S - 6);
        }
        break;
      }

      case 'garage_sv': {
        ctx.fillStyle = era.floorColor; ctx.fillRect(x, y, S, S);
        ctx.fillStyle = this._darken(era.floorColor, 0.2); ctx.fillRect(x, y, S, 1);
        ctx.fillRect(x, y, 1, S);
        if ((col * 13 + row * 11) % 19 === 0) {
          ctx.fillStyle = 'rgba(180,240,160,0.10)'; ctx.fillRect(x + 4, y + 15, S - 8, 1);
          ctx.fillRect(x + 15, y + 4, 1, S - 8);
        }
        if (n > 0.9) {
          ctx.fillStyle = 'rgba(180,140,0,0.2)'; ctx.fillRect(x + (n * 24 | 0), y + (n2 * 24 | 0), 2, 2);
        }
        break;
      }

      case 'corporate': {
        ctx.fillStyle = era.floorColor; ctx.fillRect(x, y, S, S);
        ctx.fillStyle = this._lighten(era.floorColor, 0.055);
        for (let i = 1; i < S; i += 3) ctx.fillRect(x, y + i, S, 1);
        ctx.fillStyle = this._darken(era.floorColor, 0.18);
        if (col % 4 === 0) ctx.fillRect(x, y, 1, S);
        if (row % 4 === 0) ctx.fillRect(x, y, S, 1);
        if (n > 0.92) {
          ctx.fillStyle = this._darken(era.floorColor, 0.1); ctx.fillRect(x + 2, y + 2, S - 4, S - 4);
        }
        break;
      }

      case 'theater': {
        if (row <= 5) {
          const grain = col % 2 === 0 ? era.floorColor : this._darken(era.floorColor, 0.10);
          ctx.fillStyle = grain; ctx.fillRect(x, y, S, S);
          ctx.fillStyle = this._darken(era.floorColor, 0.22); ctx.fillRect(x, y, S, 1);
          ctx.fillRect(x + 3, y + 6, 1, S - 6);
          ctx.fillRect(x + S - 5, y + 2, 1, S - 8);
          if (row <= 3) {
            const shine = Math.sin(f * 0.022 + col * 0.35) * 0.05 + 0.07;
            ctx.fillStyle = `rgba(255,220,150,${shine})`; ctx.fillRect(x, y, S, S);
          }
          if (n > 0.94) {
            ctx.fillStyle = this._darken(era.floorColor, 0.3); ctx.fillRect(x + 8, y + 10, 6, 4);
            ctx.fillRect(x + 9, y + 9, 4, 6);
          }
        } else {
          ctx.fillStyle = this._darken(era.floorColor, 0.32); ctx.fillRect(x, y, S, S);
          ctx.fillStyle = this._darken(era.floorColor, 0.42); ctx.fillRect(x, y, S, 1); ctx.fillRect(x, y, 1, S);
          if (n > 0.75) {
            ctx.fillStyle = this._darken(era.floorColor, 0.38); ctx.fillRect(x + 2, y + 2, 4, 4);
          }
        }
        break;
      }

      case 'datacenter': {
        ctx.fillStyle = era.floorColor; ctx.fillRect(x, y, S, S);
        ctx.fillStyle = this._lighten(era.floorColor, 0.14); ctx.fillRect(x + 1, y + 1, S - 2, 2);
        ctx.fillRect(x + 1, y + 1, 2, S - 2);
        ctx.fillStyle = this._darken(era.floorColor, 0.22); ctx.fillRect(x + 1, y + S - 3, S - 2, 2);
        ctx.fillRect(x + S - 3, y + 1, 2, S - 2);
        if ((col + row) % 2 === 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.38)';
          for (let vx = 5; vx < S - 2; vx += 6)
            for (let vy = 5; vy < S - 2; vy += 6)
              ctx.fillRect(x + vx, y + vy, 2, 2);
        }
        if (col % 5 === 0 && row % 3 === 0) {
          const blink = Math.sin(f * 0.09 + col + row) > 0.6;
          ctx.fillStyle = blink ? '#00ffcc' : '#002211'; ctx.fillRect(x + S - 4, y + S - 4, 2, 2);
        }
        const ref = ctx.createLinearGradient(x, y, x + S, y + S);
        ref.addColorStop(0, 'rgba(0,180,255,0.04)');
        ref.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = ref; ctx.fillRect(x, y, S, S);
        break;
      }

      default: {
        ctx.fillStyle = era.floorColor; ctx.fillRect(x, y, S, S);
        ctx.fillStyle = this._darken(era.floorColor, 0.12); ctx.fillRect(x, y, S, 1); ctx.fillRect(x, y, 1, S);
      }
    }
  }

  _drawWall(x, y, era, col, row, f) {
    const ctx = this.ctx;
    const n   = this._rnd(col, row);

    switch (era.decorType) {

      case 'workbench': {
        const br   = row % 2;
        const bOff = br === 0 ? 0 : S / 2;
        ctx.fillStyle = era.wallColor; ctx.fillRect(x, y, S, S);
        ctx.fillStyle = this._lighten(era.wallColor, 0.14 + n * 0.06); ctx.fillRect(x, y + 2, S, S - 4);
        ctx.fillStyle = this._darken(era.wallColor, 0.35); ctx.fillRect(x, y + S - 4, S, 4);
        ctx.fillRect(x, y, S, 2);
        ctx.fillRect((x + bOff) % (S * 2) < S ? x + S / 2 : x, y + 3, 1, S - 7);
        ctx.fillStyle = this._lighten(era.wallColor, 0.22); ctx.fillRect(x, y + 2, S, 4);
        if (n > 0.82) {
          ctx.fillStyle = 'rgba(80,30,0,0.3)'; ctx.fillRect(x + (n * 20 | 0), y + S - 8, 3, 6);
        }
        if (row === 0 && col % 4 === 1) {
          ctx.fillStyle = '#4a2a08'; ctx.fillRect(x, y + S - 7, S, 5);
          ctx.fillStyle = '#6a4218'; ctx.fillRect(x, y + S - 9, S, 3);
          ctx.fillStyle = '#777'; ctx.fillRect(x + 4, y + 8, 2, 18);
          ctx.fillStyle = '#aaa'; ctx.fillRect(x + 3, y + 8, 4, 3);
          ctx.fillStyle = '#999'; ctx.fillRect(x + 12, y + 6, 5, 2); ctx.fillRect(x + 14, y + 8, 1, 12);
        }
        break;
      }

      case 'military': {
        ctx.fillStyle = era.wallColor; ctx.fillRect(x, y, S, S);
        ctx.fillStyle = this._lighten(era.wallColor, 0.18); ctx.fillRect(x + 2, y + 2, S - 4, S - 4);
        ctx.fillStyle = this._darken(era.wallColor, 0.45); ctx.fillRect(x, y, 2, S); ctx.fillRect(x, y, S, 2);
        ctx.fillRect(x + S - 2, y, 2, S); ctx.fillRect(x, y + S - 2, S, 2);
        const rivColors = ['#3a3000', '#6a5800', '#9a8800'];
        [[2,2],[S-5,2],[2,S-5],[S-5,S-5]].forEach(([rx, ry], i) => {
          ctx.fillStyle = rivColors[0]; ctx.fillRect(x + rx, y + ry, 3, 3);
          ctx.fillStyle = rivColors[1]; ctx.fillRect(x + rx + 1, y + ry + 1, 1, 1);
        });
        if (n > 0.78 && row === 1) {
          ctx.fillStyle = '#0e0c00'; ctx.fillRect(x + 5, y + 7, S - 10, S - 15);
          ctx.fillStyle = '#aa8800'; ctx.fillRect(x + 7, y + 9, 5, 3);
          ctx.fillRect(x + 14, y + 9, 5, 3);
          ctx.fillStyle = Math.sin(f * 0.08 + col) > 0 ? '#ff4400' : '#440000';
          ctx.fillRect(x + S - 8, y + 9, 3, 3);
        }
        if (n > 0.6 && n < 0.7 && row === 1) {
          ctx.fillStyle = '#ffcc00'; ctx.fillRect(x, y + S - 3, S, 2);
          ctx.fillRect(x + S / 2, y + S - 6, 2, 4);
        }
        break;
      }

      case 'garage_sv': {
        ctx.fillStyle = era.wallColor; ctx.fillRect(x, y, S, S);
        ctx.fillStyle = this._lighten(era.wallColor, 0.10 + n * 0.05); ctx.fillRect(x, y + 3, S, S - 6);
        ctx.fillStyle = this._darken(era.wallColor, 0.28); ctx.fillRect(x, y + S / 3, S, 1);
        ctx.fillRect(x, y + S * 2 / 3, S, 1);
        ctx.fillStyle = this._lighten(era.wallColor, 0.32); ctx.fillRect(x, y, S, 3);
        if (row === 0 && col % 5 === 2) {
          ctx.fillStyle = '#1a2a8a'; ctx.fillRect(x + 3, y + 4, S - 6, S - 8);
          ctx.fillStyle = '#2244cc'; ctx.fillRect(x + 4, y + 5, S - 8, S - 12);
          ctx.fillStyle = '#4488ff'; ctx.fillRect(x + 5, y + 7, 8, 2);
          ctx.fillRect(x + 5, y + 11, 12, 1); ctx.fillRect(x + 5, y + 14, 10, 1);
        }
        if (row === 1) {
          const cableCol = ['#ff4444','#4444ff','#44ff44'];
          ctx.fillStyle = cableCol[col % 3]; ctx.fillRect(x, y + S - 4, S, 2);
        }
        break;
      }

      case 'corporate': {
        ctx.fillStyle = era.wallColor; ctx.fillRect(x, y, S, S);
        ctx.fillStyle = this._lighten(era.wallColor, 0.22); ctx.fillRect(x + 1, y + 1, S - 2, S - 2);
        ctx.fillStyle = this._lighten(era.wallColor, 0.08); ctx.fillRect(x, y, S, 2); ctx.fillRect(x, y, 2, S);
        ctx.fillStyle = this._darken(era.wallColor, 0.32);
        ctx.fillRect(x + S - 2, y, 2, S); ctx.fillRect(x, y + S - 2, S, 2);
        if (row === 0 && col === 7) {
          ctx.fillStyle = '#0033aa'; ctx.fillRect(x + 2, y + 5, S - 4, S - 10);
          ctx.fillStyle = '#ffffff'; ctx.font = 'bold 7px monospace'; ctx.fillText('IBM', x + 5, y + 18);
        }
        if (row === 0 && n > 0.75) {
          ctx.fillStyle = '#7a5218'; ctx.fillRect(x + 4, y + 4, S - 8, S - 8);
          ctx.fillStyle = '#f0e0a0'; ctx.fillRect(x + 5, y + 5, S - 10, S - 10);
          ctx.fillStyle = '#886633';
          for (let li = 0; li < 3; li++) ctx.fillRect(x + 7, y + 8 + li * 5, S - 14, 1);
          ctx.fillStyle = '#ff4444'; ctx.fillRect(x + S - 8, y + 6, 2, 2);
        }
        break;
      }

      case 'theater': {
        ctx.fillStyle = era.wallColor; ctx.fillRect(x, y, S, S);
        const cG = ctx.createLinearGradient(x, y, x + S, y);
        cG.addColorStop(0,   this._darken(era.wallColor, 0.35));
        cG.addColorStop(0.3, this._lighten(era.wallColor, 0.28));
        cG.addColorStop(0.7, this._darken(era.wallColor, 0.12));
        cG.addColorStop(1,   this._darken(era.wallColor, 0.38));
        ctx.fillStyle = cG; ctx.fillRect(x, y, S, S);
        ctx.fillStyle = this._darken(era.wallColor, 0.38);
        [4, S - 7, S / 2 | 0].forEach(dx => ctx.fillRect(x + dx, y, 2, S));
        if (row === 0) {
          ctx.fillStyle = '#9a7800'; ctx.fillRect(x, y + S - 6, S, 6);
          ctx.fillStyle = '#ffdd44'; ctx.fillRect(x, y + S - 6, S, 2);
          ctx.fillStyle = '#ffcc00'; ctx.fillRect(x + S / 2 - 3, y + S - 12, 6, 6);
          ctx.fillRect(x + S / 2 - 5, y + S - 10, 10, 1);
        }
        break;
      }

      case 'datacenter': {
        ctx.fillStyle = era.wallColor; ctx.fillRect(x, y, S, S);
        ctx.fillStyle = this._lighten(era.wallColor, 0.14); ctx.fillRect(x + 2, y + 1, S - 4, S - 2);
        ctx.fillStyle = this._darken(era.wallColor, 0.32);
        for (let u = 2; u < S - 2; u += 5) ctx.fillRect(x + 3, y + u, S - 6, 1);
        ctx.fillStyle = this._lighten(era.wallColor, 0.28);
        ctx.fillRect(x, y, 2, S); ctx.fillRect(x + S - 2, y, 2, S);
        const led1 = Math.sin(f * 0.14 + col * 1.5 + row * 0.7) > 0.4;
        const led2 = Math.sin(f * 0.09 + col * 0.8 - row) > 0.5;
        const led3 = Math.sin(f * 0.11 + col + row * 1.3) > 0.6;
        ctx.fillStyle = led1 ? '#00ff88' : '#002210'; ctx.fillRect(x + S - 5, y + 3, 2, 2);
        ctx.fillStyle = led2 ? '#ff4400' : '#220000'; ctx.fillRect(x + S - 5, y + 7, 2, 2);
        ctx.fillStyle = led3 ? '#0088ff' : '#000820'; ctx.fillRect(x + S - 5, y + 11, 2, 2);
        if (n > 0.7) {
          const fG = Math.sin(f * 0.16 + col + row) * 0.5 + 0.5;
          ctx.fillStyle = `rgba(0,220,255,${fG * 0.7})`; ctx.fillRect(x + 3, y + S - 4, S - 6, 2);
        }
        break;
      }

      default: {
        ctx.fillStyle = era.wallColor; ctx.fillRect(x, y, S, S);
        ctx.fillStyle = this._lighten(era.wallColor, 0.22); ctx.fillRect(x, y, S, 4);
        ctx.fillStyle = this._darken(era.wallColor, 0.3);
        ctx.fillRect(x + S - 3, y, 3, S); ctx.fillRect(x, y + S - 3, S, 3);
      }
    }
  }

  _drawDecor(x, y, era, col, row, f) {
    const ctx  = this.ctx;
    const n    = this._rnd(col, row);

    switch (era.decorType) {

      case 'workbench': {
        if (row <= 2 || row >= 10) {
          ctx.fillStyle = '#4a2e0c'; ctx.fillRect(x, y + 16, S, S - 16);
          ctx.fillStyle = '#6a4218'; ctx.fillRect(x, y + 14, S, 4);
          ctx.fillStyle = this._lighten('#6a4218', 0.2); ctx.fillRect(x, y + 14, S, 1);
          if (n < 0.33) {
            ctx.fillStyle = '#888'; ctx.fillRect(x + 4, y + 4, 3, 11);
            ctx.fillStyle = '#bbb'; ctx.fillRect(x + 4, y + 4, 3, 3);
            ctx.fillStyle = '#888'; ctx.fillRect(x + 3, y + 4, 5, 2);
          } else if (n < 0.66) {
            ctx.fillStyle = '#6a3010'; ctx.fillRect(x + 13, y + 7, 2, 9);
            ctx.fillStyle = '#888'; ctx.fillRect(x + 10, y + 4, 8, 5);
            ctx.fillStyle = '#bbb'; ctx.fillRect(x + 10, y + 4, 8, 2);
          } else {
            ctx.fillStyle = '#555'; ctx.fillRect(x + 6, y + 3, 2, 13); ctx.fillRect(x + 9, y + 3, 2, 13);
            ctx.fillStyle = '#333'; ctx.fillRect(x + 5, y + 3, 8, 4);
          }
          ctx.fillStyle = '#ccaa44'; ctx.fillRect(x + S - 7, y + 7, 3, 3); ctx.fillRect(x + S - 12, y + 9, 2, 2);
          ctx.fillRect(x + S - 5, y + 11, 2, 2);
          ctx.fillStyle = '#cc3322'; ctx.fillRect(x + 1, y + 5, 10, 8);
          ctx.fillStyle = '#ff5544'; ctx.fillRect(x + 1, y + 5, 10, 2);
          ctx.fillStyle = '#882211'; ctx.fillRect(x + 5, y + 5, 1, 8);
          ctx.fillStyle = '#ccaa44'; ctx.fillRect(x + 3, y + 3, 6, 2);
        } else {
          ctx.fillStyle = '#7a4c18'; ctx.fillRect(x + 4, y + 8, S - 8, S - 14);
          ctx.fillStyle = '#9a6228'; ctx.fillRect(x + 4, y + 8, S - 8, 4);
          ctx.fillStyle = '#5a3410'; ctx.fillRect(x + 4, y + 8 + (S - 22) / 2, S - 8, 1);
          ctx.fillRect(x + 4 + (S - 8) / 2, y + 8, 1, S - 22);
          ctx.fillStyle = '#888'; ctx.fillRect(x + 6, y + 10, 4, 1);
          ctx.fillStyle = '#666'; ctx.fillRect(x + 12, y + 11, 3, 1);
        }
        break;
      }

      case 'military': {
        if (n > 0.5) {
          ctx.fillStyle = '#14100a'; ctx.fillRect(x + 2, y + 2, S - 4, S - 4);
          ctx.fillStyle = '#2a2410'; ctx.fillRect(x + 3, y + 3, S - 6, S - 6);
          for (let vi = 0; vi < 3; vi++) {
            const vx = x + 5 + vi * 7;
            const vg = Math.sin(f * 0.09 + vi * 1.6 + col) * 0.5 + 0.5;
            ctx.fillStyle = `rgba(220,140,0,${vg * 0.75 + 0.25})`; ctx.fillRect(vx, y + 5, 4, 14);
            ctx.fillStyle = `rgba(255,210,80,${vg})`; ctx.fillRect(vx + 1, y + 6, 2, 4);
            ctx.fillStyle = '#5a4800'; ctx.fillRect(vx - 1, y + 19, 6, 3);
          }
          ctx.fillStyle = '#5a5000'; ctx.fillRect(x + 3, y + S - 8, S - 6, 4);
        } else {
          ctx.fillStyle = '#1e2810'; ctx.fillRect(x + 3, y + 7, S - 6, S - 14);
          ctx.fillStyle = '#2a3820'; ctx.fillRect(x + 3, y + 7, S - 6, 4);
          ctx.fillStyle = '#3a4830'; ctx.fillRect(x + 5, y + 9, S - 10, 2);
          ctx.fillStyle = '#aaaa00'; ctx.fillRect(x + S / 2 - 2, y + 14, 4, 6);
          ctx.fillRect(x + S / 2 - 4, y + 16, 8, 2);
          ctx.fillStyle = '#665500'; ctx.fillRect(x + 3, y + 8, 3, 2); ctx.fillRect(x + S - 6, y + 8, 3, 2);
        }
        break;
      }

      case 'garage_sv': {
        if (row <= 2) {
          ctx.fillStyle = '#2e1e08'; ctx.fillRect(x, y + S - 11, S, 9);
          ctx.fillStyle = '#4e3618'; ctx.fillRect(x, y + S - 13, S, 3);
          ctx.fillStyle = '#6e5628'; ctx.fillRect(x, y + S - 13, S, 1);
          const compColors = ['#2244aa','#228844','#aa4422','#888800','#aa2288'];
          for (let ci = 0; ci < 4; ci++) {
            ctx.fillStyle = compColors[ci % 5]; ctx.fillRect(x + 2 + ci * 7, y + S - 21, 5, 8);
            ctx.fillStyle = '#ccaa44'; ctx.fillRect(x + 2 + ci * 7, y + S - 21, 1, 8);
            ctx.fillRect(x + 6 + ci * 7, y + S - 21, 1, 8);
          }
        } else if (row >= 10) {
          ctx.fillStyle = '#122018'; ctx.fillRect(x + 2, y + 10, S - 4, S - 16);
          ctx.fillStyle = '#1a3828'; ctx.fillRect(x + 3, y + 11, S - 6, S - 18);
          ctx.fillStyle = '#ccaa00'; ctx.fillRect(x + 5, y + 13, S - 10, 1);
          ctx.fillRect(x + 5, y + 17, S - 10, 1);
          ctx.fillRect(x + 5, y + 21, S - 10, 1);
          ctx.fillStyle = '#111'; ctx.fillRect(x + 7, y + 14, 5, 3); ctx.fillRect(x + 16, y + 18, 5, 3);
          ctx.fillStyle = '#ffcc00'; ctx.fillRect(x + 8, y + 14, 1, 1); ctx.fillRect(x + 11, y + 14, 1, 1);
          ctx.fillRect(x + 17, y + 18, 1, 1); ctx.fillRect(x + 20, y + 18, 1, 1);
        } else {
          const rColors = ['#cc2222','#2222cc','#22aa22'];
          ctx.fillStyle = rColors[col % 3]; ctx.fillRect(x + 6, y + 6, 18, 18);
          ctx.fillStyle = this._darken(rColors[col % 3], 0.4); ctx.fillRect(x + 9, y + 9, 12, 12);
          ctx.fillStyle = this._lighten(rColors[col % 3], 0.3); ctx.fillRect(x + 12, y + 12, 6, 6);
        }
        break;
      }

      case 'corporate': {
        if (n < 0.33) {
          ctx.fillStyle = '#2e2e28'; ctx.fillRect(x + 2, y + 12, S - 4, S - 16);
          ctx.fillStyle = '#484840'; ctx.fillRect(x + 2, y + 10, S - 4, 4);
          ctx.fillStyle = '#f0f0e8'; ctx.fillRect(x + 4, y + 3, S - 14, S - 18);
          ctx.fillStyle = '#c8c8c0'; ctx.fillRect(x + 4, y + 3, S - 14, 1);
          ctx.fillStyle = '#777'; for (let li = 0; li < 4; li++) ctx.fillRect(x + 6, y + 6 + li * 4, S - 18, 1);
          ctx.fillStyle = '#2244aa'; ctx.fillRect(x + S - 8, y + 3, 2, 14);
          ctx.fillStyle = '#4466cc'; ctx.fillRect(x + S - 9, y + 3, 4, 2);
        } else if (n < 0.66) {
          ctx.fillStyle = '#1e1c18'; ctx.fillRect(x + 2, y + 4, S - 4, S - 8);
          ctx.fillStyle = '#3a3828'; ctx.fillRect(x + 2, y + 4, S - 4, 3);
          const pColors = ['#cc4422','#2244cc','#228844','#cc9922'];
          for (let pi = 0; pi < 4; pi++) {
            ctx.fillStyle = pColors[pi]; ctx.fillRect(x + 4 + pi * 5, y + 6, 4, S - 12);
            ctx.fillStyle = this._lighten(pColors[pi], 0.3); ctx.fillRect(x + 4 + pi * 5, y + 6, 4, 2);
            ctx.fillStyle = '#fff'; ctx.fillRect(x + 5 + pi * 5, y + 8, 2, 3);
          }
        } else {
          ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x + 7, y + 5, S - 14, S - 10);
          ctx.fillStyle = '#2a2a2a'; ctx.fillRect(x + 7, y + 5, S - 14, 4);
          ctx.fillStyle = '#1e1000'; ctx.fillRect(x + 9, y + 11, S - 18, S - 22);
          ctx.fillStyle = '#222'; ctx.fillRect(x + 4, y + 14, 4, 4);
          ctx.fillStyle = '#333'; ctx.fillRect(x + 7, y + S - 6, S - 14, 3);
          const cafeOn = Math.sin(f * 0.03 + col) > 0;
          ctx.fillStyle = cafeOn ? '#22ff44' : '#112211'; ctx.fillRect(x + S - 10, y + 7, 3, 3);
          if (cafeOn && f % 20 < 10) {
            ctx.fillStyle = 'rgba(200,200,200,0.15)'; ctx.fillRect(x + 12, y + 2, 4, 3);
          }
        }
        break;
      }

      case 'theater': {
        if (row <= 2) {
          ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x + 8, y + 2, 14, 9);
          ctx.fillStyle = '#333300'; ctx.fillRect(x + 6, y + 9, 18, 6);
          ctx.fillStyle = '#ffff88'; ctx.fillRect(x + 12, y + 11, 6, 4);
          ctx.fillStyle = '#ffffc0'; ctx.fillRect(x + 13, y + 11, 2, 2);
          const beamA = Math.sin(f * 0.04 + col * 0.8) * 0.3 + 0.4;
          ctx.fillStyle = `rgba(255,220,100,${beamA})`; ctx.fillRect(x + 12, y + 15, 8, S - 15);
          ctx.fillStyle = `rgba(255,240,160,${beamA * 0.3})`; ctx.fillRect(x + 10, y + 16, 12, S - 17);
          ctx.fillStyle = '#222'; ctx.fillRect(x + S / 2, y, 2, 4);
        } else {
          ctx.fillStyle = '#550011'; ctx.fillRect(x + 3, y + 5, S - 6, S - 9);
          ctx.fillStyle = '#770022'; ctx.fillRect(x + 3, y + 5, S - 6, 3);
          ctx.fillStyle = '#660016'; ctx.fillRect(x + 3, y + 6, S - 6, 10);
          ctx.fillStyle = '#880022'; ctx.fillRect(x + 3, y + 16, S - 6, S - 21);
          ctx.fillStyle = '#660016'; ctx.fillRect(x + 3, y + 20, S - 6, S - 25);
          ctx.fillStyle = '#2a1200'; ctx.fillRect(x + 1, y + 14, 3, S - 19);
          ctx.fillRect(x + S - 4, y + 14, 3, S - 19);
          ctx.fillStyle = '#440010'; ctx.fillRect(x + S / 2 - 1, y + 12, 2, 2);
          ctx.fillStyle = 'rgba(255,180,100,0.5)'; ctx.font = '4px monospace';
          ctx.fillText(`${col * 3 + row}`, x + S / 2 - 4, y + S - 4);
        }
        break;
      }

      case 'datacenter': {
        ctx.fillStyle = '#060e1a'; ctx.fillRect(x + 1, y + 1, S - 2, S - 2);
        ctx.fillStyle = '#0c1a2c'; ctx.fillRect(x + 3, y + 3, S - 6, S - 6);
        for (let ui = 0; ui < 6; ui++) {
          ctx.fillStyle = ui % 2 === 0 ? '#080e1c' : '#0e1826'; ctx.fillRect(x + 4, y + 4 + ui * 4, S - 8, 3);
          const active = Math.sin(f * 0.12 + col * 0.7 + row * 0.4 + ui * 0.8) > 0.2;
          ctx.fillStyle = active ? '#00ff88' : '#001a00'; ctx.fillRect(x + S - 7, y + 5 + ui * 4, 2, 2);
          const active2 = Math.sin(f * 0.08 + col + ui * 1.2) > 0.5;
          ctx.fillStyle = active2 ? '#ff3300' : '#1a0000'; ctx.fillRect(x + S - 10, y + 5 + ui * 4, 2, 2);
        }
        const fG = Math.sin(f * 0.15 + col + row) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(0,220,255,${fG * 0.8})`; ctx.fillRect(x + 4, y + S - 4, S - 10, 2);
        ctx.fillStyle = '#182840'; ctx.fillRect(x + 1, y + 1, 2, S - 2); ctx.fillRect(x + S - 3, y + 1, 2, S - 2);
        ctx.fillStyle = '#304060'; ctx.fillRect(x + 1, y + 3, 2, 2); ctx.fillRect(x + 1, y + S - 5, 2, 2);
        ctx.fillRect(x + S - 3, y + 3, 2, 2); ctx.fillRect(x + S - 3, y + S - 5, 2, 2);
        break;
      }
    }
  }

  _drawMachineSprite(x, y, era, done, f) {
    switch (era.decorType) {
      case 'workbench':  this._machineGeneric(x, y, era, done, f);     break;
      case 'military':   this._machineENIAC(x, y, era, done, f);       break;
      case 'garage_sv':  this._machineApple2(x, y, era, done, f);      break;
      case 'corporate':  this._machineIBMPC(x, y, era, done, f);       break;
      case 'theater':    this._machineMac128(x, y, era, done, f);      break;
      case 'datacenter': this._machinePCModerno(x, y, era, done, f);   break;
      default:           this._machineGeneric(x, y, era, done, f);     break;
    }
    if (done) {
      this.ctx.fillStyle = 'rgba(0,255,80,0.18)';
      this.ctx.fillRect(x, y, S, S);
      this.ctx.fillStyle = '#00ff44';
      this.ctx.font = 'bold 9px monospace';
      this.ctx.fillText('✓', x + S - 11, y + 10);
    }
  }

  _machineENIAC(x, y, era, done, f) {
    const ctx = this.ctx;
    const c   = done ? '#1e4e1e' : '#7a4a00';
    const glow = Math.sin(f * 0.07) * 0.5 + 0.5;

    ctx.fillStyle = c; ctx.fillRect(x + 1, y + 1, S - 2, S - 2);
    ctx.fillStyle = this._lighten(c, 0.28); ctx.fillRect(x + 1, y + 1, S - 2, 4);
    ctx.fillStyle = this._darken(c, 0.3);
    ctx.fillRect(x + S - 3, y + 1, 2, S - 2); ctx.fillRect(x + 1, y + S - 3, S - 2, 2);

    for (let vi = 0; vi < 4; vi++) {
      const vg = Math.sin(f * 0.11 + vi * 0.9) * 0.5 + 0.5;
      ctx.fillStyle = done ? '#2a5a2a' : `rgba(200,120,0,${vg * 0.7 + 0.3})`;
      ctx.fillRect(x + 3 + vi * 7, y + 5, 4, 10);
      ctx.fillStyle = done ? '#4aaa4a' : `rgba(255,210,60,${vg})`; ctx.fillRect(x + 4 + vi * 7, y + 6, 2, 4);
      ctx.fillStyle = '#3a2800'; ctx.fillRect(x + 2 + vi * 7, y + 15, 6, 2);
    }

    ctx.fillStyle = '#0e0c00'; ctx.fillRect(x + 2, y + 18, S - 4, 8);
    const patchColors = ['#cc0000','#00cc00','#0000cc','#cccc00','#cc8800','#ffffff'];
    for (let fi = 0; fi < 6; fi++) {
      ctx.fillStyle = patchColors[fi]; ctx.fillRect(x + 3 + fi * 4, y + 20, 2, 4);
    }

    ctx.fillStyle = '#1e1600'; ctx.fillRect(x + 2, y + S - 9, S - 4, 7);
    for (let bi = 0; bi < 5; bi++) {
      const bOn = Math.sin(f * 0.09 + bi * 1.3) > 0.3;
      ctx.fillStyle = bOn ? (done ? '#44ff44' : '#ffaa00') : (done ? '#114411' : '#442200');
      ctx.fillRect(x + 3 + bi * 5, y + S - 7, 3, 4);
    }
    ctx.fillStyle = done ? '#44aa44' : '#8a7000';
    ctx.font = '4px monospace'; ctx.fillText('ENIAC', x + 2, y + 4);
  }

  _machineApple2(x, y, era, done, f) {
    const ctx  = this.ctx;
    const glow = Math.sin(f * 0.06) * 0.5 + 0.5;

    ctx.fillStyle = done ? '#2a4a2a' : '#ccbb88'; ctx.fillRect(x + 1, y + 1, S - 2, S - 14);
    ctx.fillStyle = done ? '#1a3a1a' : '#bbaa77'; ctx.fillRect(x + 1, y + 1, S - 2, 3);
    ctx.fillStyle = done ? '#0e2a0e' : '#9a8860'; ctx.fillRect(x + S - 3, y + 1, 2, S - 14);

    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(x + 3, y + 4, S - 6, 14);
    const scrC = done ? '#44ff88' : this._lerp('#001a00', '#00ff44', glow * 0.4 + 0.3);
    ctx.fillStyle = scrC; ctx.fillRect(x + 4, y + 5, S - 8, 12);
    if (!done) {
      ctx.fillStyle = '#002200'; ctx.fillRect(x + 5, y + 6, S - 10, 1);
      ctx.fillRect(x + 5, y + 9, S - 10, 1);
      ctx.fillRect(x + 5, y + 12, S - 10, 1);
      if (f % 30 < 15) {
        ctx.fillStyle = '#00ff44'; ctx.fillRect(x + 5, y + 14, 4, 2);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let sl = 0; sl < 4; sl++) ctx.fillRect(x + 4, y + 5 + sl * 3, S - 8, 1);

    ctx.fillStyle = done ? '#2a4a2a' : '#ddcc99'; ctx.fillRect(x + 1, y + S - 12, S - 2, 10);
    ctx.fillStyle = done ? '#1a3a1a' : '#ccbb88';
    for (let ki = 0; ki < 7; ki++) {
      ctx.fillRect(x + 2 + ki * 4, y + S - 10, 3, 4);
      ctx.fillStyle = done ? '#0e2a0e' : '#bbaa77'; ctx.fillRect(x + 2 + ki * 4, y + S - 10, 3, 1);
      ctx.fillStyle = done ? '#1a3a1a' : '#ccbb88';
    }
    ctx.fillStyle = done ? '#44aa44' : '#998855'; ctx.fillRect(x + S - 9, y + 2, 4, 5);
    ctx.fillStyle = done ? '#88ff88' : '#ccbb66'; ctx.fillRect(x + S - 8, y + 3, 2, 2);
    ctx.fillStyle = '#555'; ctx.fillRect(x + S - 2, y + S - 8, 2, 4);
  }

  _machineIBMPC(x, y, era, done, f) {
    const ctx  = this.ctx;
    const glow = Math.sin(f * 0.05) * 0.5 + 0.5;

    ctx.fillStyle = done ? '#1a3a1a' : '#888882'; ctx.fillRect(x + 1, y + S - 13, S - 2, 11);
    ctx.fillStyle = done ? '#2a4a2a' : '#a8a8a0'; ctx.fillRect(x + 1, y + S - 13, S - 2, 3);
    ctx.fillStyle = done ? '#0e2a0e' : '#666860'; ctx.fillRect(x + 3, y + S - 10, 16, 6);
    ctx.fillStyle = done ? '#1a3a1a' : '#888882'; ctx.fillRect(x + 4, y + S - 9, 14, 3);
    const ledOn = Math.sin(f * 0.06) > 0;
    ctx.fillStyle = ledOn ? '#22ff44' : '#0a1a0a'; ctx.fillRect(x + S - 6, y + S - 9, 3, 3);

    ctx.fillStyle = done ? '#2a4a2a' : '#aaaaA0'; ctx.fillRect(x + 2, y + 2, S - 4, S - 17);
    ctx.fillStyle = done ? '#1a3a1a' : '#888878'; ctx.fillRect(x + 2, y + 2, S - 4, 3);
    const scrC = done ? '#44ff88' : this._lerp('#140800', '#ff9900', glow * 0.5 + 0.3);
    ctx.fillStyle = '#000'; ctx.fillRect(x + 4, y + 5, S - 8, S - 26);
    ctx.fillStyle = scrC; ctx.fillRect(x + 5, y + 6, S - 10, S - 28);
    if (!done) {
      ctx.fillStyle = '#ff8800'; ctx.font = '5px monospace'; ctx.fillText('A:>', x + 6, y + S - 24);
      if (f % 30 < 15) { ctx.fillStyle = '#ff8800'; ctx.fillRect(x + 18, y + S - 25, 4, 2); }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let sl = 0; sl < 3; sl++) ctx.fillRect(x + 5, y + 6 + sl * 5, S - 10, 1);

    ctx.fillStyle = '#2244cc'; ctx.fillRect(x + 3, y + S - 11, 10, 4);
    ctx.fillStyle = '#4466ff'; ctx.font = '4px monospace'; ctx.fillText('IBM', x + 4, y + S - 8);
    ctx.fillStyle = '#666'; ctx.fillRect(x - 1, y + S - 6, 4, 1);
  }

  _machineMac128(x, y, era, done, f) {
    const ctx  = this.ctx;
    const glow = Math.sin(f * 0.055) * 0.5 + 0.5;

    ctx.fillStyle = done ? '#2a4a2a' : '#ddcca8'; ctx.fillRect(x + 3, y + 1, S - 6, S - 4);
    ctx.fillStyle = done ? '#1a3a1a' : '#ccbb97'; ctx.fillRect(x + 3, y + 1, S - 6, 3);
    ctx.fillStyle = done ? '#0e2a0e' : '#9a8870'; ctx.fillRect(x + S - 5, y + 1, 2, S - 4);

    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(x + 5, y + 4, S - 12, 15);
    const macScreen = done ? '#44ff88' : this._lerp('#000820', '#bbddff', glow * 0.4 + 0.4);
    ctx.fillStyle = macScreen; ctx.fillRect(x + 6, y + 5, S - 14, 13);
    if (!done) {
      ctx.fillStyle = '#000088'; ctx.fillRect(x + 6, y + 5, S - 14, 3);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 7, y + 6, 8, 1);
      ctx.fillStyle = '#000066'; ctx.fillRect(x + 8, y + 10, 5, 5);
      ctx.fillStyle = '#0000aa'; ctx.fillRect(x + 15, y + 11, 5, 5);
      ctx.fillStyle = '#000'; ctx.fillRect(x + 17, y + 14, 2, 3); ctx.fillRect(x + 19, y + 16, 2, 1);
    } else {
      ctx.fillStyle = '#00ff88'; ctx.font = '5px monospace'; ctx.fillText('✓ OK', x + 6, y + 14);
    }

    ctx.fillStyle = done ? '#0e2a0e' : '#aaa090'; ctx.fillRect(x + 5, y + 20, S - 12, 3);
    ctx.fillStyle = done ? '#2a4a2a' : '#ccbb97'; ctx.fillRect(x + 9, y + 21, 10, 1);

    ctx.fillStyle = done ? '#2a4a2a' : '#ddcca8'; ctx.fillRect(x + 3, y + S - 10, S - 6, 8);
    ctx.fillStyle = done ? '#1a3a1a' : '#ccbb97'; ctx.fillRect(x + 10, y + S - 5, 12, 2);
    ctx.fillStyle = done ? '#2a4a2a' : '#ddcca8'; ctx.fillRect(x + S / 2 - 4, y + 1, 8, 4);
    ctx.fillStyle = done ? '#1a3a1a' : '#ccbb97'; ctx.fillRect(x + S / 2 - 3, y + 2, 6, 2);

    const aColors = ['#ff4444','#ff9900','#ffff44','#44cc44','#4444ff','#aa44aa'];
    for (let ac = 0; ac < 6; ac++) {
      ctx.fillStyle = done ? '#44aa44' : aColors[ac]; ctx.fillRect(x + 12 + ac, y + S - 8, 1, 4);
    }
  }

  _machinePCModerno(x, y, era, done, f) {
    const ctx  = this.ctx;
    const glow = Math.sin(f * 0.07) * 0.5 + 0.5;

    ctx.fillStyle = done ? '#1a3a1a' : '#111'; ctx.fillRect(x + 1, y + 1, S - 2, S - 14);
    ctx.fillStyle = done ? '#44ff88' : this._lerp('#000510', '#00eeff', glow * 0.5 + 0.4);
    ctx.fillRect(x + 2, y + 2, S - 4, S - 16);
    if (!done) {
      ctx.fillStyle = 'rgba(0,200,255,0.4)';
      for (let li = 0; li < 5; li++) ctx.fillRect(x + 3, y + 3 + li * 4, 3 + li * 3, 2);
      ctx.fillStyle = 'rgba(0,255,180,0.5)';
      ctx.fillRect(x + 18, y + 3, 2, 13); ctx.fillRect(x + 22, y + 6, 2, 10);
      ctx.fillStyle = 'rgba(0,220,255,0.6)'; ctx.fillRect(x + 3, y + S - 18, S - 8, 1);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let sl = 0; sl < 6; sl++) ctx.fillRect(x + 2, y + 2 + sl * 3, S - 4, 1);
    ctx.fillStyle = done ? '#2a4a2a' : '#1a1a1a'; ctx.fillRect(x + S / 2 - 3, y + S - 13, 6, 3);
    ctx.fillRect(x + S / 2 - 6, y + S - 11, 12, 2);

    ctx.fillStyle = done ? '#0e2a0e' : '#141424'; ctx.fillRect(x + 2, y + S - 9, S - 4, 7);
    ctx.fillStyle = done ? '#1a3a1a' : '#1e1e32'; ctx.fillRect(x + 2, y + S - 9, S - 4, 2);
    if (!done) {
      const hue = (f * 2.5) % 360;
      ctx.fillStyle = `hsl(${hue},100%,55%)`; ctx.fillRect(x + 3, y + S - 4, S - 6, 1);
      ctx.fillStyle = `hsl(${(hue + 120) % 360},100%,55%)`; ctx.fillRect(x + 3, y + S - 3, S - 6, 1);
    } else {
      ctx.fillStyle = '#00ff88'; ctx.fillRect(x + 3, y + S - 4, S - 6, 2);
    }
    ctx.fillStyle = glow > 0.5 ? '#00ccff' : '#003344'; ctx.fillRect(x + S - 7, y + S - 8, 3, 3);
    const diskLed = Math.sin(f * 0.3 + 1.5) > 0.6;
    ctx.fillStyle = diskLed ? '#ff6600' : '#220000'; ctx.fillRect(x + S - 12, y + S - 8, 2, 2);
  }

  _machineGeneric(x, y, era, done, f) {
    const ctx  = this.ctx;
    const c    = done ? '#1e4e1e' : era.accentColor;
    const glow = Math.sin(f * 0.07) * 0.5 + 0.5;
    ctx.fillStyle = c; ctx.fillRect(x + 2, y + 3, S - 4, S - 6);
    ctx.fillStyle = this._lighten(c, 0.35); ctx.fillRect(x + 2, y + 3, S - 4, 3);
    ctx.fillStyle = this._darken(c, 0.28); ctx.fillRect(x + S - 4, y + 3, 2, S - 6);
    const scrC = done ? '#44ff88' : this._lerp('#003344', '#00ffcc', glow * 0.5 + 0.3);
    ctx.fillStyle = scrC; ctx.fillRect(x + 5, y + 7, S - 10, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 3; i++) ctx.fillRect(x + 5, y + 7 + i * 4, S - 10, 1);
  }

  _drawPortal(x, y, era, f) {
    const ctx = this.ctx;
    const cx  = x + S / 2, cy = y + S / 2;
    const r   = 11 + Math.sin(f * 0.08) * 2.5;
    const ac  = era.accentColor;

    switch (era.decorType) {

      case 'workbench': {
        const angle = (f * 0.045) % (Math.PI * 2);
        for (let i = 0; i < 8; i++) {
          const a = angle + i * Math.PI / 4;
          const gr = r + 2 + Math.sin(f * 0.06 + i) * 1.5;
          ctx.fillStyle = '#cc8800'; ctx.fillRect(cx + Math.cos(a) * gr - 2, cy + Math.sin(a) * gr - 2, 4, 4);
        }
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(80,200,255,${0.6 + Math.sin(f*0.1)*0.15})`);
        g.addColorStop(0.5, `rgba(30,130,255,0.4)`);
        g.addColorStop(1, 'rgba(0,60,180,0)');
        ctx.fillStyle = g; ctx.fillRect(x, y, S, S);
        ctx.fillStyle = 'rgba(200,230,255,0.85)'; ctx.fillRect(cx - 2, cy - 2, 4, 4);
        break;
      }

      case 'military': {
        const sweep = (f * 0.055) % (Math.PI * 2);
        ctx.fillStyle = `rgba(150,130,0,0.25)`; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        for (let ri = 1; ri < 10; ri++) {
          const px = cx + Math.cos(sweep) * (r * ri / 10);
          const py = cy + Math.sin(sweep) * (r * ri / 10);
          const a  = (1 - ri / 10) * 0.7;
          ctx.fillStyle = `rgba(220,200,0,${a})`; ctx.fillRect(px - 1, py - 1, 2, 2);
        }
        ctx.fillStyle = 'rgba(200,180,0,0.6)';
        ctx.fillRect(cx - r, cy, r * 2, 1); ctx.fillRect(cx, cy - r, 1, r * 2);
        ctx.fillStyle = '#ffe800'; ctx.fillRect(cx - 2, cy - 2, 4, 4);
        break;
      }

      case 'garage_sv': {
        for (let pi = 0; pi < 8; pi++) {
          const a  = (f * 0.065 + pi * Math.PI / 4) % (Math.PI * 2);
          const pr = r + 2 + Math.sin(f * 0.11 + pi) * 2;
          const px = cx + Math.cos(a) * pr;
          const py = cy + Math.sin(a) * pr;
          ctx.fillStyle = `rgba(40,220,80,${Math.sin(f*0.09+pi)*0.4+0.5})`; ctx.fillRect(px - 2, py - 2, 4, 4);
        }
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(0,255,80,${0.6+Math.sin(f*0.08)*0.1})`);
        g.addColorStop(0.5, 'rgba(0,160,40,0.35)');
        g.addColorStop(1, 'rgba(0,80,20,0)');
        ctx.fillStyle = g; ctx.fillRect(x, y, S, S);
        ctx.fillStyle = 'rgba(180,255,200,0.9)'; ctx.fillRect(cx - 2, cy - 2, 4, 4);
        break;
      }

      case 'corporate': {
        const g1 = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r);
        g1.addColorStop(0, 'rgba(0,0,0,0.25)'); g1.addColorStop(1, 'rgba(30,80,200,0)');
        ctx.fillStyle = g1; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
        const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.65);
        g2.addColorStop(0, `rgba(80,140,255,${0.6+Math.sin(f*0.07)*0.1})`);
        g2.addColorStop(1, 'rgba(30,80,200,0)');
        ctx.fillStyle = g2; ctx.fillRect(x, y, S, S);
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + f * 0.02;
          ctx.fillStyle = '#4488ff';
          ctx.fillRect(cx + Math.cos(a) * (r - 2) - 2, cy + Math.sin(a) * (r - 2) - 2, 4, 4);
        }
        ctx.fillStyle = 'rgba(200,220,255,0.9)'; ctx.fillRect(cx - 2, cy - 2, 4, 4);
        break;
      }

      case 'theater': {
        const drama = Math.sin(f * 0.065) * 0.35 + 0.55;
        const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r + 4);
        g1.addColorStop(0, `rgba(255,60,60,${drama * 0.55})`);
        g1.addColorStop(0.5, `rgba(160,0,200,${drama * 0.3})`);
        g1.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g1; ctx.fillRect(x, y, S, S);
        for (let i = 0; i < 6; i++) {
          const a = (f * 0.045 + i * Math.PI / 3) % (Math.PI * 2);
          ctx.fillStyle = `rgba(255,220,100,${Math.sin(f*0.08+i)*0.4+0.5})`;
          ctx.fillRect(cx + Math.cos(a) * (r + 4) - 1, cy + Math.sin(a) * (r + 4) - 1, 2, 2);
        }
        ctx.fillStyle = 'rgba(255,200,200,0.9)'; ctx.fillRect(cx - 2, cy - 2, 4, 4);
        break;
      }

      case 'datacenter': {
        for (let i = 0; i < 8; i++) {
          const a1 = (i / 8 + f * 0.006) * Math.PI * 2;
          const p  = Math.sin(f * 0.09 + i * 0.6) * 0.35 + 0.55;
          ctx.fillStyle = `rgba(0,220,255,${p * 0.6})`;
          ctx.fillRect(cx + Math.cos(a1) * r - 1, cy + Math.sin(a1) * r - 1, 3, 3);
        }
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(0,240,255,${0.55+Math.sin(f*0.09)*0.1})`);
        g.addColorStop(0.5, 'rgba(0,160,255,0.3)');
        g.addColorStop(1, 'rgba(0,80,180,0)');
        ctx.fillStyle = g; ctx.fillRect(x, y, S, S);
        const da = (f * 0.065) % (Math.PI * 2);
        for (let i = 0; i < 6; i++) {
          const a = da + i * Math.PI / 3;
          ctx.fillStyle = '#00ffff';
          ctx.fillRect(cx + Math.cos(a) * (r * 0.75) - 1, cy + Math.sin(a) * (r * 0.75) - 1, 2, 2);
        }
        ctx.fillStyle = 'rgba(200,255,255,0.9)'; ctx.fillRect(cx - 2, cy - 2, 4, 4);
        break;
      }

      default: {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(${this._hexToRgb(ac)},0.65)`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(x, y, S, S);
        ctx.fillStyle = '#fff'; ctx.fillRect(cx - 2, cy - 2, 4, 4);
      }
    }
  }

  drawPlayer(player, era) {
    const ctx = this.ctx;
    const f   = this.frameCount;
    const px  = Math.round(player.x);
    const py  = Math.round(player.y);
    const dir = player.direction;
    const mov = player.isMoving;

    const swing = mov ? Math.sin(f * 0.32) : 0;
    const lA    = Math.round(swing * 3);
    const aA    = Math.round(-swing * 2);

    const F = (x, y, w, h, c) => {
      ctx.fillStyle = c; ctx.fillRect(px + x, py + y, w, h);
    };

    const sg = ctx.createRadialGradient(px+16, py+31, 2, px+16, py+31, 14);
    sg.addColorStop(0, 'rgba(0,0,0,0.55)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg; ctx.fillRect(px+3, py+24, 26, 9);

    F(8,  20+lA, 8, 9, '#0a0d1a');
    F(9,  21+lA, 6, 8, '#1e3a88');
    F(9,  21+lA, 6, 2, '#3050b8');
    F(9,  26+lA, 6, 2, '#152a60');
    F(7,  27+lA, 9, 4, '#0d0d10');
    F(8,  28+lA, 8, 3, '#222226');
    F(8,  28+lA, 8, 1, '#3a3a40');

    F(16, 20-lA, 8, 9, '#0a0d1a');
    F(17, 21-lA, 6, 8, '#1e3a88');
    F(17, 21-lA, 6, 2, '#3050b8');
    F(17, 26-lA, 6, 2, '#152a60');
    F(15, 27-lA, 9, 4, '#0d0d10');
    F(16, 28-lA, 8, 3, '#222226');
    F(16, 28-lA, 8, 1, '#3a3a40');

    F(5, 10, 22, 11, '#0a0a0a');
    F(6, 11, 20, 10, '#cc2211');
    F(6, 11, 20,  2, '#ee4433');
    F(6, 18, 20,  3, '#991100');
    F(14, 11, 4,  2, '#ff5544');

    F(1, 12+aA, 6, 9, '#0a0a0a');
    F(2, 13+aA, 4, 7, '#f4c07a');
    F(2, 13+aA, 4, 1, '#d4965a');
    F(2, 18+aA, 4, 2, '#c88050');

    F(25, 12-aA, 6, 9, '#0a0a0a');
    F(26, 13-aA, 4, 7, '#f4c07a');
    F(26, 13-aA, 4, 1, '#d4965a');
    F(26, 18-aA, 4, 2, '#c88050');

    F(13, 8, 6, 4, '#0a0a0a');
    F(14, 9, 4, 3, '#f4c07a');

    F(9, 0, 14, 11, '#0a0a0a');
    F(7,  4, 3, 5, '#0a0a0a');
    F(8,  5, 2, 3, '#e8a870');
    F(22, 4, 3, 5, '#0a0a0a');
    F(22, 5, 2, 3, '#e8a870');
    F(10, 1, 12, 9, '#f4c07a');
    F(10, 9, 12, 2, '#d4905a');

    F(9,  0, 14, 5, '#0a0a0a');
    F(10, 0, 12, 4, '#1e0e00');
    F(9,  0,  2, 8, '#1a0c00');
    F(21, 0,  2, 8, '#1a0c00');
    F(11, 0,  5, 2, '#2e1800');
    F(17, 0,  4, 3, '#3a2200');
    F(10, 0,  3, 1, '#2e1800');

    this._drawPlayerFace(ctx, px, py, dir, f);

    if (player.nearMachine) {
      const alpha = Math.sin(f * 0.15) * 0.5 + 0.5;
      F(7, -14, 18, 12, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = `rgba(255,220,0,${alpha * 0.92})`; ctx.fillRect(px+7, py-14, 18, 11);
      ctx.fillStyle = '#0a0500';
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('[E]', px+16, py-6);
      ctx.textAlign = 'left';
    }
    if (player.nearPortal) {
      const alpha = Math.sin(f * 0.13) * 0.4 + 0.55;
      const rgb   = this._portalGlowRgb(era.decorType);
      F(7, -14, 18, 12, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = `rgba(${rgb},${alpha * 0.9})`; ctx.fillRect(px+7, py-14, 18, 11);
      ctx.fillStyle = 'rgba(0,10,20,0.9)';
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('[E]', px+16, py-6);
      ctx.textAlign = 'left';
    }
  }

  _drawPlayerFace(ctx, px, py, dir, f) {
    const F = (x, y, w, h, c) => {
      ctx.fillStyle = c; ctx.fillRect(px+x, py+y, w, h);
    };

    switch (dir) {
      case 0: {
        F(11, 2, 4, 1, '#1e0e00');
        F(17, 2, 4, 1, '#1e0e00');
        F(10, 3, 5, 4, '#0a0a0a');
        F(11, 4, 3, 2, '#2a1800');
        F(12, 4, 1, 1, '#fff');
        F(17, 3, 5, 4, '#0a0a0a');
        F(18, 4, 3, 2, '#2a1800');
        F(18, 4, 1, 1, '#fff');
        F(10, 7, 2, 2, 'rgba(220,110,80,0.28)');
        F(20, 7, 2, 2, 'rgba(220,110,80,0.28)');
        F(15, 6, 2, 2, '#d49060');
        F(12, 8, 8, 1, '#b06050');
        F(11, 7, 2, 1, '#cc7060');
        F(19, 7, 2, 1, '#cc7060');
        break;
      }
      case 3: {
        F(10, 0, 12, 10, '#1e0e00');
        F(9,  0,  2, 10, '#1a0c00');
        F(21, 0,  2, 10, '#1a0c00');
        break;
      }
      case 1: {
        F(19, 0, 4, 10, '#1e0e00');
        F(10, 3, 5, 4, '#0a0a0a');
        F(11, 4, 3, 2, '#2a1800');
        F(11, 4, 1, 1, '#fff');
        F(10, 2, 5, 1, '#1e0e00');
        F(10, 6, 2, 1, '#d49060');
        F(10, 8, 4, 1, '#b06050');
        break;
      }
      case 2: {
        F(9, 0, 4, 10, '#1e0e00');
        F(17, 3, 5, 4, '#0a0a0a');
        F(18, 4, 3, 2, '#2a1800');
        F(21, 4, 1, 1, '#fff');
        F(17, 2, 5, 1, '#1e0e00');
        F(20, 6, 2, 1, '#d49060');
        F(18, 8, 4, 1, '#b06050');
        break;
      }
    }
  }

  drawOverlay(alpha = 0.35) {
    this.ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    this.ctx.fillRect(0, 0, CW, CH);
  }

  drawPortrait(canvas, type, era) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    switch (type) {
      case 'grandpa':  this._drawGrandpa(ctx, w, h); break;
      case 'lucas':    this._drawLucas(ctx, w, h);   break;
      case 'narrator':
        ctx.fillStyle = '#0a0a1a'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#8888bb'; ctx.fillRect(w/2-2, h/2-8, 4, 4);
        ctx.fillStyle = '#6666aa'; ctx.fillRect(w/4, h/3, 2, 2); ctx.fillRect(w*3/4-2, h/3, 2, 2);
        ctx.fillRect(w/4, h*2/3-2, 2, 2); ctx.fillRect(w*3/4-2, h*2/3-2, 2, 2);
        ctx.fillStyle = '#4444aa'; ctx.font = '9px monospace'; ctx.fillText('?', w/2-4, h/2+3);
        break;
      default:
        if (era?.machine) {
          this._drawMachinePortrait(ctx, w, h, era);
        } else {
          ctx.fillStyle = '#0a0a1a'; ctx.fillRect(0, 0, w, h);
        }
    }
  }

  _drawGrandpa(ctx, w, h) {
    const F = (x, y, W, H, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, W, H); };

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#100e0c'); bg.addColorStop(1, '#080604');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    const gw = ctx.createRadialGradient(w/2, h, 0, w/2, h, h*0.75);
    gw.addColorStop(0, 'rgba(80,50,20,0.22)'); gw.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gw; ctx.fillRect(0, 0, w, h);

    F(4, 44, 56, 20, '#0a0a0a');
    F(5, 45, 54, 19, '#d2d2e0');
    F(5, 45, 54,  4, '#e8e8f4');
    F(5, 54, 54, 10, '#aaaabc');
    F(5, 45, 18, 19, '#b8b8c8');
    F(41, 45, 18, 19, '#b8b8c8');
    F(24, 44, 16, 20, '#e8e8f4');
    F(27, 45, 10, 18, '#1a3a88');
    F(28, 46,  8, 16, '#2244aa');
    F(29, 47,  6, 14, '#3358cc');
    F(27, 44, 10,  6, '#1a3a88');
    F(28, 45,  8,  4, '#3054bb');
    F(8, 49, 12, 12, '#0a0a0a');
    F(9, 50, 10, 11, '#b0b0c0');
    F(9, 50, 10,  1, '#d0d0e0');
    F(11, 49, 3, 12, '#3366ff');
    F(12, 49, 1,  3, '#88aaff');
    F(11, 60, 3,  1, '#1144cc');

    F(24, 36, 16, 10, '#0a0a0a');
    F(25, 37, 14,  8, '#c8a070');
    F(25, 37, 14,  2, '#b09060');

    F(12, 6, 40, 34, '#0a0a0a');
    F(10, 19, 4, 10, '#0a0a0a'); F(11, 20, 2, 8, '#c8a070');
    F(50, 19, 4, 10, '#0a0a0a'); F(51, 20, 2, 8, '#c8a070');
    F(13, 7, 38, 32, '#c8a070');
    F(13, 34, 38, 4, '#a88050');
    F(13,  7, 38, 2, '#a88050');

    F(13, 15, 8,  1, '#b89060');
    F(43, 15, 8,  1, '#b89060');
    F(13, 19, 5,  1, '#b89060');
    F(46, 19, 5,  1, '#b89060');

    F(21,  6, 22,  4, '#c8a070');
    F(12,  6, 12, 14, '#0a0a0a');
    F(40,  6, 12, 14, '#0a0a0a');
    F(13,  7, 10, 12, '#e4e4f0');
    F(14,  7,  8,  5, '#f2f2ff');
    F(41,  7, 10, 12, '#e4e4f0');
    F(42,  7,  8,  5, '#f2f2ff');
    F(20,  6,  4,  3, '#d8d8ea');
    F(40,  6,  4,  3, '#d8d8ea');

    F(28, 22, 8, 2, '#5a5a78');
    F(14, 18, 16, 12, '#0a0a0a');
    F(15, 19, 14, 10, '#4a4a6a');
    F(15, 19, 14,  2, '#7878a0');
    F(16, 20, 12,  8, 'rgba(160,200,255,0.2)');
    F(16, 20,  5,  3, 'rgba(255,255,255,0.38)');
    F(34, 18, 16, 12, '#0a0a0a');
    F(35, 19, 14, 10, '#4a4a6a');
    F(35, 19, 14,  2, '#7878a0');
    F(36, 20, 12,  8, 'rgba(160,200,255,0.2)');
    F(36, 20,  5,  3, 'rgba(255,255,255,0.38)');
    F(10, 22, 4, 2, '#4a4a6a');
    F(50, 22, 4, 2, '#4a4a6a');

    F(18, 22, 8, 5, '#0a0a0a');
    F(19, 23, 6, 3, '#3a2800');
    F(21, 24, 2, 2, '#1e1200');
    F(19, 23, 1, 1, '#ffffff');
    F(38, 22, 8, 5, '#0a0a0a');
    F(39, 23, 6, 3, '#3a2800');
    F(41, 24, 2, 2, '#1e1200');
    F(39, 23, 1, 1, '#ffffff');

    F(14, 16, 16, 4, '#0a0a0a');
    F(15, 16, 14, 3, '#d8d8ea');
    F(15, 15,  5, 2, '#d8d8ea');
    F(34, 16, 16, 4, '#0a0a0a');
    F(35, 16, 14, 3, '#d8d8ea');
    F(44, 15,  5, 2, '#d8d8ea');

    F(29, 28, 6, 6, '#0a0a0a');
    F(30, 29, 4, 5, '#b09060');
    F(28, 32, 8, 3, '#988050');

    F(20, 33, 24, 6, '#0a0a0a');
    F(21, 33, 22, 5, '#d8d8ea');
    F(21, 33, 22, 2, '#eeeefc');
    F(26, 34,  6, 2, '#c0c0d4');
    F(32, 34,  6, 2, '#c0c0d4');

    F(24, 37, 16, 4, '#0a0a0a');
    F(25, 38, 14, 2, '#c07060');
    F(25, 38, 14, 1, '#aa5050');
    F(20, 36, 4, 4, '#a88050');
    F(40, 36, 4, 4, '#a88050');
  }

  _drawLucas(ctx, w, h) {
    ctx.fillStyle = '#080c12'; ctx.fillRect(0, 0, w, h);
    const bg = ctx.createLinearGradient(0, h/2, 0, h);
    bg.addColorStop(0, '#101828'); bg.addColorStop(1, '#080c18');
    ctx.fillStyle = bg; ctx.fillRect(0, h/2, w, h/2);

    ctx.fillStyle = '#bb2211'; ctx.fillRect(8, 40, 48, 24);
    ctx.fillStyle = '#991100'; ctx.fillRect(8, 40, 48, 2);
    ctx.fillStyle = '#dd3322'; ctx.fillRect(8, 40, 48, 1);
    ctx.fillStyle = '#cc3322'; ctx.fillRect(26, 44, 12, 10);

    ctx.fillStyle = '#f0bb80'; ctx.fillRect(26, 32, 12, 10);

    ctx.fillStyle = '#f0bb80'; ctx.fillRect(16, 12, 32, 22);
    ctx.fillStyle = 'rgba(220,120,80,0.3)'; ctx.fillRect(16, 22, 6, 8); ctx.fillRect(42, 22, 6, 8);
    ctx.fillStyle = '#e0aa70'; ctx.fillRect(14, 18, 3, 8); ctx.fillRect(47, 18, 3, 8);

    ctx.fillStyle = '#1a0c00'; ctx.fillRect(16, 9, 32, 8);
    ctx.fillStyle = '#110800'; ctx.fillRect(12, 12, 8, 10); ctx.fillRect(44, 12, 8, 10);
    ctx.fillStyle = '#0c0500'; ctx.fillRect(20, 9, 5, 5); ctx.fillRect(35, 9, 4, 4);
    ctx.fillStyle = '#241000'; ctx.fillRect(28, 10, 6, 6);

    ctx.fillStyle = '#2a1200'; ctx.fillRect(20, 20, 8, 7); ctx.fillRect(36, 20, 8, 7);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(22, 21, 3, 3); ctx.fillRect(38, 21, 3, 3);
    ctx.fillStyle = '#1a0a00'; ctx.fillRect(21, 21, 4, 4); ctx.fillRect(37, 21, 4, 4);
    ctx.fillStyle = '#ff8844'; ctx.fillRect(22, 22, 1, 1); ctx.fillRect(38, 22, 1, 1);

    ctx.fillStyle = '#d09060'; ctx.fillRect(28, 26, 8, 3);

    ctx.fillStyle = '#c05040'; ctx.fillRect(22, 30, 20, 2);
    ctx.fillStyle = '#a03828'; ctx.fillRect(21, 29, 2, 2); ctx.fillRect(41, 29, 2, 2);

    ctx.fillStyle = '#221100'; ctx.fillRect(20, 18, 8, 2); ctx.fillRect(36, 18, 8, 2);
  }

  _drawMachinePortrait(ctx, w, h, era) {
    ctx.fillStyle = era.machine.portraitColor || '#001122'; ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0.04)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const ac = era.accentColor;

    switch (era.decorType) {
      case 'military': {
        ctx.fillStyle = '#111000'; ctx.fillRect(4, 6, w-8, h-22);
        ctx.fillStyle = '#2a2000'; ctx.fillRect(5, 7, w-10, h-24);
        for (let vi = 0; vi < 4; vi++) {
          ctx.fillStyle = `rgba(220,140,0,0.9)`; ctx.fillRect(6 + vi * 13, 9, 9, 24);
          ctx.fillStyle = '#ffcc44'; ctx.fillRect(8 + vi * 13, 11, 5, 8);
          ctx.fillStyle = 'rgba(255,180,60,0.3)'; ctx.fillRect(6 + vi * 13, 9, 9, 24);
        }
        ctx.fillStyle = ac; ctx.fillRect(4, h-16, w-8, 8);
        ctx.fillStyle = '#fff'; ctx.font = '5px monospace'; ctx.fillText('ENIAC', 6, h-10);
        break;
      }
      case 'garage_sv': {
        ctx.fillStyle = '#ccbb88'; ctx.fillRect(6, 6, w-12, h-16);
        ctx.fillStyle = '#001800'; ctx.fillRect(8, 9, w-16, 20);
        ctx.fillStyle = '#00ff44'; ctx.fillRect(9, 10, w-18, 18);
        ctx.fillStyle = '#002200'; for (let sl = 0; sl < 3; sl++) ctx.fillRect(9, 10+sl*6, w-18, 1);
        if (Math.random() > 0.5) { ctx.fillStyle = '#00ff44'; ctx.fillRect(10, 24, 5, 2); }
        ctx.fillStyle = '#ddcc99'; ctx.fillRect(6, h-18, w-12, 10);
        ctx.fillStyle = '#ccbb88'; ctx.fillRect(8, h-22, w-16, 6);
        break;
      }
      case 'corporate': {
        ctx.fillStyle = '#999990'; ctx.fillRect(4, h-18, w-8, 16);
        ctx.fillStyle = '#888880'; ctx.fillRect(4, h-18, w-8, 4);
        ctx.fillStyle = '#7a7a72'; ctx.fillRect(4, 6, w-8, h-27);
        ctx.fillStyle = '#0a0a0a'; ctx.fillRect(6, 8, w-12, h-32);
        ctx.fillStyle = '#ff8800'; ctx.fillRect(7, 9, w-14, h-34);
        ctx.fillStyle = '#ff3300'; ctx.fillRect(7, 9, w-14, 1);
        ctx.fillStyle = '#2244cc'; ctx.fillRect(6, h-14, 16, 6);
        ctx.fillStyle = '#4466ff'; ctx.font = '4px monospace'; ctx.fillText('IBM', 8, h-9);
        break;
      }
      case 'theater': {
        ctx.fillStyle = '#ddcca8'; ctx.fillRect(8, 5, w-16, h-10);
        ctx.fillStyle = '#0a0a0a'; ctx.fillRect(10, 9, w-20, 22);
        ctx.fillStyle = '#bbddff'; ctx.fillRect(11, 10, w-22, 20);
        ctx.fillStyle = '#000088'; ctx.fillRect(11, 10, w-22, 5);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(12, 12, 14, 1);
        ctx.fillStyle = '#ddcca8'; ctx.fillRect(8, h-13, w-16, 8);
        ctx.fillStyle = '#ccbb97'; ctx.fillRect(w/2-6, h-7, 12, 3);
        const aCol = ['#ff4444','#ff9900','#ffff44','#44cc44','#4444ff','#aa44aa'];
        for (let i = 0; i < 6; i++) { ctx.fillStyle = aCol[i]; ctx.fillRect(12+i*4, h-10, 3, 5); }
        break;
      }
      case 'datacenter': {
        ctx.fillStyle = '#080808'; ctx.fillRect(4, 4, w-8, h-12);
        ctx.fillStyle = ac; ctx.fillRect(5, 5, w-10, h-14);
        ctx.fillStyle = 'rgba(0,200,255,0.35)'; for (let li = 0; li < 6; li++) ctx.fillRect(7, 8+li*6, 4+li*5, 3);
        ctx.fillStyle = 'rgba(0,255,180,0.4)'; ctx.fillRect(20, 6, 2, 14); ctx.fillRect(25, 9, 2, 11);
        ctx.fillStyle = '#111'; ctx.fillRect(w/2-5, h-10, 10, 4);
        ctx.fillStyle = '#00eeff'; ctx.fillRect(5, h-6, w-10, 2);
        break;
      }
      default: {
        ctx.fillStyle = '#001122'; ctx.fillRect(6, 8, w-12, h-25);
        ctx.fillStyle = '#00ddff'; ctx.fillRect(6, 8, w-12, 2);
        ctx.fillStyle = '#00ff88';
        for (let i = 0; i < 5; i++) ctx.fillRect(8, 14 + i * 8, 6 + (i * 8) % 20, 2);
        ctx.fillStyle = ac; ctx.fillRect(16, h-16, w-32, 6); ctx.fillRect(10, h-10, w-20, 4);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, h-4, w, 4);
  }

  _darken(hex, amount) {
    const [r,g,b] = this._parseHex(hex);
    return `rgb(${Math.max(0,r-Math.round(255*amount))},${Math.max(0,g-Math.round(255*amount))},${Math.max(0,b-Math.round(255*amount))})`;
  }

  _lighten(hex, amount) {
    const [r,g,b] = this._parseHex(hex);
    return `rgb(${Math.min(255,r+Math.round(255*amount))},${Math.min(255,g+Math.round(255*amount))},${Math.min(255,b+Math.round(255*amount))})`;
  }

  _lerp(hex1, hex2, t) {
    const [r1,g1,b1] = this._parseHex(hex1);
    const [r2,g2,b2] = this._parseHex(hex2);
    return `rgb(${Math.round(r1+(r2-r1)*t)},${Math.round(g1+(g2-g1)*t)},${Math.round(b1+(b2-b1)*t)})`;
  }

  _parseHex(hex) {
    if (!hex || hex[0] !== '#') return [128,128,128];
    const h = hex.replace('#','');
    if (h.length === 3) return [parseInt(h[0]+h[0],16), parseInt(h[1]+h[1],16), parseInt(h[2]+h[2],16)];
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }

  _hexToRgb(hex) {
    const [r,g,b] = this._parseHex(hex); return `${r},${g},${b}`;
  }

  drawEndingScene(canvas) {
    const W = canvas.width; const H = canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const px = (x, y, color, w = 1, h = 1) => {
      ctx.fillStyle = color; ctx.fillRect(x * 2, y * 2, w * 2, h * 2);
    };

    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#040614'); sky.addColorStop(0.6, '#080c24'); sky.addColorStop(1, '#121e40');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    const stars = [[4,3],[12,6],[19,2],[28,8],[35,4],[42,1],[50,7],[58,3],[65,9],[72,5],
      [79,2],[87,6],[94,4],[6,14],[22,11],[38,15],[55,12],[70,10],[88,13],[96,8],
      [3,20],[15,18],[31,22],[48,19],[63,21],[77,17],[92,23],[9,28],[25,25],[44,26]];
    stars.forEach(([sx, sy]) => {
      px(sx, sy, Math.random()>0.5?'rgba(255,255,255,0.9)':'rgba(180,180,255,0.6)');
    });

    px(85, 5, '#ffffcc', 6, 6); px(86, 6, '#ffff99', 4, 4);
    px(87, 7, '#eeee88', 2, 1); px(89, 9, '#eeee88', 1, 1);
    px(90, 6, '#ffffaa', 1, 2);

    for (let gx = 0; gx < 100; gx++) {
      const shade = gx%3===0?'#2a6a28':gx%3===1?'#246022':'#1e5420';
      px(gx, 55, shade, 1, 15);
    }
    for (let gx = 0; gx < 100; gx++) px(gx, 55, '#3aaa38', 1, 1);
    [2,7,13,18,24,30,36,41,47,53,59,64,70,76,82,88,93,98].forEach(gx => {
      px(gx, 54, '#44cc40', 1, 2); px(gx+1, 53, '#3cbb38', 1, 2); px(gx-1, 54, '#38aa34', 1, 1);
    });

    px(70, 26, '#334466', 20, 28); px(71, 27, '#445577', 18, 26);
    px(73, 29, '#001133', 14, 14); px(75, 31, '#0066cc', 10, 10);
    px(77, 33, '#00aaff', 6, 6); px(79, 35, '#88ddff', 2, 2);
    px(73, 29, '#0044aa', 14, 1); px(73, 42, '#0044aa', 14, 1);
    px(73, 29, '#0044aa', 1, 14); px(86, 29, '#0044aa', 1, 14);
    px(73, 44, '#223355', 4, 4); px(79, 44, '#223355', 4, 4);
    px(74, 45, '#ff4400', 2, 2); px(80, 45, '#44ff44', 2, 2);
    px(79, 20, '#556688', 2, 7); px(78, 20, '#aabbcc', 4, 1);
    px(70, 36, '#0088ff', 2, 1); px(68, 35, '#0066cc', 1, 1); px(66, 36, '#0044aa', 1, 1);
    px(90, 36, '#0088ff', 2, 1); px(92, 35, '#0066cc', 1, 1);
    px(75, 37, '#00ffaa', 2, 1); px(79, 37, '#00ffaa', 2, 1); px(83, 37, '#00ffaa', 1, 1);

    px(0, 28, '#2a2010', 66, 27); px(0, 29, '#3a3020', 66, 1);
    px(5, 31, '#0a1428', 14, 13); px(6, 32, '#112038', 12, 11);
    px(12, 31, '#223050', 1, 13); px(5, 37, '#223050', 14, 1);
    px(7, 33, 'rgba(255,220,120,0.15)', 5, 5); px(13, 33, 'rgba(255,220,120,0.15)', 4, 5);
    px(28, 37, '#1a1008', 20, 18); px(29, 38, '#221508', 18, 16);
    px(29, 40, '#555533', 2, 2); px(29, 46, '#555533', 2, 2);
    px(45, 40, '#555533', 2, 2); px(45, 46, '#555533', 2, 2);
    px(37, 45, '#ccaa44', 2, 2);

    const ax = 22, ay = 30;
    px(ax-3, ay+12, '#8B6914', 1, 18); px(ax-5, ay+12, '#8B6914', 3, 1); px(ax-3, ay+29, '#6B4A10', 3, 1);
    px(ax+2, ay+20, '#5a5a6a', 3, 10); px(ax+6, ay+20, '#5a5a6a', 3, 10);
    px(ax+1, ay+29, '#1a1a22', 4, 2); px(ax+5, ay+29, '#1a1a22', 4, 2);
    px(ax+1, ay+11, '#d8d8e0', 9, 10);
    px(ax+2, ay+11, '#b8b8c8', 3, 8); px(ax+7, ay+11, '#b8b8c8', 3, 8);
    px(ax+5, ay+12, '#1a3a8a', 2, 7);
    px(ax+2, ay+14, '#aaaabc', 3, 3); px(ax+3, ay+13, '#3366ff', 1, 2);
    px(ax+4, ay+8, '#d4a87a', 3, 4);
    px(ax+2, ay+2, '#d4a87a', 7, 7);
    px(ax+2, ay+6, '#e8b890', 2, 2); px(ax+7, ay+6, '#e8b890', 2, 2);
    px(ax+2, ay, '#f0f0f0', 7, 3); px(ax+1, ay+1, '#e8e8e8', 2, 5); px(ax+8, ay+1, '#e8e8e8', 2, 5);
    px(ax+4, ay, '#d4a87a', 3, 1);
    px(ax+2, ay+4, '#888888', 3, 3); px(ax+6, ay+4, '#888888', 3, 3);
    px(ax+5, ay+5, '#666666', 1, 1); px(ax+1, ay+5, '#666666', 1, 1); px(ax+9, ay+5, '#666666', 1, 1);
    px(ax+3, ay+5, '#c8e0ff', 1, 1); px(ax+7, ay+5, '#c8e0ff', 1, 1);
    px(ax+3, ay+5, '#223366', 1, 1); px(ax+7, ay+5, '#223366', 1, 1);
    px(ax+3, ay+7, '#e8e8e8', 5, 1);
    px(ax+2, ay+3, '#cccccc', 3, 1); px(ax+6, ay+3, '#cccccc', 3, 1);
    px(ax+9, ay+12, '#d4a87a', 2, 5); px(ax+11, ay+14, '#d4a87a', 3, 3);

    const lx = 36, ly = 35;
    px(lx+1, ly+18, '#2244aa', 3, 9); px(lx+5, ly+18, '#2244aa', 3, 9);
    px(lx, ly+26, '#eeeeee', 4, 3); px(lx+4, ly+26, '#eeeeee', 4, 3);
    px(lx, ly+28, '#888888', 4, 1); px(lx+4, ly+28, '#888888', 4, 1);
    px(lx, ly+9, '#cc3322', 9, 10);
    px(lx, ly+9, '#aa2211', 9, 1); px(lx+3, ly+13, '#ff5544', 3, 3);
    px(lx+3, ly+6, '#ffcc88', 3, 4);
    px(lx+1, ly+1, '#ffcc88', 7, 6);
    px(lx+1, ly+5, '#ffaa77', 2, 2); px(lx+6, ly+5, '#ffaa77', 2, 2);
    px(lx+1, ly, '#221100', 7, 2); px(lx, ly+1, '#221100', 2, 4); px(lx+7, ly+1, '#221100', 2, 4);
    px(lx+3, ly, '#331a00', 2, 3); px(lx+5, ly, '#442200', 1, 2);
    px(lx+2, ly+3, '#442200', 2, 2); px(lx+6, ly+3, '#442200', 2, 2);
    px(lx+3, ly+3, '#ffffff', 1, 1); px(lx+7, ly+3, '#ffffff', 1, 1);
    px(lx+2, ly+5, '#88ccff', 1, 2);
    px(lx+3, ly+6, '#cc6644', 3, 1); px(lx+2, ly+5, '#cc6644', 1, 1); px(lx+6, ly+5, '#cc6644', 1, 1);
    px(lx+2, ly+2, '#331100', 2, 1); px(lx+6, ly+2, '#331100', 2, 1);
    px(lx, ly+10, '#ffcc88', 2, 5); px(lx-2, ly+10, '#ffcc88', 2, 3);
    px(lx+9, ly+10, '#ffcc88', 2, 5);

    const hx = 32, hy = 26;
    px(hx+1,hy,'#ff6688',2,1); px(hx+4,hy,'#ff6688',2,1);
    px(hx,hy+1,'#ff4466',4,1); px(hx+3,hy+1,'#ff4466',4,1);
    px(hx,hy+2,'#ff3355',7,1); px(hx+1,hy+3,'#ff3355',5,1);
    px(hx+2,hy+4,'#ff4466',3,1); px(hx+3,hy+5,'#ff6688',1,1);
    px(hx+1,hy,'#ffaabb',1,1);
    px(hx-2,hy-2,'#ffcc00',1,1); px(hx+9,hy-1,'#ffcc00',1,1);
    px(hx-1,hy+4,'#ffaa44',1,1); px(hx+9,hy+5,'#ffaa44',1,1);
    px(hx+4,hy-3,'#ffffff',1,1);

    px(40, 62, '#ffde00', 20, 2); px(40, 63, '#c8a000', 20, 1);

    [[68,26],[68,32],[68,40],[68,46],[90,28],[90,36],[90,44]].forEach(([sx,sy]) => {
      px(sx, sy, '#00ccff', 1, 1); px(sx-1, sy+1, 'rgba(0,200,255,0.4)', 1, 1);
    });

    [[4,54,'#ff6688'],[9,54,'#ffaa44'],[15,54,'#ff88cc'],[50,54,'#ff6688'],[56,54,'#44aaff'],[62,54,'#ffdd00']].forEach(([fx,fy,fc]) => {
      px(fx,fy,fc,2,1); px(fx+1,fy-1,'#ffffff',1,1);
    });
  }
}