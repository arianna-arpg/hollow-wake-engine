import fs from 'node:fs';
import { Engine, CastRuntime, TimedDamage } from '../dist/index.js';
const read = name => JSON.parse(fs.readFileSync(new URL(`../content/${name}.json`, import.meta.url)));
const pack = read('milestone-one');
pack.skills.firebolt = read('firebolt');
const engine = new Engine(pack, 42);
const hero = engine.character({ classId: 'magician', passivePoints: 1 });
const skill = engine.skill({ id: 'firebolt', level: 1, sockets: 0, treePoints: 0 });
const target = engine.target({ life: 500 });
const casting = new CastRuntime({ mana: hero.sheet.get('mana'), life: hero.sheet.get('life') });
const burning = new TimedDamage(read('burning'));
const started = casting.press(engine.castProfile(hero, skill));
let hit;
for (let frame = 0; frame < 60; frame++) {
  const event = casting.advance(1 / 60);
  if (event?.kind === 'completed') {
    // A real host now launches the projectile and later supplies an authorized contact.
    hit = engine.resolveHit(hero, skill, target);
    // Demonstration of a host-resolved application. Firebolt's proc/chance/ailment scaling
    // are still host-owned; this is not a substitute formula for those authored rules.
    burning.apply(10, 1, 1, 'hero');
  }
  if (burning.present) target.receiveDot(burning.advance(1 / 60), 'fire');
}
const save = { casting: casting.snapshot(), burning: burning.snapshot(), target: target.snapshot(), random: engine.randomSnapshot() };
console.log(JSON.stringify({ started: started.kind, manaAfterPayment: casting.mana, contactDamage: hit.damage, targetLife: target.life,
  burnRemaining: TimedDamage.restore(save.burning).remaining, savedCastActive: CastRuntime.restore(save.casting).busy }, null, 2));
