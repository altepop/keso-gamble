"""Hyped announcer: "MEGA WIIIIIN!!!!" — the last word's vowel is held (stretched) and climbs in pitch, shouted.

Piper (voice norman, public-domain training data) says each word separately; the held vowel is a phase-vocoder
stretch of the word's loudest steady part, rising up to +4 semitones, then the usual double-track, drive and stadium.
"""
import os,wave,sys,numpy as np,librosa
from piper import PiperVoice, SynthesisConfig
sys.argv=[sys.argv[0],os.environ.get('OUT','out')];exec(open('render.py').read().split('# ---------- announcer ----------')[0])  # reuse DSP helpers
import os
def write(name,x):
    import subprocess
    pcm=(np.clip(x,-1,1)*32767).astype(np.int16)
    tmp=os.path.join(OUT,name+'.wav')
    with wave.open(tmp,'wb') as w: w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes(pcm.tobytes())
    subprocess.run(['ffmpeg','-v','error','-y','-i',tmp,'-codec:a','libmp3lame','-b:a','112k',os.path.join(OUT,name+'.mp3')],check=True)
    os.remove(tmp); print(name, f'{len(x)/SR:.2f}s', os.path.getsize(os.path.join(OUT,name+'.mp3'))//1024,'KB')

os.makedirs(OUT,exist_ok=True)
V=PiperVoice.load('en_US-norman-medium.onnx')
def say(text,ls):
    import io
    b=io.BytesIO()
    with wave.open(b,'wb') as w: V.synthesize_wav(text,w,syn_config=SynthesisConfig(length_scale=ls,noise_scale=.5,noise_w_scale=.5))
    b.seek(0)
    with wave.open(b) as w: x=np.frombuffer(w.readframes(w.getnframes()),np.int16).astype(np.float32)/32768;sr=w.getframerate()
    idx=np.where(np.abs(x)>.02)[0];return x[max(0,idx[0]-100):idx[-1]+300],sr
def held(x,sr,hold=1.6,rise=4):
    # loudest 120 ms window = the vowel; stretch its middle 60 ms
    e=np.convolve(x**2,np.ones(int(.03*sr)),'same');c=int(np.argmax(e));a=max(0,c-int(.03*sr));b=min(len(x),c+int(.03*sr))
    seg=x[a:b];reps=max(1.0,hold/(len(seg)/sr))
    long=librosa.effects.time_stretch(np.tile(seg,1),rate=1/reps)
    # climb in pitch over the held vowel, in slices
    n=8;parts=np.array_split(long,n);out=[]
    for i,p in enumerate(parts):out.append(librosa.effects.pitch_shift(p,sr=sr,n_steps=rise*i/(n-1)))
    long=np.concatenate(out);fade=int(.008*sr)
    def xf(u,v):
        f=np.linspace(0,1,fade);return np.concatenate([u[:-fade],u[-fade:]*(1-f)+v[:fade]*f,v[fade:]])
    tail=librosa.effects.pitch_shift(x[b:],sr=sr,n_steps=rise)
    return xf(xf(x[:a],long),tail)
def hype(first,last,hold,rise,gap=.06):
    f,sr=say(first,.95);l,_=say(last,1.0)
    f=librosa.effects.pitch_shift(f,sr=sr,n_steps=2)  # shouted, a little higher
    l=librosa.effects.pitch_shift(held(l,sr,hold,rise),sr=sr,n_steps=2)
    x=np.concatenate([f,np.zeros(int(gap*sr)),l]).astype(float)
    x=resample_poly(x,SR,sr);x/=np.max(np.abs(x))
    x=hp(x,110);x=x+.7*bp(x,2000,5000);x=np.tanh(x*2.8)/np.tanh(2.8)
    d1=np.concatenate([np.zeros(int(.016*SR)),x])[:len(x)];d2=np.concatenate([np.zeros(int(.024*SR)),x])[:len(x)]
    st=np.stack([x*.8+d1*.5,x*.8+d2*.5],1);st=np.concatenate([st,np.zeros((int(1.8*SR),2))])
    echo=np.zeros_like(st)
    for k,(dl,g) in enumerate([(.21,.38),(.42,.22),(.63,.12)]):
        i=int(dl*SR);echo[i:]+=st[:-i]*g*(np.array([1,.6]) if k%2 else np.array([.6,1]))
    return master(reverb(st+echo,IR_STADIUM,.3),.95,.2)
OUT=sys.argv[1] if len(sys.argv)>1 else '.'
import os
out=os.environ.get('OUT','out')
for name,first,last,hold,rise in [('big','Big','win!',.7,2),('mega','Mega','win!',1.6,4),('super','Super mega','win!',2.2,5),('golden','Golden','win!',1.6,4),('jackpot','Jack','pot!',1.3,3)]:
    write('voice-'+name,hype(first,last,hold,rise))
