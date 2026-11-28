// Static definition validation for the Phase 02 contract.
const identifier = /^[a-z][a-z0-9-]{0,63}$/;
const digest = /^[a-f0-9]{64}$/;

function invalid(path, reason) {
  throw new TypeError(path + ': ' + reason);
}

function shape(value, keys, path) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) invalid(path, 'expected a JSON object');
  for (const key of Object.keys(value)) if (!keys.includes(key)) invalid(path + '.' + key, 'unknown field');
  for (const key of keys) if (!Object.hasOwn(value, key)) invalid(path + '.' + key, 'missing field');
}

function integer(value, min, max, path) {
  if (!Number.isSafeInteger(value) || value < min || value > max) invalid(path, 'integer outside bounds');
}

function named(value, path) {
  if (typeof value !== 'string' || !identifier.test(value)) invalid(path, 'invalid identifier');
}

function list(value, min, max, path) {
  if (!Array.isArray(value) || value.length < min || value.length > max) invalid(path, 'invalid list length');
  return value;
}

function uniqueIds(values, path) {
  const ids = new Set();
  values.forEach((entry, i) => {
    const id = entry?.id;
    named(id, path + '[' + i + '].id');
    if (ids.has(id)) invalid(path, 'duplicate ' + id);
    ids.add(id);
  });
  return ids;
}

function oneOf(value, values, path) {
  if (!values.includes(value)) invalid(path, 'unknown value');
}

function header(value, keys, path) {
  shape(value, ['schemaVersion', 'id', 'version', ...keys], path);
  if (value.schemaVersion !== 1) invalid(path + '.schemaVersion', 'unsupported schema version');
  named(value.id, path + '.id');
  integer(value.version, 1, 1000000, path + '.version');
}

function reference(value, path) {
  shape(value, ['id', 'version'], path);
  named(value.id, path + '.id');
  integer(value.version, 1, 1000000, path + '.version');
}

function key(value) {
  return value.id + '@' + value.version;
}

function ratio(value, path, probability = false) {
  shape(value, ['numerator', 'denominator'], path);
  integer(value.denominator, 1, 1000000, path + '.denominator');
  integer(value.numerator, probability ? 0 : 1, probability ? value.denominator : 1000000, path + '.numerator');
}

function machine(value) {
  header(value, ['displayName', 'board', 'effects', 'assets', 'status', 'lottery', 'economy'], 'machine');
  if (typeof value.displayName !== 'string' || !value.displayName.trim() || Array.from(value.displayName).length > 80) {
    invalid('machine.displayName', 'expected 1–80 characters');
  }
  for (const kind of ['board', 'effects', 'assets']) reference(value[kind], 'machine.' + kind);
  oneOf(value.status, ['fixture'], 'machine.status');

  const lottery = value.lottery;
  shape(lottery, ['normal', 'high', 'rushEntry', 'stSpins', 'timeShortSpins', 'normalHoldLimit', 'rightHoldLimit', 'rounds', 'roundTimeMs', 'roundEntryLimit'], 'machine.lottery');
  for (const name of ['normal', 'high', 'rushEntry']) ratio(lottery[name], 'machine.lottery.' + name, true);
  for (const name of ['stSpins', 'timeShortSpins']) integer(lottery[name], 0, 1000, 'machine.lottery.' + name);
  for (const name of ['normalHoldLimit', 'rightHoldLimit']) integer(lottery[name], 0, 16, 'machine.lottery.' + name);
  integer(lottery.rounds, 1, 100, 'machine.lottery.rounds');
  integer(lottery.roundTimeMs, 1, 120000, 'machine.lottery.roundTimeMs');
  integer(lottery.roundEntryLimit, 1, 100, 'machine.lottery.roundEntryLimit');

  const economy = value.economy;
  shape(economy, ['loanKp', 'ballsPerLoan', 'kpPerBall', 'loanLimit', 'sessionLossLimitKp', 'sessionTimeMs', 'maxBalls', 'rounding'], 'machine.economy');
  for (const name of ['loanKp', 'ballsPerLoan', 'loanLimit', 'sessionLossLimitKp', 'sessionTimeMs', 'maxBalls']) {
    integer(economy[name], 1, 100000000, 'machine.economy.' + name);
  }
  if (economy.ballsPerLoan > economy.maxBalls) invalid('machine.economy.ballsPerLoan', 'exceeds maxBalls');
  if (economy.loanKp > economy.sessionLossLimitKp) invalid('machine.economy.loanKp', 'exceeds session loss limit');
  ratio(economy.kpPerBall, 'machine.economy.kpPerBall');
  oneOf(economy.rounding, ['floor'], 'machine.economy.rounding');
}

