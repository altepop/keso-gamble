"""KESO PLAY casino audio: offline-rendered, original sound design (no samples from anywhere else).

Coins are modal-synthesis metal (inharmonic damped partials + transient), the fanfares a synthesized brass section
with timpani, cymbals and strings, everything stereo and run through a synthetic hall. The announcer is Piper TTS
(voice "norman": trained only on public-domain LibriVox recordings), then deepened, doubled, saturated and put in a
stadium echo.
"""
import numpy as np, wave, sys, os
from scipy.signal import fftconvolve, resample_poly, butter, sosfilt

SR=44100
rng=np.random.default_rng(7)
OUT=sys.argv[1]

def silence(sec): return np.zeros((int(sec*SR),2))
def place(buf,clip,at):
    i=int(at*SR); j=min(len(buf),i+len(clip))
    if j>i: buf[i:j]+=clip[:j-i]
def stereo(mono,pan=0.0):
    l=np.cos((pan+1)*np.pi/4); r=np.sin((pan+1)*np.pi/4)
    return np.stack([mono*l*1.414,mono*r*1.414],1)
def env_adsr(n,a,d,s,r):
    a,d,r=int(a*SR),int(d*SR),int(r*SR); sus=max(0,n-a-d-r)
    return np.concatenate([np.linspace(0,1,max(a,1)),np.linspace(1,s,max(d,1)),np.full(sus,s),np.linspace(s,0,max(r,1))])[:n]
def bp(x,lo,hi,order=2): return sosfilt(butter(order,[lo,hi],btype='band',fs=SR,output='sos'),x,axis=0)
def lp(x,f,order=2): return sosfilt(butter(order,f,btype='low',fs=SR,output='sos'),x,axis=0)
def hp(x,f,order=2): return sosfilt(butter(order,f,btype='high',fs=SR,output='sos'),x,axis=0)

def hall(sec=2.2,bright=6000,seed=1):
    r=np.random.default_rng(seed); n=int(sec*SR); t=np.arange(n)/SR
    ir=np.stack([r.standard_normal(n),r.standard_normal(n)],1)*np.exp(-t*6.9/sec)[:,None]
    ir=lp(ir,bright); ir[:int(.012*SR)]*=np.linspace(0,1,int(.012*SR))[:,None]
    return ir/np.sqrt((ir**2).sum(0))
IR_HALL=hall(); IR_ROOM=hall(.9,8000,2); IR_STADIUM=hall(3.2,4500,3)
def reverb(x,ir,wet=.3):
    y=np.stack([fftconvolve(x[:,c],ir[:,c])[:len(x)] for c in range(2)],1)
    return x*(1-wet)+y*wet
def glue(x,drive=1.6):  # bus compressor-ish saturation
    return np.tanh(x*drive)/np.tanh(drive)
def master(x,peak=.92,tail=.4):
    x=np.concatenate([x,np.zeros((int(tail*SR),2))]); x=glue(x,1.3)
    return x/np.max(np.abs(x))*peak

# ---------- coins ----------
def coin_hit(size=1.0,bright=1.0):
    n=int(.55*SR); t=np.arange(n)/SR; base=rng.uniform(2300,3400)/size
    ratios=[1,1.51,2.28,2.93,3.61,4.47]; out=np.zeros(n)
    for k,ratio in enumerate(ratios):
        f=base*ratio*rng.uniform(.985,1.015)
        if f>17000: continue
        decay=rng.uniform(5,11)*(1+k*.55)/size
        out+=np.sin(2*np.pi*f*t+rng.uniform(0,6.28))*np.exp(-t*decay)*(1/(1+k*.45))*bright**k
    click=rng.standard_normal(int(.004*SR))*np.linspace(1,0,int(.004*SR))
    out[:len(click)]+=hp(click,3000)*.8
    return out*rng.uniform(.5,1)
def coins(sec,density=40,start=.0,size=1.0,swell=False):
    buf=silence(sec+.6); t=start
    while t<sec:
        rate=density*(0.4+0.6*t/sec if swell else 1)
        place(buf,stereo(coin_hit(size*rng.uniform(.85,1.2)),rng.uniform(-.85,.85)),t)
        t+=rng.exponential(1/rate)
    # a bed of tiny far coins for the "jara jara" body
    bed=silence(sec+.6)
    for _ in range(int(sec*density*1.5)):
        place(bed,stereo(coin_hit(.6,.8)*.35,rng.uniform(-1,1)),rng.uniform(0,sec))
    return reverb(buf+bed,IR_ROOM,.22)
