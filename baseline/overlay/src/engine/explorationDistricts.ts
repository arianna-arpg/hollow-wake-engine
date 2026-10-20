import { registerDistrictBuilder } from './localeGen';

// Cross-streets between four occupied blocks. Inward doors always reach the
// square; seeded breaches add exterior approaches without deleting the streets.
registerDistrictBuilder('settlement_blocks', ({ grid, center: c, w, h, params, rng }) => {
  grid.fillRect(c.x - w / 2, c.y - h / 2, c.x + w / 2, c.y + h / 2);
  const bw = w * 0.30, bh = h * 0.30;
  const door = Math.max(90, Math.min(150, Math.min(w, h) * 0.16));
  const breach = Math.max(0, Math.min(1, params.breach ?? 0));
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const x = c.x + sx * w * 0.26, y = c.y + sy * h * 0.26;
    grid.fillRect(x - bw / 2, y - bh / 2, x + bw / 2, y + bh / 2, false);
    grid.fillRect(x - bw / 2 + 60, y - bh / 2 + 60, x + bw / 2 - 60, y + bh / 2 - 60);
    grid.carveCorridor(x, y, x - sx * bw * 0.6, y, door / 2);
    if (rng.chance(breach)) grid.carveCorridor(x, y, x, y + sy * bh * 0.6, door / 2);
  }
});

// A processional spine with paired burial wings. Sealed wall bands make the
// chambers navigational spaces rather than scattered decorative tombstones.
registerDistrictBuilder('crypt_wings', ({ grid, center: c, w, h, params }) => {
  const rows = Math.round(Math.max(2, Math.min(4, params.rows ?? 3)));
  const half = Math.max(60, Math.min(90, w * 0.10));
  grid.carveCorridor(c.x, c.y - h * 0.45, c.x, c.y + h * 0.45, half);
  for (let i = 0; i < rows; i++) {
    const y = c.y - h * 0.36 + i * h * 0.72 / (rows - 1);
    for (const side of [-1, 1]) {
      const x = c.x + side * w * 0.28;
      grid.fillRect(x - w * 0.17, y - h / rows * 0.27, x + w * 0.17, y + h / rows * 0.27);
      grid.carveCorridor(c.x, y, x, y, 60);
    }
  }
});

// An encircling trail around a standing mass, with a central discovery reached
// through two cuts. A second open lobe would erase the decision to go around.
registerDistrictBuilder('grove_ring', ({ grid, center: c, w, h, params }) => {
  const outer = Math.min(w, h) * 0.46, inner = outer * 0.55;
  grid.fillDisc(c.x, c.y, outer, 'ground');
  grid.fillDisc(c.x, c.y, inner, 'wall');
  grid.fillDisc(c.x, c.y, Math.max(75, inner * 0.50), 'ground');
  const angle = params.bearing ?? 0;
  for (const sign of [-1, 1]) grid.carveCorridor(c.x, c.y,
    c.x + Math.cos(angle) * outer * sign, c.y + Math.sin(angle) * outer * sign, 60);
});
