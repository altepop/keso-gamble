"""Render the Worker's completed race timeline. No random result, audio, or wallet access."""
import argparse, json, math, os, subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
W,H,FPS=768,432,12
COLORS=['#f5c96a','#65d2fb','#f188a5','#9bda87','#baa1f7','#ff9d61','#d6e2ee','#e0cf93','#78dac9','#ef8bd0']
def distance(h,t):
    if t<=0:return 0
    if t>=h['finish']:return 1600+18*(1-math.exp(-(t-h['finish'])/1500))
    u=t/h['finish'];return 1600*(u+h['curve']*u*(1-u))
def render(show,output,font_path,duration=52):
    card=show['card'];horses=card['horses'];timeline=show['timeline']['horses'];order=show['order']
    font=lambda n:ImageFont.truetype(font_path,n)
    small,normal,big=font(13),font(17),font(24)
    canvas=Image.new('RGB',(W,H),'#080f24')
    d=ImageDraw.Draw(canvas);d.rectangle((0,0,W,76),fill='#122443');d.text((22,10),'KESO RACING  /  REPLAY',font=small,fill='#d9ba79')
    title=card['name']
    while d.textlength(title,font=big)>W-44:title=title[:-2]+'…'
    d.text((22,32),title,font=big,fill='white')
    top,bottom=92,342;lane=(bottom-top)/len(horses);start,finish=224,W-40
    for i,h in enumerate(horses):
        y=top+i*lane
        d.rectangle((10,y-2,W-12,y+lane-2),fill='#142c2b' if i%2 else '#102723')
        label=f"{h['number']:02} {h['name']}"
        while d.textlength(label,font=small)>202:label=label[:-2]+'…'
        d.text((16,y+3),label,font=small,fill=COLORS[i%len(COLORS)])
        d.line((start,y+lane-3,finish+10,y+lane-3),fill='#285448',width=1)
    for y in range(top-5,int(bottom),8):
        for x in range(2):d.rectangle((finish+x*5,y,finish+x*5+4,y+7),fill='white' if (y//8+x)%2 else '#19201d')
    d.text((finish-22,78),'GOAL',font=small,fill='#eddaa9')
    d.text((18,407),'確定したレースの着順・進行を再現しています。音声はありません。',font=small,fill='#8d9eb6')
    command=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W}x{H}','-framerate',str(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-crf','25','-pix_fmt','yuv420p','-movflags','+faststart','-maxrate','700k','-bufsize','1400k',str(output)]
    process=subprocess.Popen(command,stdin=subprocess.PIPE)
    try:
        for frame in range(round(duration*FPS)):
            t=frame/FPS*1000;image=canvas.copy();draw=ImageDraw.Draw(image)
            for i,h in enumerate(horses):
                n=h['number'];info=timeline[str(n)];x=start+min(1.018,distance(info,t)/1600)*(finish-start);y=top+(i+.48)*lane
                c=COLORS[i%len(COLORS)];bob=math.sin(t/90+i)*1.3 if t<info['finish'] else 0;y+=bob
                # Readable horse silhouette: body, neck, head, tail, moving legs and saddle number.
                draw.ellipse((x-13,y-6,x+9,y+4),fill=c);draw.polygon([(x+3,y-3),(x+8,y-14),(x+15,y-13),(x+15,y-7),(x+9,y-6)],fill=c)
                draw.polygon([(x-12,y-4),(x-20,y-8),(x-16,y+1)],fill=c)
                stride=math.sin(t/65+i)*5 if t<info['finish'] else 2
                for leg,offset in enumerate([-8,5]):draw.line((x+offset,y+2,x+offset+stride*(-1 if leg else 1),y+10),fill=c,width=3)
                draw.rectangle((x-7,y-6,x+3,y+1),fill='#152038')
            finished=t>=50000
            leader=max(horses,key=lambda h:distance(timeline[str(h['number'])],t))
            text='スタート！'
            for line in show['commentary']:
                if line['t']<=t:text=line['text'].replace('、',' ')
            if finished:
                text='  /  '.join(f"{i+1}着 {n}番" for i,n in enumerate(order[:3]))
            while draw.textlength(text,font=normal)>W-44:text=text[:-2]+'…'
            draw.rounded_rectangle((12,355,W-12,397),radius=8,fill='#1c2c49')
            draw.text((22,365),text,font=normal,fill='#ffe0a0')
            draw.text((W-192,12),'確定順位' if finished else f"{min(50,int(t/1000)):02}s  先頭 {leader['number']}番",font=small,fill='#dde8f9')
            process.stdin.write(image.tobytes())
    finally:
        process.stdin.close()
    if process.wait()!=0:raise RuntimeError('video_encode_failed')
    if Path(output).stat().st_size>8_000_000:raise RuntimeError('video_too_large')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('input');p.add_argument('output');p.add_argument('--font',required=True);p.add_argument('--seconds',type=float,default=52);a=p.parse_args()
    render(json.loads(Path(a.input).read_text()),a.output,a.font,a.seconds)
