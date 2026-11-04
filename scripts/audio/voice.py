"""Announcer lines for scripts/audio/render.py (Piper TTS, voice en_US-norman-medium).

The voice was trained only on public-domain LibriVox recordings (see its MODEL_CARD). Piper runs offline here; only
the resulting audio is committed. "Jackpot" is spelled "Jack-pot!" because the model drags the plain word.
    python -m venv venv && venv/bin/pip install piper-tts numpy scipy
    curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/norman/medium/en_US-norman-medium.onnx{,.json}
    venv/bin/python voice.py && venv/bin/python render.py OUT_DIR
"""
import wave
from piper import PiperVoice, SynthesisConfig
voice=PiperVoice.load('en_US-norman-medium.onnx')
for name,text in [('big','Big win!'),('mega','Mega win!'),('super','Super mega win!'),('golden','Golden win!'),('jackpot','Jack-pot!')]:
    with wave.open(f'raw-{name}.wav','wb') as w:
        voice.synthesize_wav(text,w,syn_config=SynthesisConfig(length_scale=1.12,noise_scale=0.5,noise_w_scale=0.5))
