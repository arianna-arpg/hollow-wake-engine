import {Content, Engine, Target, Inventory, CastRuntime, TimedDamage} from '../../dist/index.js';
import {ItemContent, ItemRules} from '../../dist/item-rules.js';
import {PassivePolicy} from '../../dist/passive-policy.js';

// Experimental control protocol, not a stable SDK ABI or a per-frame wire format.
const VERSION = 1, CAPABILITY = 'embedded-session/experiment-v1';
const MAX_SESSIONS = 8, MAX_BATCH = 64;
const copy = value => JSON.parse(JSON.stringify(value));
function fields(value, names) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Object required');
  for (const key of Object.keys(value)) if (!names.includes(key)) throw new Error('Unsupported field: ' + key);
}
function number(value, min, max, integer = false) {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) throw new Error('Number outside protocol bounds');
}
function text(value) {
  if (typeof value !== 'string' || !value || value.length > 128) throw new Error('Invalid identifier');
}
function contentIds(root) { return [root.content.pack.id, root.items.id, root.policy.pack.contentId]; }

export function create(input) {
  fields(input, ['core', 'items', 'passives']);
  return {content: new Content(input.core), items: new ItemContent(input.items),
    policy: new PassivePolicy(input.passives), sessions: new Map(), nextHandle: 1};
}

function fresh(root, config) {
  fields(config, ['seed', 'itemSeed', 'character', 'skill', 'resources', 'target', 'passive', 'effect']);
  fields(config.character, ['classId', 'passivePoints', 'allocated', 'equipped', 'itemInstances', 'conditions', 'gauges']);
  number(config.seed, 0, 0xffffffff, true); number(config.itemSeed, 0, 0xffffffff, true);
  const engine = new Engine(root.content, config.seed), character = engine.character(config.character);
  const skill = engine.skill(config.skill);
  character.validateSkill(skill);
  const effect = new TimedDamage(config.effect);
  if (!root.content.pack.damageTypes.includes(effect.definition.damageType)) throw new Error('Unsupported effect damage type');
  return {engine, character, skill, selection: copy(config.skill), target: engine.target(config.target),
    rules: new ItemRules(root.items, config.itemSeed), passive: root.policy.create(config.passive),
    inventory: new Inventory({w: 4, h: 4}), casting: new CastRuntime(config.resources), effect, poisoned: false};
}

function snapshot(root, session) {
  return {version: VERSION, capability: CAPABILITY, content: contentIds(root),
    character: session.character.snapshot(), skill: copy(session.selection), random: session.engine.randomSnapshot(),
    target: session.target.snapshot(), items: session.rules.snapshot(), passive: session.passive.snapshot(),
    inventory: session.inventory.snapshot(), casting: session.casting.snapshot(), effect: session.effect.snapshot()};
}

function restored(root, input) {
  fields(input, ['version', 'capability', 'content', 'character', 'skill', 'random', 'target', 'items', 'passive', 'inventory', 'casting', 'effect']);
  if (input.version !== VERSION || input.capability !== CAPABILITY ||
      JSON.stringify(input.content) !== JSON.stringify(contentIds(root))) throw new Error('Snapshot content or protocol mismatch');
  fields(input.character, ['classId', 'passivePoints', 'allocated', 'equipped', 'itemInstances', 'conditions', 'gauges']);
  // Construct every component before publishing a new handle. Failure cannot replace live state.
  const engine = new Engine(root.content), character = engine.character(input.character), skill = engine.skill(input.skill);
  character.validateSkill(skill); engine.restoreRandom(input.random);
  const effect = TimedDamage.restore(input.effect);
  if (!root.content.pack.damageTypes.includes(effect.definition.damageType)) throw new Error('Unsupported effect damage type');
  return {engine, character, skill, selection: copy(input.skill), target: Target.restore(root.content, input.target),
    rules: ItemRules.restore(root.items, input.items), passive: root.policy.restore(input.passive),
    inventory: Inventory.restore(input.inventory), casting: CastRuntime.restore(input.casting), effect, poisoned: false};
}