def coin_cascade(sec=2.4,density=55): return reverb(coins(sec,density,swell=True),IR_HALL,.18)

# ---------- brass / orchestra ----------
def note_hz(m): return 440*2**((m-69)/12)
def brass(m,dur,amp=.2,bright=1.0,swell=.06):
    n=int(dur*SR); t=np.arange(n)/SR; f0=note_hz(m)
    vib=1+.004*np.sin(2*np.pi*5.6*t)*np.clip(t/0.35,0,1)
    out=np.zeros(n)
    for voice in range(3):   # a small section: three slightly detuned players
        det=1+rng.uniform(-.004,.004); ph=np.cumsum(2*np.pi*f0*det*vib/SR)
        for h in range(1,16):
            if f0*h>15000: break
            a=(1/h**.85)*(bright**(h-1)); out+=a*np.sin(h*ph+rng.uniform(0,6.28))
    e=env_adsr(n,swell,.12,.8,min(.18,dur*.4))
    # brightness opens with the attack ("blat")
    out=lp(out*e,2500+5000*bright)*amp/4
    return out
def timpani(m,dur=1.2,amp=.6):
    n=int(dur*SR); t=np.arange(n)/SR; f=note_hz(m)*(1+.08*np.exp(-t*25))
    body=np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t*3.2)+.4*np.sin(2*np.pi*np.cumsum(f*1.5)/SR)*np.exp(-t*5)
    hit=lp(rng.standard_normal(n)*np.exp(-t*40),900)
    return (body+hit*.6)*amp
def cymbal(dur=2.5,amp=.25,swell=False):
    n=int(dur*SR); t=np.arange(n)/SR; x=hp(rng.standard_normal(n),4500,4)
    e=(t/dur)**2 if swell else np.exp(-t*1.8)
    return x*e*amp
def strings(ms,dur,amp=.08):
    n=int(dur*SR); t=np.arange(n)/SR; out=np.zeros(n)
    for m in ms:
        for v in range(4):
            f=note_hz(m)*(1+rng.uniform(-.003,.003)); ph=2*np.pi*f*t+rng.uniform(0,6)
            out+=sum(np.sin(h*ph)/h for h in range(1,9))
    return lp(out*env_adsr(n,.25,.2,.85,.5),5000)*amp/len(ms)
def chord(buf,ms,at,dur,amp=.22,bright=1.0,spread=.6):
    for i,m in enumerate(ms):
        place(buf,stereo(brass(m,dur,amp,bright),(i/(max(1,len(ms)-1))-.5)*spread),at)

def fanfare(level):
    """level 1 BIG, 2 MEGA, 3 SUPER / GOLDEN. Longer, higher and fuller with each level."""
    sec=[2.6,3.6,5.2][level-1]; buf=silence(sec+.5)
    # pickup triplet then the hits, climbing a step each level
    key=60+[0,2,4][level-1]
    seq=[(0,.11,[key+7]),(.12,.11,[key+7]),(.24,.11,[key+7]),(.38,.7,[key,key+4,key+7,key+12])]
    if level>=2: seq+=[(1.1,.18,[key+2,key+5,key+9]),(1.3,.18,[key+4,key+7,key+11]),(1.5,1.0,[key+5,key+9,key+12,key+17])]
    if level>=3: seq+=[(2.6,.16,[key+7,key+11,key+14]),(2.8,.16,[key+9,key+12,key+16]),(3.0,1.8,[key+12,key+16,key+19,key+24,key])]
    for at,d,ms in seq: chord(buf,ms+[m-12 for m in ms[:1]],at,d+.08,.2,1.0 if d>.3 else .8)
    hits=[.38]+([1.5] if level>=2 else [])+([3.0] if level>=3 else [])
    for h in hits:
        place(buf,stereo(timpani(key-24,1.4,.55)),h);place(buf,stereo(cymbal(2.4,.22),-.3),h);place(buf,stereo(cymbal(2.4,.2),.3),h+.01)
    place(buf,stereo(cymbal(.38,.12,True)),0)  # swell into the first hit
    last=seq[-1]; place(buf,np.stack([strings(last[2],last[1]+1.2,.07)]*2,1),last[0])
    # rolling timpani under the long final chord
    for k in range(int(last[1]/0.09)): place(buf,stereo(timpani(key-24,.3,.18*(k/(last[1]/0.09)))),last[0]+k*.09)
    place(buf,coins(sec,30+level*15,start=.38,swell=True)*(.35+level*.08),0)
    return master(reverb(buf,IR_HALL,.28))

