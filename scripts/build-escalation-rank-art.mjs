// Original KESO rank art. No third-party game assets, remote fonts or external references.
import {writeFileSync,mkdirSync} from 'node:fs';
const dir=new URL('../assets/escalation-ranks/',import.meta.url);mkdirSync(dir,{recursive:true});
const arts=[
 ['unranked','#53617b','#b8c4dc','<path d="M64 32 85 48 81 81 64 94 47 81 43 48Z"/><path d="m55 54 9-5 10 7-2 10-8 5v7M64 84v3" fill="none" stroke="#182039" stroke-width="5"/>'],
 ['iron','#718096','#d4dde8','<path d="m40 43 24-15 24 15-5 39-19 15-19-15Z"/><path d="m50 49 14-8 14 8-3 26-11 9-11-9Z" fill="#283342"/><path d="m57 54 7-4 7 4-2 17-5 5-5-5Z"/>'],
 ['bronze','#ad602d','#f4c38d','<path d="m31 48 15-14 18 8 18-8 15 14-12 34-21 19-21-19Z"/><path d="m46 54 18 10 18-10-6 20-12 12-12-12Z" fill="#462b20"/><path d="m49 42 15-17 15 17-15 12Z"/>'],
 ['silver','#87a4bd','#e9f8ff','<path d="m23 50 27-7 14-23 14 23 27 7-12 24-29 30-29-30Z"/><path d="m43 53 21-17 21 17-7 27-14 13-14-13Z" fill="#344d66"/><path d="m54 57 10-12 10 12-10 23Z"/>'],
 ['gold','#c38621','#fff0a9','<path d="m20 46 22 7 7-23 15 15 15-15 7 23 22-7-16 35-28 23-28-23Z"/><path d="m44 60 20-9 20 9-6 21-14 12-14-12Z" fill="#77501b"/><path d="m54 63 10-9 10 9-10 18Z"/>'],
 ['platinum','#138da6','#b1fff0','<path d="m15 49 27-3 8-20 14 12 14-12 8 20 27 3-22 36-27 21-27-21Z"/><path d="m34 51 15 9 15-22 15 22 15-9-13 27-17 17-17-17Z" fill="#11616f"/><path d="m54 63 10-16 10 16-10 20Z"/>'],
 ['diamond','#8c65d7','#ede1ff','<path d="m17 49 23-15 24-15 24 15 23 15-17 32-30 27-30-27Z"/><path d="m35 48 14-13h30l14 13-29 45Z" fill="#614095"/><path d="m64 29 17 20-17 37-17-37Z"/><path d="M35 48h58M49 35l-2 14M79 35l2 14" fill="none" stroke="#c0a1ef" stroke-width="2"/>'],
 ['ascendant','#16996a','#c5ffb6','<path d="m14 55 23-18 4-15 23 13 23-13 4 15 23 18-22 31-28 22-28-22Z"/><path d="m37 51 27-26 27 26-12 31-15 13-15-13Z" fill="#116345"/><path d="m64 36 18 25-18 29-18-29Z"/><path d="m64 47 10 14-10 16-10-16Z" fill="#146a43"/>'],
 ['immortal','#c43763','#ffb5cb','<path d="m11 43 30 9 9-29 14 14 14-14 9 29 30-9-16 31-20 14-17 24-17-24-20-14Z"/><path d="m33 55 15 8 16-29 16 29 15-8-15 25-16 19-16-19Z" fill="#7d2448"/><path d="m64 42 11 24-11 26-11-26Z"/><path d="m16 35 13 7-7 14M112 35l-13 7 7 14" fill="none" stroke-width="4"/>'],
 ['radiant','#d0a738','#fffde0','<path d="m9 48 25 7 5-27 18 13 7-29 7 29 18-13 5 27 25-7-19 31-22 9-14 26-14-26-22-9Z"/><path d="m32 60 17 8 15-39 15 39 17-8-19 22-13 19-13-19Z" fill="#c4a34b"/><path d="m64 35 15 30-15 29-15-29Z" fill="#fffde7"/><path d="M64 4v8M28 16l7 11M100 16l-7 11M8 34l12 7M120 34l-12 7" stroke="#ffedac" stroke-width="3"/>'],
];
for(const [key,lo,hi,glyph] of arts){
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 128 128"><defs><linearGradient id="metal" x1=".15" y1="1" x2=".85" y2="0"><stop stop-color="${lo}"/><stop offset=".52" stop-color="${hi}"/><stop offset="1" stop-color="${lo}"/></linearGradient><radialGradient id="halo"><stop stop-color="${lo}" stop-opacity=".45"/><stop offset="1" stop-color="${lo}" stop-opacity="0"/></radialGradient></defs><circle cx="64" cy="64" r="63" fill="url(#halo)"/><path d="M64 8 112 36v55l-48 29-48-29V36Z" fill="#071022" fill-opacity=".7" stroke="${lo}" stroke-opacity=".5"/><g fill="url(#metal)" stroke="${hi}" stroke-width="1.4" stroke-linejoin="round">${glyph}</g><path d="M33 112h15M80 112h15" stroke="${hi}" stroke-opacity=".5"/></svg>\n`;
 writeFileSync(new URL(key+'.svg',dir),svg);
}
console.log('Wrote '+arts.length+' original SVG rank emblems.');
