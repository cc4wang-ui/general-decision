import json,subprocess,sys
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
repo=Path(__file__).resolve().parents[2]
out=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else repo/'design/8bit/final'
source="import {spriteGrid,MOODS,PALETTES} from './design/sprites.mjs'; console.log(JSON.stringify({palettes:PALETTES,sprites:[0,1,2].flatMap(lv=>MOODS.map(mood=>({lv,mood,grid:spriteGrid(lv,mood)})))}))"
obj=json.loads(subprocess.check_output(['node','--input-type=module','-e',source],cwd=repo,text=True))
out.mkdir(parents=True,exist_ok=True)
board=Image.new('RGB',(1008,700),'#E3DFD0');d=ImageDraw.Draw(board)
try: font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',16)
except OSError: font=ImageFont.load_default(size=16)
d.text((24,14),'DECIDE / 48 x 48 / NES PALETTE / 3 OFFICERS x 5 MOODS',fill='#1B1D1A',font=font)
report=[]
for a in obj['sprites']:
 lv,mood,g=a['lv'],a['mood'],a['grid']
 im=Image.new('RGBA',(48,48));im.putdata([tuple(bytes.fromhex(c[1:]))+(255,) if c else (0,0,0,0) for row in g for c in row])
 for root in [out/'public/officers',repo/'public/officers']:
  (root/str(lv)).mkdir(parents=True,exist_ok=True)
  im.save(root/str(lv)/(mood+'.png'))
  im.save(root/str(lv)/(mood+'.webp'),lossless=True,exact=True)
 (out/'enlarged'/str(lv)).mkdir(parents=True,exist_ok=True)
 im.resize((960,960),Image.Resampling.NEAREST).save(out/'enlarged'/str(lv)/(mood+'.png'))
 col=['idle','bark','praise','punish','soft'].index(mood)
 x,y=24+col*196,50+lv*214
 d.rectangle((x,y,x+191,y+191),fill='#F5F2E8')
 board.paste(im.resize((192,192),Image.Resampling.NEAREST),(x,y),im.resize((192,192),Image.Resampling.NEAREST))
 d.text((x,y+193),str(lv)+' / '+mood,fill='#1B1D1A',font=font)
 colors=set(c for row in g for c in row if c)
 report.append({'level':lv,'mood':mood,'size':[48,48],'opaqueColors':len(colors),'colors':sorted(colors),'alpha':[0,255]})
board.save(out/'contact-sheet.png')
sil=Image.new('RGBA',(184,64),'#F5F2E8')
for lv in range(3):
 im=Image.open(out/f'public/officers/{lv}/idle.png').convert('RGBA')
 black=Image.new('RGBA',im.size,'black');black.putalpha(im.getchannel('A'))
 sil.alpha_composite(black,(8+lv*60,8))
sil.save(out/'silhouettes-48.png');sil.resize((1104,384),Image.Resampling.NEAREST).save(out/'silhouettes-enlarged.png')
(out/'validation.json').write_text(json.dumps(report,indent=2))
print([(r['level'],r['mood'],r['opaqueColors']) for r in report])