def slot_spin(sec=1.4):
    """Mechanical reel spin: a fast ratchet over a whirring motor, with a little coin glitter."""
    buf=silence(sec); t=np.arange(int(sec*SR))/SR
    motor=lp(rng.standard_normal(len(t)),900)*.12*(1+.3*np.sin(2*np.pi*22*t))
    buf+=stereo(motor)
    for x in np.arange(0,sec,1/26):
        c=bp(rng.standard_normal(int(.012*SR)),1800,5200)*np.linspace(1,0,int(.012*SR))*.35
        place(buf,stereo(c,rng.uniform(-.3,.3)),x)
    return master(reverb(buf,IR_ROOM,.15),.7,.1)
def reel_stop():
    buf=silence(.6); n=int(.35*SR); t=np.arange(n)/SR
    thunk=np.sin(2*np.pi*np.cumsum(90*(1+2*np.exp(-t*40)))/SR)*np.exp(-t*14)
    clack=bp(rng.standard_normal(n),1500,6000)*np.exp(-t*60)
    place(buf,stereo(thunk*.9+clack*.5),0)
    place(buf,stereo(coin_hit(1.1)*.5,.2),.01)
    return master(reverb(buf,IR_ROOM,.18),.85,.1)
def small_win():
    buf=silence(1.3)
    for i,m in enumerate([72,76,79,84]): place(buf,stereo(brass(m,.22,.25,1.1),(i-1.5)*.3),i*.07)
    place(buf,stereo(brass(84,.6,.18),.0),.3);place(buf,stereo(brass(88,.6,.15),.2),.3)
    place(buf,coins(1.0,45,start=.25)*.6,0)
    return master(reverb(buf,IR_HALL,.22),.85)
def lose():
    buf=silence(1.0)
    for i,m in enumerate([67,63,60]): place(buf,stereo(brass(m,.28 if i<2 else .55,.2,.6),0),i*.2)
    return master(reverb(buf,IR_HALL,.25),.6)

# ---------- announcer ----------
def read_wav(p):
    with wave.open(p) as w:
        x=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(float)/32768; sr=w.getframerate()
    return x,sr
def announcer(raw):
    x,sr=read_wav(raw)
    keep=np.where(np.abs(x)>.02)[0]; x=x[max(0,keep[0]-200):keep[-1]+2000]
    # deeper and bigger: up-sample so the voice plays ~3 semitones lower at 44.1 kHz
    x=resample_poly(x,SR*1000//sr*119//100,1000)  # ≈ 2.38× → 22.05k→ lower pitch & slower
    x=x/np.max(np.abs(x))
    x=hp(x,90); x=x+.6*bp(x,2200,5200)          # presence
    x=np.tanh(x*2.2)/np.tanh(2.2)                # drive
    d1=np.concatenate([np.zeros(int(.018*SR)),x])[:len(x)]; d2=np.concatenate([np.zeros(int(.027*SR)),x])[:len(x)]
    st=np.stack([x*.8+d1*.45,x*.8+d2*.45],1)       # double-tracked width
    st=np.concatenate([st,np.zeros((int(1.6*SR),2))])
    echo=np.zeros_like(st)
    for k,(dl,g) in enumerate([(.19,.42),(.38,.25),(.57,.14)]):
        i=int(dl*SR); echo[i:]+=st[:-i]*g*(np.array([1,.6]) if k%2 else np.array([.6,1]))
    return master(reverb(st+echo,IR_STADIUM,.32),.95,.2)

def write(name,x):
    import subprocess
    pcm=(np.clip(x,-1,1)*32767).astype(np.int16)
    tmp=os.path.join(OUT,name+'.wav')
    with wave.open(tmp,'wb') as w: w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes(pcm.tobytes())
    subprocess.run(['ffmpeg','-v','error','-y','-i',tmp,'-codec:a','libmp3lame','-b:a','112k',os.path.join(OUT,name+'.mp3')],check=True)
    os.remove(tmp); print(name, f'{len(x)/SR:.2f}s', os.path.getsize(os.path.join(OUT,name+'.mp3'))//1024,'KB')

os.makedirs(OUT,exist_ok=True)
write('coins',master(coin_cascade(2.4),.85))
write('fanfare-big',fanfare(1)); write('fanfare-mega',fanfare(2)); write('fanfare-super',fanfare(3))
write('slot-spin',slot_spin()); write('reel-stop',reel_stop()); write('win',small_win()); write('lose',lose())
for v in ['big','mega','super','golden','jackpot']: write('voice-'+v,announcer(f'raw-{v}.wav'))
