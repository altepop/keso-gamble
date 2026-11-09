"""The user's own recorded "MEGA WIN!" call → voice-mega. Separated from the clip's background with Demucs
(htdemucs, vocals stem), trimmed, gated, EQ'd and given the same light width/echo/hall as the other calls."""
import os,sys,numpy as np,librosa,soundfile as sf
src,outdir=sys.argv[1],sys.argv[2]
sys.argv=[sys.argv[0],outdir];exec(open('render.py').read().split('# ---------- announcer ----------')[0])
r=open('render.py').read();exec(r[r.index('def write(name,x):'):r.index("os.makedirs(OUT,exist_ok=True)")]);os.makedirs(OUT,exist_ok=True)
y,sr=librosa.load(src,sr=SR,mono=True)
rms=librosa.feature.rms(y=y,frame_length=1024,hop_length=256)[0];on=np.where(rms>rms.max()*.12)[0]
a=max(0,on[0]*256-int(.03*SR));b=min(len(y),on[-1]*256+int(.12*SR));y=y[a:b]
# spectral gate: subtract a floor estimated from the quietest frames (leftover music bleed)
S=librosa.stft(y,n_fft=2048,hop_length=512);mag,ph=np.abs(S),np.angle(S)
floor=np.percentile(mag,15,axis=1,keepdims=True)*1.6
mag=np.maximum(mag-floor,mag*.08)
y=librosa.istft(mag*np.exp(1j*ph),hop_length=512,length=len(y))
f=int(.02*SR);y[:f]*=np.linspace(0,1,f);y[-int(.08*SR):]*=np.linspace(1,0,int(.08*SR))
y=y/np.max(np.abs(y));y=hp(y,90);y=y+.3*bp(y,2500,6000);y=np.tanh(y*1.5)/np.tanh(1.5)
d=np.concatenate([np.zeros(int(.012*SR)),y])[:len(y)]
st=np.stack([y*.92+d*.2,y*.92+d*.24],1);st=np.concatenate([st,np.zeros((int(.9*SR),2))])
echo=np.zeros_like(st);i=int(.17*SR);echo[i:]+=st[:-i]*.16
write('voice-mega',master(reverb(st+echo,IR_HALL,.14),.95,.1))
