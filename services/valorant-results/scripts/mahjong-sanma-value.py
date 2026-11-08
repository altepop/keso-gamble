"""Bounded local hand calculator. No accounts, network, wall, ura or future actions.

Conditional sanma tsumo; actual own melds determine menzen.
Recorded riichi declaration is evaluated as riichi; standard open tanyao is enabled.
No ippatsu/last-tile/replacement/ura bonuses are assumed.
Uses tsumo-loss sanma, excluding honba/deposits. Not win probability or game EV.
"""
import json
import signal
import sys
from mahjong.hand_calculating.hand import HandCalculator
from mahjong.meld import Meld
from mahjong.hand_calculating.hand_config import HandConfig, OptionalRules


def tile_kind(t):
    if t in ['E', 'S', 'W', 'N', 'P', 'F', 'C']:
        return 27 + ['E', 'S', 'W', 'N', 'P', 'F', 'C'].index(t)
    if not isinstance(t, str) or t not in [str(n) + s for s in ['p', 's'] for n in range(1, 10)] + ['1m', '9m', '5pr', '5sr']:
        raise ValueError('tile')
    return 'mps'.index(t[1]) * 9 + int(t[0]) - 1


def physical(tiles):
    used = set()
    result = []
    for t in tiles:
        k = tile_kind(t)
        if t.endswith('r'):
            options = [k * 4]
        else:
            options = [k * 4 + i for i in range(1 if k in [13, 22] else 0, 4)]
        found = next((v for v in options if v not in used), None)
        if found is None:
            raise ValueError('copies')
        used.add(found)
        result.append(found)
    return result


def bounded_int(v, lo, hi):
    return type(v) is int and lo <= v <= hi


def evaluate_case(case):
    # No metadata from the game summary is accepted by this process.
    if set(case) != {'candidates', 'doras', 'north', 'seatWind', 'roundWind', 'riichi', 'doubleRiichi', 'melds'}:
        raise ValueError('schema')
    if type(case['doubleRiichi']) is not bool or case['doubleRiichi'] and not case['riichi'] or type(case['riichi']) is not bool or not bounded_int(case['north'], 0, 4) or not bounded_int(case['seatWind'], 0, 2) or not bounded_int(case['roundWind'], 0, 1):
        raise ValueError('context')
    if not 1 <= len(case['doras']) <= 5 or not 2 <= len(case['candidates']) <= 14:
        raise ValueError('size')
    if not isinstance(case['melds'], list) or len(case['melds']) > 4:
        raise ValueError('melds')
    for m in case['melds']:
        if set(m) != {'kind', 'tiles'} or m['kind'] not in ['pon', 'kan', 'ankan'] or len(m['tiles']) != (3 if m['kind'] == 'pon' else 4):
            raise ValueError('meld')
        if len({tile_kind(t) for t in m['tiles']}) != 1:
            raise ValueError('meld_shape')
    if case['riichi'] and any(m['kind'] != 'ankan' for m in case['melds']):
        raise ValueError('open_riichi')
    meld_tiles = [t for m in case['melds'] for t in m['tiles']]
    calculator = HandCalculator()
    metrics = []
    for c in case['candidates']:
        if set(c) != {'tile', 'hand', 'waits'} or len(c['hand']) != 13 - 3 * len(case['melds']) or not 1 <= len(c['waits']) <= 29:
            raise ValueError('candidate')
        tile_kind(c['tile'])
        wins = []
        for w in c['waits']:
            if set(w) != {'tile', 'left'} or not bounded_int(w['left'], 1, 4):
                raise ValueError('wait')
            # One allocation across hand, prospective win, proposed discard,
            # indicators and nuki validates physical red/four-copy identities.
            all_tiles = physical(c['hand'] + [w['tile']] + meld_tiles + [c['tile']] + case['doras'] + ['N'] * case['north'])
            concealed = len(c['hand']) + 1
            full = concealed + len(meld_tiles)
            tiles = all_tiles[:full]
            melds = []
            offset = concealed
            for m in case['melds']:
                melds.append(Meld(Meld.PON if m['kind'] == 'pon' else Meld.KAN, tiles=all_tiles[offset:offset+len(m['tiles'])], opened=m['kind'] != 'ankan'))
                offset += len(m['tiles'])
            result = calculator.estimate_hand_value(
                tiles, all_tiles[concealed-1], melds=melds, dora_indicators=all_tiles[full+1:full+1+len(case['doras'])],
                config=HandConfig(is_tsumo=True, is_riichi=case['riichi'], is_daburu_riichi=case['doubleRiichi'], player_wind=27+case['seatWind'], round_wind=27+case['roundWind'],
                                  num_nuki_dora=case['north'], options=OptionalRules(is_three_player=True, has_aka_dora=True, has_open_tanyao=True)))
            # Ambiguous/unsupported limit hands suppress the whole comparison.
            if result.error or not result.cost or result.han >= 13 or any(y.is_yakuman for y in result.yaku):
                return None
            wins.append((w['left'], result.cost['main'] + result.cost['additional'], result.han, result.fu))
        metrics.append(dict(tile=c['tile'], live=sum(x[0] for x in wins), min=min(x[1] for x in wins), max=max(x[1] for x in wins),
                            hanMin=min(x[2] for x in wins), hanMax=max(x[2] for x in wins), fuMin=min(x[3] for x in wins), fuMax=max(x[3] for x in wins)))
    return metrics


def run(payload):
    if set(payload) != {'version', 'cases'} or payload['version'] != 1 or not isinstance(payload['cases'], list) or len(payload['cases']) > 12:
        raise ValueError('request')
    return {'version': 1, 'results': [evaluate_case(c) for c in payload['cases']]}


if __name__ == '__main__':
    # An independent deadline also covers a killed Node worker's child process.
    signal.signal(signal.SIGALRM, lambda *_: sys.exit(2))
    signal.alarm(7)
    try:
        raw = sys.stdin.buffer.read(262145)
        if len(raw) > 262144:
            raise ValueError('size')
        print(json.dumps(run(json.loads(raw)), separators=(',', ':')))
    except Exception:
        # Never print request bodies, tile data, paths or underlying exceptions.
        print('{"version":1,"results":[]}', flush=True)
        sys.exit(1)