function board(value) {
  header(value, ['widthUm', 'heightUm', 'coordinates', 'physics', 'launch', 'pins', 'rails', 'windmills', 'pockets', 'gates'], 'board');
  integer(value.widthUm, 1, 2000000, 'board.widthUm');
  integer(value.heightUm, 1, 2000000, 'board.heightUm');
  oneOf(value.coordinates, ['top-left-x-right-y-down'], 'board.coordinates');
  const point = (p, path) => {
    shape(p, ['xUm', 'yUm'], path);
    integer(p.xUm, 0, value.widthUm, path + '.xUm');
    integer(p.yUm, 0, value.heightUm, path + '.yUm');
  };
  shape(value.physics, ['stepUs', 'ballRadiusUm', 'maxActiveBalls', 'maxLifetimeMs', 'inputSteps'], 'board.physics');
  integer(value.physics.stepUs, 1000, 50000, 'board.physics.stepUs');
  integer(value.physics.ballRadiusUm, 1, Math.floor(Math.min(value.widthUm, value.heightUm) / 2), 'board.physics.ballRadiusUm');
  integer(value.physics.maxActiveBalls, 1, 256, 'board.physics.maxActiveBalls');
  integer(value.physics.maxLifetimeMs, 1, 120000, 'board.physics.maxLifetimeMs');
  integer(value.physics.inputSteps, 2, 1024, 'board.physics.inputSteps');

  shape(value.launch, ['left', 'right'], 'board.launch');
  point(value.launch.left, 'board.launch.left');
  point(value.launch.right, 'board.launch.right');

  const ids = new Set();
  const all = (kind, min, max, keys, verify) => {
    for (const [index, entry] of list(value[kind], min, max, 'board.' + kind).entries()) {
      const path = 'board.' + kind + '[' + index + ']';
      shape(entry, ['id', ...keys], path);
      named(entry.id, path + '.id');
      if (ids.has(entry.id)) invalid(path + '.id', 'duplicate board object');
      ids.add(entry.id);
      verify(entry, path);
    }
  };
  for (const kind of ['pins', 'windmills']) {
    all(kind, 0, 1024, ['center', 'radiusUm'], (entry, path) => {
      point(entry.center, path + '.center');
      const {xUm, yUm} = entry.center;
      integer(entry.radiusUm, 1, Math.min(xUm, yUm, value.widthUm - xUm, value.heightUm - yUm), path + '.radiusUm');
    });
  }
  all('rails', 0, 256, ['points'], (entry, path) => {
    list(entry.points, 2, 128, path + '.points').forEach((p, i) => point(p, path + '.points[' + i + ']'));
  });
  const pockets = new Set();
  const types = new Set();
  let drains = 0;
  all('pockets', 1, 128, ['type', 'center', 'payoutBalls'], (entry, path) => {
    oneOf(entry.type, ['starter', 'general', 'attacker', 'drain'], path + '.type');
    point(entry.center, path + '.center');
    integer(entry.payoutBalls, 0, entry.type === 'drain' ? 0 : 10000, path + '.payoutBalls');
    pockets.add(entry.id);
    types.add(entry.type);
    if (entry.type === 'drain') drains++;
  });
  if (drains !== 1 || !types.has('starter')) invalid('board.pockets', 'requires one drain and a starter');
  all('gates', 0, 128, ['pocketId', 'openMs'], (entry, path) => {
    if (!pockets.has(entry.pocketId)) invalid(path + '.pocketId', 'unknown pocket');
    integer(entry.openMs, 1, 120000, path + '.openMs');
  });
}

function assetManifest(value) {
  header(value, ['entries'], 'assets');
  const entries = list(value.entries, 0, 256, 'assets.entries');
  const ids = uniqueIds(entries, 'assets.entries');
  const graph = new Map();
  for (const entry of entries) {
    const path = 'assets.entries.' + entry.id;
    shape(entry, ['id', 'path', 'sha256', 'bytes', 'license', 'source', 'credit', 'consent', 'fallbackId'], path);
    if (typeof entry.path !== 'string' || !/^assets\/pachinko\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.[a-z0-9]+$/.test(entry.path)) invalid(path + '.path', 'expected a local asset path');
    if (typeof entry.sha256 !== 'string' || !digest.test(entry.sha256)) invalid(path + '.sha256', 'invalid SHA-256');
    integer(entry.bytes, 1, 100000000, path + '.bytes');
    for (const field of ['license', 'source', 'credit']) {
      const text = entry[field];
      if (typeof text !== 'string' || !text.trim() || text.length > 256) invalid(path + '.' + field, 'missing provenance');
    }
    oneOf(entry.consent, ['not-required', 'verified', 'pending'], path + '.consent');
    if (entry.fallbackId !== null && !ids.has(entry.fallbackId)) invalid(path + '.fallbackId', 'unknown asset');
    graph.set(entry.id, entry.fallbackId);
  }
  assertAcyclic(graph, 'assets.entries');
  return ids;
}

function assertAcyclic(graph, path) {
  const checked = new Set();
  for (const id of graph.keys()) {
    const visiting = new Set();
    let next = id;
    while (next !== null && !checked.has(next)) {
      if (visiting.has(next)) invalid(path, 'fallback cycle');
      visiting.add(next);
      next = graph.get(next);
    }
    for (const visited of visiting) checked.add(visited);
  }
}