function validateCommand(command) {
  const allowed = {
    hit: ['op'], roll: ['op', 'ilvl'], equip: ['op', 'item', 'slot'],
    allocate: ['op', 'node', 'option'], refund: ['op', 'node'],
    press: ['op'], advance: ['op', 'dt'], applyDot: ['op', 'dps'],
    forgeStore: ['op', 'id', 'options'], move: ['op', 'id', 'x', 'y']
  };
  if (!command || !Object.hasOwn(allowed, command.op)) throw new Error('Unsupported command');
  fields(command, allowed[command.op]);
  if (command.op === 'roll') number(command.ilvl, 1, 100, true);
  if (command.op === 'equip') { text(command.item); text(command.slot); }
  if (command.op === 'allocate' || command.op === 'refund') text(command.node);
  if (command.option !== undefined) text(command.option);
  if (command.op === 'advance') number(command.dt, 0, 60);
  if (command.op === 'applyDot') number(command.dps, 0, 1000000);
  if (command.op === 'forgeStore') { text(command.id); fields(command.options, ['baseId', 'ilvl', 'rarity', 'quality', 'affixes']); }
  if (command.op === 'move') { text(command.id); number(command.x, 0, 3, true); number(command.y, 0, 3, true); }
}

function execute(session, command) {
  switch (command.op) {
    case 'hit': return session.engine.resolveHit(session.character, session.skill, session.target);
    case 'roll': {
      const item = session.rules.roll({ilvl: command.ilvl});
      return item ? {item, mods: session.rules.compile(item)} : null;
    }
    case 'equip': session.character.equip(command.item, command.slot); return {equipped: true};
    case 'allocate': return session.passive.allocate(command.node, {ledger: {}}, command.option);
    case 'refund': return session.passive.refund(command.node);
    case 'press': return session.casting.press(session.engine.castProfile(session.character, session.skill));
    case 'advance': {
      const cast = session.casting.advance(command.dt), raw = session.effect.advance(command.dt);
      const damage = raw > 0 ? session.target.receiveDot(raw, session.effect.definition.damageType) : 0;
      return {cast, raw, damage, targetLife: session.target.life};
    }
    case 'applyDot': return session.effect.apply(command.dps, 1, 1, 'session-caster');
    case 'forgeStore': {
      const item = session.rules.forge(command.options);
      const base = item && session.rules.content.pack.bases[item.baseId];
      return {item, inserted: item !== null && session.inventory.insert({id: command.id, w: base.w, h: base.h, data: item})};
    }
    case 'move': return session.inventory.move(command.id, command.x, command.y);
    default: throw new Error('Unvalidated command');
  }
}

export function dispatch(root, request) {
  try {
    if (!request || request.version !== VERSION) throw new Error('Unsupported protocol');
    switch (request.op) {
      case 'create': fields(request, ['version', 'op', 'config']); break;
      case 'restore': fields(request, ['version', 'op', 'snapshot']); break;
      case 'destroy': case 'snapshot': fields(request, ['version', 'op', 'handle']); break;
      case 'batch':
        fields(request, ['version', 'op', 'handle', 'commands']);
        if (!Array.isArray(request.commands) || request.commands.length > MAX_BATCH) throw new Error('Batch limit exceeded');
        // Preflight the entire protocol envelope before any command can consume state.
        for (const command of request.commands) validateCommand(command);
        break;
      default: throw new Error('Unsupported operation');
    }
    if (request.op === 'create' || request.op === 'restore') {
      if (root.sessions.size >= MAX_SESSIONS) return {ok: false, error: 'capacity'};
      if (!Number.isSafeInteger(root.nextHandle)) return {ok: false, error: 'handle-exhausted'};
      const session = request.op === 'create' ? fresh(root, request.config) : restored(root, request.snapshot);
      const handle = root.nextHandle++;
      root.sessions.set(handle, session);
      return {ok: true, handle};
    }
    number(request.handle, 1, Number.MAX_SAFE_INTEGER, true);
  } catch (error) { return {ok: false, error: 'invalid-request', message: String(error.message)}; }

  const session = root.sessions.get(request.handle);
  if (!session) return {ok: false, error: 'stale-handle'};
  if (request.op === 'destroy') { root.sessions.delete(request.handle); return {ok: true}; }
  if (session.poisoned) return {ok: false, error: 'poisoned-session'};
  if (request.op === 'snapshot') return {ok: true, snapshot: snapshot(root, session)};
  const results = [];
  try {
    for (const command of request.commands) results.push(execute(session, command));
    return {ok: true, results};
  } catch (error) {
    // SDK operations can have partial effects. Never pretend a batch was rolled back.
    session.poisoned = true;
    return {ok: false, error: 'execution-failed', completed: results.length, results, message: String(error.message)};
  }
}
