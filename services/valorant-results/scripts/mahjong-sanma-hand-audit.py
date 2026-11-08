"""OFFLINE completed-hand oracle check. Never used for recommendations.
Reported situational flags/ura are allowed here ONLY after the game finished.
Prints aggregate counts, never hands, fan lists, names or identifiers.
"""
import json
import runpy
import signal
import sys
from pathlib import Path
from mahjong.hand_calculating.hand import HandCalculator
from mahjong.hand_calculating.hand_config import HandConfig, OptionalRules
from mahjong.meld import Meld

physical = runpy.run_path(str(Path(__file__).with_name('mahjong-sanma-value.py')))['physical']


def audit(wins):
    if not isinstance(wins, list) or len(wins) > 12:
        raise ValueError('size')
    out = dict(prepared=len(wins), evaluated=0, matchedHanFu=0, matchedBasePayment=0, mismatchedHanFu=0, mismatchedBasePayment=0, calculationRejected=0)
    for w in wins:
        if set(w) != {'hand', 'win', 'melds', 'north', 'doras', 'ura', 'seatWind', 'roundWind', 'tsumo', 'flags', 'expected'}:
            raise ValueError('schema')
        if len(w['hand']) != 13 - 3*len(w['melds']) or len(w['melds']) > 4 or not 1 <= len(w['doras']) <= 5 or len(w['ura']) > 5 or len(w['flags']) > 8:
            raise ValueError('shape')
        if not 0 <= w['north'] <= 4 or not 0 <= w['seatWind'] <= 2 or not 0 <= w['roundWind'] <= 1 or type(w['tsumo']) is not bool:
            raise ValueError('context')
        if any(f not in [2, 3, 4, 5, 6, 18, 30] for f in w['flags']):
            raise ValueError('flags')
        meld_tiles = [t for m in w['melds'] for t in m['tiles']]
        ids = physical(w['hand']+[w['win']]+meld_tiles+w['doras']+w['ura']+['N']*w['north'])
        concealed=len(w['hand'])+1
        full=concealed+len(meld_tiles)
        melds=[];offset=concealed
        for m in w['melds']:
            if set(m) != {'kind', 'tiles'} or m['kind'] not in ['pon', 'kan', 'ankan'] or len(m['tiles']) != (3 if m['kind']=='pon' else 4):
                raise ValueError('meld')
            melds.append(Meld(Meld.PON if m['kind']=='pon' else Meld.KAN,tiles=ids[offset:offset+len(m['tiles'])],opened=m['kind']!='ankan'))
            offset+=len(m['tiles'])
        flags=set(w['flags'])
        config=HandConfig(is_tsumo=w['tsumo'],is_riichi=2 in flags or 18 in flags,is_daburu_riichi=18 in flags,is_ippatsu=30 in flags,
                          is_chankan=3 in flags,is_rinshan=4 in flags,is_haitei=5 in flags,is_houtei=6 in flags,
                          player_wind=27+w['seatWind'],round_wind=27+w['roundWind'],num_nuki_dora=w['north'],
                          options=OptionalRules(is_three_player=True,has_open_tanyao=True,has_aka_dora=True))
        r=HandCalculator().estimate_hand_value(ids[:full],ids[concealed-1],melds=melds,dora_indicators=ids[full:full+len(w['doras'])],
                                              ura_dora_indicators=ids[full+len(w['doras']):full+len(w['doras'])+len(w['ura'])],config=config)
        if r.error or not r.cost:
            out['calculationRejected']+=1;continue
        out['evaluated']+=1
        hf=r.han==w['expected']['han'] and r.fu==w['expected']['fu']
        pay=r.cost['main']==w['expected']['main'] and r.cost['additional']==w['expected']['additional']
        out['matchedHanFu' if hf else 'mismatchedHanFu']+=1
        out['matchedBasePayment' if pay else 'mismatchedBasePayment']+=1
    return out


if __name__=='__main__':
    signal.signal(signal.SIGALRM,lambda *_:sys.exit(2));signal.alarm(7)
    try:
        raw=sys.stdin.buffer.read(262145)
        if len(raw)>262144:raise ValueError('size')
        print(json.dumps(audit(json.loads(raw)),separators=(',', ':')))
    except Exception:
        print('{"error":"hand_audit_failed"}');sys.exit(1)