function effects(value, assets) {
  header(value, ['targets', 'entries'], 'effects');
  const targets = list(value.targets, 1, 64, 'effects.targets');
  targets.forEach((target, i) => named(target, 'effects.targets[' + i + ']'));
  if (new Set(targets).size !== targets.length) invalid('effects.targets', 'duplicate target');
  const entries = list(value.entries, 1, 128, 'effects.entries');
  const ids = uniqueIds(entries, 'effects.entries');
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const graph = new Map();
  for (const entry of entries) {
    const path = 'effects.entries.' + entry.id;
    shape(entry, ['id', 'resultClasses', 'durationMs', 'assetIds', 'fallbackId', 'tracks', 'accessibleLabel'], path);
    integer(entry.durationMs, 0, 120000, path + '.durationMs');
    const classes = list(entry.resultClasses, 1, 6, path + '.resultClasses');
    for (const result of classes) oneOf(result, ['spin', 'miss', 'jackpot', 'rush', 'settled', 'gallery'], path + '.resultClasses');
    if (new Set(classes).size !== classes.length) invalid(path + '.resultClasses', 'duplicate result class');
    if (typeof entry.accessibleLabel !== 'string' || !entry.accessibleLabel.trim() || entry.accessibleLabel.length > 160) {
      invalid(path + '.accessibleLabel', 'missing result label');
    }
    for (const id of list(entry.assetIds, 0, 64, path + '.assetIds')) {
      if (!assets.has(id)) invalid(path + '.assetIds', 'unknown asset');
    }
    if (entry.fallbackId !== null && !ids.has(entry.fallbackId)) invalid(path + '.fallbackId', 'unknown effect');
    graph.set(entry.id, entry.fallbackId);
    for (const track of list(entry.tracks, 0, 64, path + '.tracks')) {
      shape(track, ['target', 'property', 'keyframes'], path + '.tracks');
      oneOf(track.target, targets, path + '.tracks.target');
      oneOf(track.property, ['opacity', 'light', 'rotation'], path + '.tracks.property');
      let lastTime = -1;
      for (const frame of list(track.keyframes, 1, 256, path + '.tracks.keyframes')) {
        shape(frame, ['atMs', 'value', 'ease'], path + '.tracks.keyframes');
        integer(frame.atMs, lastTime + 1, entry.durationMs, path + '.tracks.atMs');
        lastTime = frame.atMs;
        const rotation = track.property === 'rotation';
        integer(frame.value, rotation ? -360000 : 0, rotation ? 360000 : 1000, path + '.tracks.value');
        oneOf(frame.ease, ['linear', 'step', 'ease-in-out'], path + '.tracks.ease');
      }
    }
  }
  for (const entry of entries) {
    if (entry.fallbackId !== null && !entry.resultClasses.every(result => byId.get(entry.fallbackId).resultClasses.includes(result))) {
      invalid('effects.entries.' + entry.id + '.fallbackId', 'fallback must support the same results');
    }
  }
  assertAcyclic(graph, 'effects.entries');
}

function immutable(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

export function validateDefinitionBundle(bundle) {
  shape(bundle, ['machine', 'board', 'effects', 'assets'], 'bundle');
  machine(bundle.machine);
  board(bundle.board);
  const assets = assetManifest(bundle.assets);
  effects(bundle.effects, assets);
  for (const kind of ['board', 'effects', 'assets']) {
    if (key(bundle.machine[kind]) !== key(bundle[kind])) invalid('machine.' + kind, 'reference version does not match definition');
  }
  return immutable(structuredClone(bundle));
}

// Session metadata binds all four versions. Keep old definitions available
// in the catalogue. Unknown versions fail explicitly; no latest fallback.
export function createDefinitionCatalogue(bundles) {
  const machines = new Map();
  const componentFingerprints = new Map();
  const canonical = value => {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
    return JSON.stringify(value);
  };
  for (const input of list(bundles, 1, 128, 'catalogue')) {
    const bundle = validateDefinitionBundle(input);
    const id = key(bundle.machine);
    if (machines.has(id)) invalid('catalogue', 'duplicate machine version ' + id);
    for (const kind of ['board', 'effects', 'assets']) {
      const id = kind + ':' + key(bundle[kind]);
      const fingerprint = canonical(bundle[kind]);
      if (componentFingerprints.has(id) && componentFingerprints.get(id) !== fingerprint) {
        invalid('catalogue', 'component content changed without a new version: ' + id);
      }
      componentFingerprints.set(id, fingerprint);
    }
    machines.set(id, bundle);
  }
  return Object.freeze({
    restore(refs) {
      const kinds = ['machine', 'board', 'effects', 'assets'];
      shape(refs, kinds, 'session.definitions');
      for (const kind of kinds) reference(refs[kind], 'session.definitions.' + kind);
      const bundle = machines.get(key(refs.machine));
      if (!bundle || kinds.some(kind => key(refs[kind]) !== key(bundle[kind]))) {
        invalid('session.definitions', 'definition version unavailable');
      }
      return bundle;
    },
  });
}
