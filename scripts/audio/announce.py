"""Announcer v3 — clear, punchy calls in the usual slot-announcer delivery: a quick first word, then the last word
held about 0.6 s with a slight fall in pitch, lightly processed so every word stays intelligible.

Voice: Piper en_US-bryce-medium (public domain: the author's own recordings). Only the timing and pitch shape are
modelled on a typical big-win call; no audio from any game is used.
"""
import io,os,sys,wave,numpy as np,librosa
from piper import PiperVoice, SynthesisConfig
OUTDIR=sys.argv[1] if len(sys.argv)>1 else 'out3'
sys.argv=[sys.argv[0],OUTDIR];exec(open(os.path.join(os.path.dirname(__file__) or '.','render.py')).read().split('# ---------- announcer ----------')[0])
r=open(os.path.join(os.path.dirname(__file__) or '.','render.py')).read();exec(r[r.index('def write(name,x):'):r.index("os.makedirs(OUT,exist_ok=True)")])
os.makedirs(OUT,exist_ok=True)
V=PiperVoice.load(os.environ.get('VOICE','en_US-bryce-medium.onnx'))
def say(text,ls=1.0):
    b=io.BytesIO()
    with wave.open(b,'wb') as w:V.synthesize_wav(text,w,syn_config=SynthesisConfig(length_scale=ls,noise_scale=.45,noise_w_scale=.6))
    b.seek(0)
    with wave.open(b) as w:x=np.frombuffer(w.readframes(w.getnframes()),np.int16).astype(np.float32)/32768;sr=w.getframerate()
    i=np.where(np.abs(x)>.015)[0];return x[max(0,i[0]-60):i[-1]+200],sr
def hold_last_vowel(x,sr,hold,fall):
    """Holds the last word's vowel (the last loud steady stretch) to `hold` seconds, gliding down `fall` semitones."""
    rms=librosa.feature.rms(y=x,frame_length=512,hop_length=128)[0];t=np.arange(len(rms))*128
    loud=rms>rms.max()*.45;idx=np.where(loud)[0]
    end=idx[-1];start=end
    while start>0 and loud[start-1]:start-=1        # the last loud run = the last vowel
    a,b=t[start],t[end];core_a=a+(b-a)//4;core_b=b-(b-a)//4
    core=x[core_a:core_b]
    if len(core)<sr*.04:return x
    rate=max(.25,(len(core)/sr)/max(hold,.05))
    held=librosa.effects.time_stretch(core,rate=rate)
    n=6;parts=np.array_split(held,n)
    held=np.concatenate([librosa.effects.pitch_shift(p,sr=sr,n_steps=-fall*i/(n-1)) for i,p in enumerate(parts)])
    tail=librosa.effects.pitch_shift(x[core_b:],sr=sr,n_steps=-fall)
    f=int(.01*sr)
    def xf(u,v):w=np.linspace(0,1,f);return np.concatenate([u[:-f],u[-f:]*(1-w)+v[:f]*w,v[f:]])
    return xf(xf(x[:core_a],held),tail)
def call(text,hold,fall=2.0,lift=float(os.environ.get('LIFT',3.0)),ls=float(os.environ.get('LS',.88))):
    x,sr=say(text,ls)
    x=librosa.effects.pitch_shift(x,sr=sr,n_steps=lift)
    x=hold_last_vowel(x,sr,hold,fall).astype(float)
    x=resample_poly(x,SR,sr);x/=np.max(np.abs(x))
    # 張り: brighter presence and a harder drive push the voice forward without smearing the words
    pres=float(os.environ.get('PRESENCE',.75));drive=float(os.environ.get('DRIVE',2.4))
    x=hp(x,150);x=x+pres*bp(x,2000,6000)+.25*bp(x,900,1600)
    x=np.tanh(x*drive)/np.tanh(drive)
    d=np.concatenate([np.zeros(int(.012*SR)),x])[:len(x)]
    st=np.stack([x*.9+d*.25,x*.9-d*.05+d*.3],1)          # light width
    st=np.concatenate([st,np.zeros((int(.9*SR),2))])
    echo=np.zeros_like(st);i=int(.17*SR);echo[i:]+=st[:-i]*.18
    return master(reverb(st+echo,IR_HALL,.16),.95,.1)
CALLS=[('big','Big win!',.45,1.5),('mega','Mega win!',.62,2.0),('super','Super mega win!',.75,2.5),
       ('golden','Golden win!',.62,2.0),('jackpot','Jackpot!',.55,2.0)]
for name,text,hold,fall in CALLS:write('voice-'+name,call(text,hold,fall))
