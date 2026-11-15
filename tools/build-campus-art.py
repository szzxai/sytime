#!/usr/bin/env python3
"""Build the north-up campus SVG from hand-drawn aerial-reference geometry.

Run: python3 tools/build-campus-art.py
No image, network, third-party package or credential is required at build time.
The landmark coordinates live in places.ts and are deliberately not regenerated.
Roof outlines/ground layouts are interpreted from the supplied drone photographs;
small foliage and material marks are deterministic drawing texture, not survey data.
"""

from pathlib import Path
from html import escape
import math
import random
import re
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "apps/web/src/maps/campus.svg"


def n(value):
    return str(round(value, 2)).rstrip("0").rstrip(".") if isinstance(value, float) else str(value)


def attrs(values):
    return " ".join(f'{key.replace("_", "-")}="{escape(n(value), quote=True)}"' for key, value in values.items())


def el(tag, **values):
    return f'<{tag} {attrs(values)}/>'


def group(body, **values):
    if values.get('aria_hidden') == 'true':
        values.setdefault('pointer_events', 'none')
    return f'<g {attrs(values)}>{body}</g>'


def rect(x, y, w, h, fill, **kw):
    return el("rect", x=x, y=y, width=w, height=h, fill=fill, **kw)


def path(d, fill="none", **kw):
    return el("path", d=d, fill=fill, **kw)


def line(d, color="#a9aaa2", width=.65, **kw):
    return path(d, stroke=color, stroke_width=width, **kw)


def polygon(points, fill, **kw):
    return el("polygon", points=" ".join(f"{n(x)},{n(y)}" for x, y in points), fill=fill, **kw)


def use(ref, x, y, w, h, **kw):
    return el("use", href=f"#{ref}", x=x, y=y, width=w, height=h, **kw)


def circle(x, y, r, fill, **kw):
    return el("circle", cx=x, cy=y, r=r, fill=fill, **kw)


DEFS = []


def symbol(name, w, h, body, detail):
    # A single foliage mask protects the union of roof footprints, including overlapping hips.
    # Move crowns out of painter-order interleaving, but retain their observed planted footprint.
    contents = ET.fromstring('<g>'+body+'</g>')
    trees = [node for node in contents if node.get('data-canopy')]
    footprints = [node for node in contents.iter() if node.get('data-roof-bounds')]
    if trees:
        for node in trees: contents.remove(node)
        mask_id=f'atlas-roof-clearance-{name}'
        mask=rect(-24,-24,w+48,h+48,'#fff')
        for node in footprints:
            x,y,rw,rh=map(float,node.get('data-roof-bounds').split())
            mask+=rect(x-.9,y-.9,rw+1.8,rh+1.8,'#000')
        DEFS.append(f'<mask id="{mask_id}" maskUnits="userSpaceOnUse" x="-24" y="-24" width="{w+48}" height="{h+48}">{mask}</mask>')
        crowns=ET.SubElement(contents,'g',{'mask':f'url(#{mask_id})','data-vegetation-layer':'true'})
        crowns.extend(sorted(trees,key=lambda node:float(node.get('y','0'))+float(node.get('height','0'))/2))
    body=''.join(ET.tostring(node,encoding='unicode') for node in contents)
    DEFS.append(f'<symbol id="art-{name}" viewBox="0 0 {w} {h}" overflow="visible" data-aerial-detail="{detail}">{body}</symbol>')


def paving(x, y, w, h, warm=False):
    return rect(x, y, w, h, "#e5e1d2" if warm else "#e8e9e1", stroke="#d7ddcf", stroke_width=.45, rx=1.2) + rect(x, y, w, h, "url(#atlas-paving-grid)", rx=1.2)


def steps(x, y, w, h, count=5):
    return rect(x, y, w, h, "#c5c6bd") + "".join(line(f'M{n(x)} {n(y+i*h/count)}h{n(w)}', "#e8e7de", .7) for i in range(count))


def flat(x, y, w, h):
    return group(rect(x+1, y+2, w, h, "#748a7e", opacity=.12)
            + rect(x, y, w, h, "#adb7ad", stroke="#f4f3e9", stroke_width=1.4)
            + rect(x+1.5, y+1.5, w-3, h-3, "url(#atlas-flat-grain)")
            + line(f'M{x+2} {y+h-2}h{w-4}V{y+2}', "#8b9a8e", .55), data_roof_bounds=f'{x} {y} {w} {h}')


def glass(x, y, w, h):
    return (rect(x, y, w, h, "url(#atlas-glass)", stroke="#7b8b8e", stroke_width=.7)
            + "".join(line(f'M{n(x+i)} {y}v{h}', "#bec9c7", .5) for i in range(5, int(w), 5))
            + "".join(line(f'M{x} {n(y+i)}h{w}', "#bec9c7", .5) for i in range(6, int(h), 6)))


def plant(x, y, w=8, h=4, count=2):
    return group(rect(x+.7, y+1, w, h, "#272f2e", opacity=.35)
                 + rect(x, y, w, h, "#d3d8d2", stroke="#a2aaa6", stroke_width=.5)
                 + "".join(circle(x+(i+.5)*w/count, y+h/2, min(h*.32, w/count*.32), "#626e6d") for i in range(count)), data_roof_equipment="ventilation")


def roof(x, y, w, h, kind="grey", hip=True):
    # Separate slopes, eaves, ridge caps and tile runs, not a flat outlined rectangle.
    palettes = {
        "grey": ("#929c98", "#b9b9a9", "#a6aea2", "#818f8d", "#d4d3c1"),
        "silver": ("#b0bec0", "#d5d7cd", "#c3ccc4", "#9eafb2", "#e3e2d6"),
        "red": ("#be8066", "#e0ad87", "#cf9676", "#b87d65", "#ebc9a6"),
        "dark": ("#7a8c87", "#a5b2a2", "#8e9f95", "#708580", "#c5d0bd"),
    }
    north, south, west, east, ridge = palettes[kind]
    a = rect(x+1.2, y+2, w, h, "#6b8274", opacity=.13)
    a += rect(x+.7, y+h-1, w-1.4, 3, "#eeece2")
    a += rect(x, y, w, h, north, stroke="#889b93", stroke_width=.55)
    if w >= h:
        k = min(h*.43, w*.25) if hip else 0
        a += polygon([(x,y+h),(x+k,y+h/2),(x+w-k,y+h/2),(x+w,y+h)], south)
        if hip:
            a += polygon([(x,y),(x+k,y+h/2),(x,y+h)], west)
            a += polygon([(x+w,y),(x+w-k,y+h/2),(x+w,y+h)], east)
        a += rect(x+.6, y+.6, w-1.2, h-1.2, "url(#atlas-tile-vertical)")
        a += line(f'M{x} {y}l{n(k)} {n(h/2)}h{n(w-2*k)}l{n(k)} {n(-h/2)}M{x} {y+h}l{n(k)} {n(-h/2)}M{x+w-k} {y+h/2}l{n(k)} {n(h/2)}', ridge, .8)
        a += line(f'M{x+k} {y+h/2}h{w-2*k}', "#ded5be", .7)
    else:
        k = min(w*.43, h*.25) if hip else 0
        a += polygon([(x,y),(x+w/2,y+k),(x+w/2,y+h-k),(x,y+h)], south)
        a += polygon([(x+w,y),(x+w/2,y+k),(x+w/2,y+h-k),(x+w,y+h)], north)
        if hip:
            a += polygon([(x,y),(x+w/2,y+k),(x+w,y)], east)
            a += polygon([(x,y+h),(x+w/2,y+h-k),(x+w,y+h)], west)
        a += rect(x+.6, y+.6, w-1.2, h-1.2, "url(#atlas-tile-horizontal)")
        a += line(f'M{x} {y}l{n(w/2)} {n(k)}v{n(h-2*k)}l{n(-w/2)} {n(k)}M{x+w} {y}l{n(-w/2)} {n(k)}M{x+w/2} {y+h-k}l{n(w/2)} {n(k)}', ridge, .8)
    a += line(f'M{x} {y+h}h{w}', "#c0b9a8", .8)
    return group(a, data_roof=kind, data_roof_bounds=f'{x} {y} {w} {h}')


def cedar(seed):
    rng = random.Random(seed)
    a = circle(26, 27, 21, "#8da796", opacity=.12)
    pts = []
    for i in range(64):
        t = i*math.tau/64
        r = rng.uniform(17, 22) if i%2 == 0 else rng.uniform(10, 16)
        pts.append((25+math.cos(t)*r,25+math.sin(t)*r))
    a += polygon(pts,"#94b2a1")
    branches, needles = [], []
    for i in range(22):
        t = i*math.tau/22
        r = rng.uniform(12,21)
        x,y=25+math.cos(t)*r,25+math.sin(t)*r
        branches.append(f'M25 25 {n(x)} {n(y)}')
        needles.append(f'M{n(25+math.cos(t)*r*.5)} {n(25+math.sin(t)*r*.5)}l{n(math.cos(t+.6)*r*.3)} {n(math.sin(t+.6)*r*.3)}')
    a += line(" ".join(branches), "#c2d5b6", .8) + line(" ".join(needles), "#b7cdb2", .6)
    return a + circle(24,24,3,"#bfd4b4")


def canopy(seed, family):
    rng = random.Random(seed)
    palettes = {"green": ("#789477", "#a1b88a", "#c5d3a7"), "gold": ("#b6b67b", "#d0cb91", "#e6dfaf"), "rust": ("#b28d77", "#cbaa8c", "#dfc3a3")}
    shadow, mid, light = palettes[family]
    pts=[]
    for i in range(60):
        t=i*math.tau/60
        lobes = 7 if family == 'green' else 5 if family == 'gold' else 11
        r=20+2*math.sin(t*lobes)+rng.uniform(-.7,.7)
        pts.append((25+math.cos(t)*r*(.78 if family=='rust' else 1),25+math.sin(t)*r))
    a=polygon([(x+1.5,y+2) for x,y in pts],"#728d75",opacity=.14)
    a+=polygon(pts,shadow)
    # Unequal interlocking leaf clusters create volume without cartoon outlines.
    foliage = {}
    for i in range(48):
        t=rng.uniform(0,math.tau); radius=math.sqrt(rng.random())*18
        x,y=24+math.cos(t)*radius,24+math.sin(t)*radius
        r=rng.uniform(2.1,5.7)
        leaf=[]
        for j in range(11):
            q=j*math.tau/11; rr=r*rng.uniform(.74,1.14)
            leaf.append((x+math.cos(q)*rr,y+math.sin(q)*rr))
        color = light if x+y<43 and i%3 else mid
        opacity = round(rng.uniform(.45,.9)*4)/4
        foliage.setdefault((color,opacity),[]).append('M'+' '.join(f'{n(xx)} {n(yy)}' for xx,yy in leaf)+'Z')
    # Batch equal-paint contours: hundreds of crowns remain inexpensive to pan/zoom.
    for (color,opacity),contours in foliage.items():
        a+=path(' '.join(contours),color,opacity=opacity)
    flecks={light:[],shadow:[]}
    for _ in range(45):
        t=rng.uniform(0,math.tau);radius=math.sqrt(rng.random())*20
        x,y=24+math.cos(t)*radius,24+math.sin(t)*radius
        flecks[light if y<27 else shadow].append(f'M{n(x)} {n(y)}l1.2 -.5')
    for color,contours in flecks.items():a+=line(' '.join(contours),color,.6,opacity=.65)
    return a


def tree(x,y,r=12,kind="green",variant=0):
    return use(f'atlas-tree-{kind}-{variant%4}',x-r,y-r,r*2,r*2, data_canopy=kind)


def planting(specimens):
    """Explicit crown centres, types and spread; no random scattering of site vegetation."""
    return ''.join(tree(x,y,r,kind,i%4) for i,(x,y,r,kind) in
                   sorted(enumerate(specimens),key=lambda item:item[1][1]))


def bamboo(seed):
    rng=random.Random(seed)
    a=''
    for i in range(8):
        x,y=rng.uniform(12,38),rng.uniform(10,42)
        a+=line(f'M{x} {y+7}l-2 -14','#a4b694',.65)
        for j in [-1,1]:
            a+=path(f'M{x-1} {y}q{j*9} -9 {j*11} -7q{-j*2} 7 {-j*11} 7Z','#aec79c')
            a+=path(f'M{x} {y+5}q{j*9} -7 {j*12} -4q{-j*4} 6 {-j*12} 4Z','#90b58f')
    return a


def water(d):
    return group(path(d,"#e0e3d5",stroke="#d1d9c9",stroke_width=4)
                 + path(d,"url(#atlas-water-depth)",stroke="#aac0ae",stroke_width=.85,stroke_linejoin="round")
                 + path(d,"url(#atlas-water-flecks)",opacity=.7),data_material="water")


def pavilion(x,y,r=12):
    pts=[(x+math.cos(i*math.tau/6)*r,y+math.sin(i*math.tau/6)*r) for i in range(6)]
    a=polygon([(xx+2,yy+3) for xx,yy in pts],"#1d3430",opacity=.3)
    for i in range(6):
        a+=polygon([(x,y),pts[i],pts[(i+1)%6]], ["#4c5857","#879086","#737e75","#596764","#3f504c","#4a5a53"][i],stroke="#c0c3ad",stroke_width=.45)
    return group(a+circle(x,y,1.3,"#d5cdb4"),data_roof="pavilion",data_roof_bounds=f'{x-r} {y-r} {2*r} {2*r}')


def definitions():
    DEFS.extend([
        '<pattern id="atlas-tile-vertical" width="1.9" height="3.8" patternUnits="userSpaceOnUse"><path d="M.4 0v3.8" stroke="#eee9d6" stroke-width=".42" opacity=".3"/><path d="M1.1 0v3.8M0 3h1.9" stroke="#263b36" stroke-width=".3" opacity=".24"/></pattern>',
        '<pattern id="atlas-tile-horizontal" width="3.8" height="1.9" patternUnits="userSpaceOnUse"><path d="M0 .4h3.8" stroke="#eee9d6" stroke-width=".42" opacity=".3"/><path d="M0 1.1h3.8M3 0v1.9" stroke="#263b36" stroke-width=".3" opacity=".24"/></pattern>',
        '<pattern id="atlas-paving-grid" width="12" height="9" patternUnits="userSpaceOnUse"><path d="M0 0h12v9H0ZM6 0v4.5M0 4.5h12M3 4.5V9M9 4.5V9" fill="none" stroke="#9a9f97" stroke-width=".35" opacity=".55"/><path d="M0 1h5M7 5.5h4" stroke="#f1eee2" stroke-width="1" opacity=".4"/></pattern>',
        '<pattern id="atlas-flat-grain" width="19" height="17" patternUnits="userSpaceOnUse"><path d="M1 3h3m6 8h4M4 15h2m10-11h1" stroke="#c2c2b4" opacity=".12" stroke-width=".7"/><path d="M9 1v16M0 8h19" stroke="#303f3c" opacity=".22" stroke-width=".35"/></pattern>',
        '<pattern id="atlas-lawn-grain" width="23" height="19" patternUnits="userSpaceOnUse"><path d="M0 1h12v4H1ZM15 12h8v6H13Z" fill="#7c805e" opacity=".1"/><path d="M4 8h4m9 0h2m-8 7h4" stroke="#e0d8ba" opacity=".3" stroke-width=".6"/></pattern>',
        '<pattern id="atlas-water-flecks" width="29" height="23" patternUnits="userSpaceOnUse"><path d="M3 5h1m13 8h1m-7 6h2m16-12h1" stroke="#9eae8d" opacity=".32" stroke-width=".6"/></pattern>',
        '<pattern id="atlas-decking" width="3" height="6" patternUnits="userSpaceOnUse"><path d="M0 0v6" stroke="#5d6254" stroke-width=".55" opacity=".65"/></pattern>',
        '<linearGradient id="atlas-glass" x2=".8" y2="1"><stop stop-color="#b6c8cb"/><stop offset="1" stop-color="#7e9eaa"/></linearGradient>',
        '<linearGradient id="atlas-water-depth" x2="30%" y2="100%"><stop stop-color="#9fbeb1"/><stop offset=".65" stop-color="#b5cdbb"/><stop offset="1" stop-color="#c7d7bd"/></linearGradient>',
        '<linearGradient id="atlas-metal" x2="0" y2="1"><stop stop-color="#9dcedc"/><stop offset=".49" stop-color="#c0e1e7"/><stop offset=".51" stop-color="#8cc0d4"/><stop offset="1" stop-color="#b1d8e2"/></linearGradient>',
        '<linearGradient id="atlas-canvas" x2="1" y2="0"><stop stop-color="#b8bdb8"/><stop offset=".35" stop-color="#f4f1e6"/><stop offset=".72" stop-color="#e5e5da"/><stop offset="1" stop-color="#abb5ae"/></linearGradient>',
    ])
    for family in ["green","gold","rust","cedar","bamboo"]:
        for i in range(4):
            body=bamboo(812+i) if family=='bamboo' else cedar(619+i) if family=="cedar" else canopy(248+i*17,family)
            DEFS.append(f'<symbol id="atlas-tree-{family}-{i}" viewBox="0 0 52 54" overflow="visible">{body}</symbol>')
    DEFS.extend([
        '<pattern id="atlas-asphalt" width="17" height="13" patternUnits="userSpaceOnUse"><path d="M2 3h.7m9 6h1m-6 2h.6m10-9h.8" fill="none" stroke="#b2bfb3" stroke-width=".65" opacity=".36"/></pattern>',
        '<pattern id="atlas-granite" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M0 0h24v24H0Z" fill="none" stroke="#c0cbbf" stroke-width=".65"/><path d="M1 1h22v22H1Z" fill="none" stroke="#f8f8f1" stroke-width=".7"/></pattern>',
        '<pattern id="atlas-stone" width="17" height="10" patternUnits="userSpaceOnUse"><path d="M0 0h17v10H0ZM0 5h17M10 0v5M5 5v5" fill="none" stroke="#bcc6b8" stroke-width=".5"/><path d="M1 1h8v3H1Zm10 5h5v3h-5Z" fill="#faf8eb" opacity=".38"/></pattern>',
        '<pattern id="atlas-brick" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 0h5v10H0ZM5 0h5v5H5ZM0 5h5" fill="none" stroke="#c2bfaa" stroke-width=".45"/></pattern>',
        '<pattern id="atlas-pebble" width="12" height="10" patternUnits="userSpaceOnUse"><path d="M2 2q2-1 3 1t-3 1ZM8 6q2-2 3 0t-3 1Z" fill="#c4cbb8" opacity=".55"/><path d="m0 8 3-1m5-5 2-1" fill="none" stroke="#faf8ee" stroke-width=".8"/></pattern>',
    ])


def teaching_buildings():
    # References 1/5/6: long gabled grey roofs; end stairs are flat, not extra hips.
    for side in ["west","east"]:
        a=paving(3,4,171,63)+flat(7,47,27,17)+flat(140,47,28,17)
        a+=roof(5,7,165,44,hip=False)
        a+=rect(8,51,159,3,"#d1d6d2")
        a+="".join(rect(x,53,3,6,"#e9e7db") for x in range(39,137,12))
        a+=steps(10,64,20,5,4)+steps(144,64,20,5,4)
        a+=plant(18 if side=="west" else 144,49,9,4)
        symbol(f'{side}-ziyang-plan',177,70,a,"gabled-roof-flat-stair-towers")
    for side in ["west","east"]:
        a=roof(3,4,170,31,"red")+rect(4,35,168,2.5,"#c9c0a9")
        a+="".join(rect(x,33,2.1,3.5,"#e0d7bf") for x in range(10,167,12))
        a+=steps(76 if side=="west" else 84,37,18,4,3)
        symbol(f'{side}-red-plan',177,42,a,"terracotta-ridge-and-eaves")
    # Reference 2: detached hipped volumes, diagonal glass links and eastern flat wing.
    a=paving(4,4,150,222)+rect(9,137,90,82,"#cad3ac")+rect(9,137,90,82,"url(#atlas-lawn-grain)")
    a+=line('M14 146h78v54H38v17',"#c2c4b8",5)+flat(100,133,47,88)
    a+=flat(91,13,55,54)+line('M112 17v45M93 39h51',"#89918a",.8)+plant(96,29,7,20,4)
    a+=roof(10,10,87,60,"silver")
    a+=path('M42 80 144 66v12L42 91Z',"#a3b9b5",stroke="#d1d4ca",stroke_width=1)
    a+=path('M61 80 118 70v11l-57 7Z',"url(#atlas-glass)")
    a+=roof(9,95,138,39,"silver")+flat(52,107,51,17)
    a+=line('M65 107v17m13-17v17m13-17v17',"#dfdfd5",1.3)+plant(54,110,9,4)
    a+=path('M49 135 101 146v8L49 140Z',"url(#atlas-glass)",stroke="#b4bebb",stroke_width=.7)
    a+=plant(127,146,8,5)+steps(14,133,21,8)+tree(39,188,20)+tree(24,214,11)+tree(80,171,9)
    symbol('weichang-plan',158,230,a,"two-hipped-volumes-diagonal-glazed-links")
    # Reference 2: the lab has a deep open court, perimeter parapets and a glazed west wing.
    a=paving(4,3,147,164)+rect(43,47,61,78,"#c1cfa6")
    a+=line('M44 64h59M72 65v45h31',"#c4c2b5",7)
    a+=path('M10 9h127v148H10ZM42 46v80h61V46Z',"#adb7ad",fill_rule="evenodd",stroke="#e2dfd2",stroke_width=1.7)
    a+=path('M12 11h123v144H12ZM42 46v80h61V46Z',"url(#atlas-flat-grain)",fill_rule="evenodd")
    a+=line('M15 42h121M107 46v105M14 137h122',"#8a9388",.7)
    a+=glass(16,49,16,77)+line('M14 47h23v84H14',"#d5dcd7",1.4)
    a+=flat(108,12,27,24)+plant(15,17,15,5,3)+plant(32,17,12,5,3)
    a+=plant(117,70,5,14,3)+plant(116,101,5,12,2)
    a+=steps(43,119,60,7)+tree(56,100,13,"rust")+tree(84,61,8)+rect(50,79,11,9,"#b3afa0")
    symbol('lab-plan',156,170,a,"open-laboratory-courtyard-glazed-west-wing")
    # Reference 5: large north hall, terraces and three separate transverse office roofs.
    a=paving(3,3,74,282)+flat(11,63,62,213)+roof(5,6,69,56,"grey")
    a+=flat(15,64,26,22)+rect(44,65,25,20,"#bacba5")+path('M45 76q9-10 22-4v5q-12-6-22 3Z',"#bac1a4")
    a+=rect(15,89,23,20,"#c7d3b2")+plant(43,89,24,9,4)
    a+=roof(11,112,62,37)+roof(11,153,62,37)+roof(11,194,62,37)
    a+=flat(15,235,50,39)+flat(15,235,36,27)+plant(18,241,8,5)+steps(26,277,26,6)
    a+="".join(line(f'M14 {y}h57',"#deddd1",1) for y in [108,150,191,232])
    symbol('sanyuan-plan',80,290,a,"north-hall-three-office-roofs-roof-terraces")
    # Reference 7: open west side, planted court and a timber deck at its east end.
    a=paving(3,3,212,120)+rect(14,42,142,41,"#b9cea6")
    a+=rect(120,42,52,41,"#9b9785")+rect(120,42,52,41,"url(#atlas-decking)")
    a+=line('M14 65h109',"#b6c0af",5)+line('M110 44v38',"#adb7a7",5)
    for x,y,r in [(29,51,10),(49,50,10),(71,51,11),(91,52,10),(37,76,9),(64,77,9),(92,74,11)]:a+=tree(x,y,r)
    a+=roof(8,7,176,32)+roof(8,87,176,32)+roof(177,7,33,112)
    a+=roof(8,87,33,32)+roof(177,7,33,32)+plant(158,69,12,7,2)
    a+=circle(140,58,2,"#ebe8da")+circle(152,58,2,"#ebe8da")+steps(6,45,7,35,9)
    symbol('science-plan',218,126,a,"u-shaped-courtyard-timber-deck-planting")
    a=flat(7,6,65,78)+roof(7,5,65,17)+paving(20,26,38,41)+glass(24,32,25,28)+plant(60,30,6,18,3)+steps(23,85,28,7)
    symbol('xiwen-plan',79,95,a,"small-roof-glazed-courtyard")
    a=roof(4,6,104,36,"silver")+flat(43,13,28,18)+glass(47,15,20,13)+plant(82,36,10,4)
    symbol('zhengdao-plan',112,49,a,"silver-hipped-roof-central-rooflight")


def southern_buildings():
    # Reference 8 viewed with library north of hall north of gym. East is the roof-service side.
    a=paving(4,4,188,108)+flat(8,8,181,97)
    a+=rect(12,37,78,62,"#b8b9a5")+rect(12,37,78,62,"url(#atlas-decking)")
    a+=paving(12,10,75,28)+rect(15,14,19,20,"#82906a")+steps(21,11,12,23,9)
    a+=glass(43,41,47,27)+glass(44,80,8,15)+line('M11 100h81V9',"#d9ddd3",1.2)
    a+=roof(98,9,29,90)+roof(127,9,57,18)+roof(178,27,10,72,"dark",False)
    a+=paving(130,29,46,36)+glass(131,44,34,25)
    a+=rect(130,70,46,32,"#a3b3a4")+line('M146 72v29m14-29v29',"#899188",.7)
    a+=plant(137,83,5,17,4)+plant(145,80,5,20,4)+plant(154,79,5,21,4)
    a+=steps(100,100,24,7)+line('M38 69h53',"#d9ddd3",1)
    symbol('library-plan',198,116,a,"western-flat-annex-glazed-links-eastern-gabled-library")
    # The auditorium has one broad polygonal silver roof, with glazing on three sides.
    a=flat(5,4,187,93)+glass(26,9,125,82)
    a+=polygon([(34,14),(144,14),(144,88),(34,88),(26,67),(26,36)],"#aeb4ae",stroke="#4b5653",stroke_width=1.1)
    a+=polygon([(34,14),(144,14),(144,51),(26,51),(26,36)],"#bdc0b5")
    a+=polygon([(34,14),(144,14),(144,88),(34,88),(26,67),(26,36)],"url(#atlas-tile-horizontal)")
    a+=roof(151,13,31,77,"silver")+flat(159,25,14,54)+plant(161,29,10,7)+plant(161,67,10,7)
    a+=glass(182,17,6,19)+glass(182,66,6,19)
    for y in [13,28,43,58,73]:a+=roof(9,y,12,10,"silver",False)
    a+=steps(66,96,47,5,3)
    symbol('hall-plan',198,102,a,"polygonal-auditorium-roof-glazed-perimeter-east-service-slot")
    # Blue folded metal panels; the white tensile canopy faces the western running track.
    a=flat(21,9,156,114)+rect(24,10,150,108,"url(#atlas-metal)",stroke="#8ca4a5",stroke_width=1)
    a+="".join(line(f'M{n(x)} 11v106',"#d4e7e7",.45,opacity=.5) for x in range(26,174,2))
    a+=line('M24 64h150',"#b9c7be",1.7)+line('M24 36h150M24 93h150',"#86c0cd",.7)
    for y in range(10,114,18):
        a+=path(f'M3 {y+3}Q11 {y-1} 21 {y+3}v18Q11 {y+22} 3 {y+19}Z',"url(#atlas-canvas)",stroke="#c0c9c0",stroke_width=.6)
    a+=roof(174,29,6,64,"dark",False)+steps(57,120,58,7,4)
    symbol('gym-plan',183,132,a,"blue-standing-seam-roof-west-tensile-canopy")
    # Southern dormitory: stepped west wings and the characteristic chevron around an inner court.
    a=paving(4,4,185,201)+rect(35,54,109,97,"#c2cda9")+flat(13,15,158,179)
    a+=path('M43 48h90v99H43Z',"#c3c5b7")
    a+=rect(48,53,77,37,"#c2d3a6")+line('M52 59h67m-67 8h67m-67 8h67m-67 8h67',"#c8cdb7",2)
    a+=roof(13,14,150,29,"silver")+roof(13,43,28,146,"silver")+roof(41,163,130,27,"silver")+roof(144,102,27,62,"silver")
    a+=glass(22,23,126,8)+glass(20,53,11,39)+plant(150,123,7,22,4)
    a+=polygon([(43,94),(62,83),(100,109),(136,84),(149,98),(100,135)],"#97ada5",stroke="#d8dfd6",stroke_width=1.3)
    a+=polygon([(49,94),(62,88),(100,116),(136,90),(143,98),(100,129)],"#afb9b2")
    a+=polygon([(66,104),(100,128),(129,108),(129,139),(100,158),(66,139)],"#93abb0",stroke="#dce2d9",stroke_width=1.2)
    a+=polygon([(78,120),(100,135),(118,123),(118,136),(100,148),(78,135)],"#d0d5c6")
    a+=plant(46,177,28,5,5)+plant(92,177,28,5,5)+tree(133,62,13)+steps(80,193,47,7)
    symbol('caiqin-plan',193,210,a,"stepped-dormitory-chevron-roof-courtyard")
    # Dining complex: broad L-shaped roof, open northern garden and two glazed roof strips.
    a=paving(3,3,184,182)+rect(16,13,102,58,"#cbd7b3")+line('M21 20h91v14H21v15h91v15H21',"#d0d2bd",4)
    a+=path('M20 27h84l-5 4H25Z',"#829fa4")+path('M20 49h84l-5 4H25Z',"#829fa4")
    a+=flat(10,77,168,103)+roof(123,7,54,171,"silver")+roof(11,77,137,101,"silver")
    a+=glass(31,139,107,12)+glass(31,157,107,11)+plant(155,27,12,22,4)
    a+=roof(12,74,112,16,"dark",False)+steps(13,65,110,8)+tree(17,22,10)+tree(109,62,10)+tree(171,182,7)
    symbol('panshui-plan',190,190,a,"l-shaped-dining-roof-twin-skylights-north-water-garden")
    a=paving(3,3,215,41)+roof(7,7,208,30,"red")
    a+=flat(81,5,17,34)+steps(89,36,17,6)+line('M12 39h192',"#d3c9b5",1.3)
    symbol('studio-plan',222,46,a,"red-tile-long-roof-with-central-break")


def gardens():
    for side,seed in [("west",61),("east",89)]:
        a=paving(3,3,171,118)+rect(10,11,158,103,"#dbd9bd")+rect(10,11,158,103,"url(#atlas-lawn-grain)")
        a+=path('M25 22 148 20 153 99 30 100Z',"#e7e1c8",opacity=.42)
        # Preserve open worn lawn; large dark canopies overlap the perimeter and autumn row.
        rng=random.Random(seed)
        for x in [18,43,72,105,140,163]:a+=tree(x,12,rng.uniform(14,18),"green",rng.randrange(4))
        for x in [17,43,70,98,124,151]:a+=tree(x,110,rng.uniform(14,18),"rust" if side=="east" else "green",rng.randrange(4))
        for y in [31,53,75,96]:
            a+=tree(13,y,18,"green",rng.randrange(4))+tree(165,y,14,"green",rng.randrange(4))
        a+=rect(42,21,7,5,"#c9c6b8")+tree(45,17,10,"gold",2)
        symbol(f'{side}-lawn-plan',177,124,a,"open-worn-lawn-enclosed-by-mature-tree-rows")
    a=paving(3,3,175,56)+water('M10 10 170 7 173 48 13 52Z')
    a+=line('M90 43v13',"#b3b8a5",3)+pavilion(90,34,10)
    a+=tree(12,12,13)+tree(39,7,12)+tree(146,9,13,"gold")+tree(166,38,14)+tree(37,54,12,"rust")
    symbol('chunyu-plan',181,62,a,"rectilinear-pond-hexagonal-water-pavilion")
    a=paving(3,3,186,109)+water('M10 10H179V69L164 96H30L11 83Z')
    a+=tree(19,18,13)+tree(174,16,14)+tree(164,83,15)+tree(38,96,14,"gold")+tree(68,104,12)
    a+=tree(94,103,12)+tree(122,98,12,"rust")+line('M17 107h165',"#cacdc0",3)
    symbol('bixia-plan',192,115,a,"stone-edged-water-overhanging-canopies")
    a=path('M8 7Q34 1 57 5L168 4Q191 10 192 32L190 114Q187 133 164 132L26 133Q5 127 4 106Z','#e1e7cf')
    a+=path('M9 111Q42 108 58 91T85 77Q109 60 151 48L187 45',stroke='#f1eee1',stroke_width=6,stroke_linecap='round')
    a+=path('M9 111Q42 108 58 91T85 77Q109 60 151 48L187 45',stroke='url(#atlas-pebble)',stroke_width=5)
    a+=planting([(21,20,25,'green'),(51,17,28,'green'),(86,24,25,'gold'),(119,18,29,'green'),(155,22,27,'green'),(179,36,21,'green'),
                 (22,52,28,'green'),(59,49,26,'cedar'),(101,49,25,'green'),(141,53,29,'cedar'),(174,73,24,'green'),
                 (26,85,29,'green'),(55,78,23,'gold'),(120,83,27,'cedar'),(149,88,29,'green'),
                 (27,115,24,'green'),(60,116,28,'green'),(101,116,24,'rust'),(135,117,25,'green'),(171,115,25,'gold')])
    a+=roof(77,78,29,22,"dark")
    symbol('daoshan-plan',198,139,a,"dense-mixed-garden-canopy-and-sheltered-pavilion")
    a=paving(2,2,188,81)+water('M12 12H85V72H12Z')+water('M102 12H179V72H102Z')
    a+=rect(86,4,15,77,"#a4aa99",stroke="#7c8878",stroke_width=.8)
    a+=line('M86 6v73M101 6v73',"#d9ddc8",1.3)
    for y in range(8,78,9):
        a+=polygon([(87,y+4),(93.5,y),(100,y+4),(93.5,y+8)],"#d2d3bd")
    a+=steps(85,1,17,5,3)+steps(85,79,17,6,3)
    a+=tree(17,12,14)+tree(42,9,15)+tree(164,12,16)+tree(177,38,13)+tree(164,71,14,"rust")+tree(31,74,14,"rust")
    symbol('panchi-plan',192,86,a,"east-west-water-basins-north-south-diamond-paved-bridge")


def heritage():
    a=paving(4,4,136,89)+steps(45,83,54,11,6)+roof(12,11,119,69,"dark")
    a+=rect(29,24,86,44,"#98ada0",opacity=.4)+roof(31,24,81,45,"grey")
    a+=line('M45 47h53',"#d4c9aa",1.2)+circle(44,47,1,"#d4c9aa")+circle(99,47,1,"#d4c9aa")
    symbol('zunjing-plan',143,98,a,"double-eaved-hip-roof-stone-entrance-steps")
    a=paving(2,2,45,94)+roof(7,7,34,62,"dark")
    a+="".join(rect(x,y,3.5,7,"#4d5751",stroke="#aeb2a3",stroke_width=.5) for x in [13,25,34] for y in [18,32,46,59])
    a+=water('M7 80Q22 68 42 79v13H7Z')+tree(37,72,7)
    symbol('stele-plan',49,99,a,"stele-gallery-and-southern-water-corner")
    # Reference 9, aligned to the library/gym axis: twin basins are separated north-south.
    # Preserve both precincts: the west water court and east ceremonial garden.
    a=paving(6,4,266,305)
    a+=paving(20,80,117,180)+rect(29,105,27,49,"#d1d6b6")+rect(70,105,28,49,"#d1d6b6")
    a+=line('M63 86v177',"#b7bbaa",10)+line('M21 157h114',"#dfe0cf",4)
    a+=water('M27 170H56V244H27Z')+water('M70 170H99V244H70Z')
    a+=rect(58,168,10,79,"#b6beab",stroke="#7e8c7c",stroke_width=.7)
    a+=line('M59 170v75M67 170v75',"#e2e4d0",.8)
    a+=paving(104,169,31,84)+rect(72,256,19,20,"#bed09d")
    a+=roof(13,10,89,67,"dark")+roof(106,8,31,28)+roof(106,45,31,29)+steps(36,77,48,14,6)
    a+=roof(12,93,9,160,"dark",False)+roof(138,49,11,224,"dark",False)
    a+=roof(78,263,60,31,"dark")+roof(149,278,116,28,"grey")
    a+=roof(174,12,91,58,"red")+paving(174,75,87,40)+steps(199,114,39,8)
    a+=rect(164,125,38,53,"#c5d2aa")+rect(220,125,40,53,"#c5d2aa")
    a+=rect(164,190,38,68,"#cbd7b5")+rect(220,190,40,68,"#cbd7b5")
    a+=line('M209 123v150M214 123v150M156 184h111',"#717e70",2)
    a+=line('M162 123v143M262 123v143',"#dfe1cc",3)
    for x,y,r,kind in [(36,105,12,"gold"),(88,105,13,"gold"),(119,117,15,"green"),(115,151,13,"green"),(98,215,9,"gold"),(29,229,12,"green"),(126,246,10,"rust"),(173,137,15,"green"),(250,139,14,"gold"),(176,208,14,"gold"),(245,212,13,"green")]:a+=tree(x,y,r,kind)
    for y in range(98,277,19):a+=tree(152,y,11,"cedar",y%4)
    a+=pavilion(128,184,8)+pavilion(128,218,7)
    # The three-bay stone arch stands in the east precinct, just north of the south hall.
    a+=line('M174 249h72',"#d1d1bd",5)+line('M177 245h66M190 240h39',"#7d877a",2)
    for x in [178,195,227,244]:a+=rect(x,243,3,12,"#b8bdab",stroke="#828c7c",stroke_width=.6)
    symbol('temple-plan',278,316,a,"west-water-court-central-cloister-east-ceremonial-garden")
    a=paving(3,7,78,27)+flat(7,10,12,20)+roof(7,10,12,20)+rect(65,12,10,17,"#e0dfd2",stroke="#8a9487",stroke_width=.7)
    a+=line('M20 20h44',"#858e82",1.1)+line('M22 18v4m4-4v4m4-4v4m4-4v4m4-4v4m4-4v4m4-4v4m4-4v4m4-4v4m4-4v4',"#a3ad9d",.65)
    symbol('gate-plan',84,40,a,"entry-piers-sliding-gate-and-paved-threshold")
    a=paving(3,3,76,34)+roof(9,13,64,14,"dark")+roof(27,9,28,22,"grey")
    a+="".join(rect(x,13,3,15,"#d1cdb8",stroke="#969d8b",stroke_width=.7) for x in [15,29,51,66])
    a+=steps(29,30,25,5,3)
    symbol('arch-plan',82,40,a,"tiered-traditional-gateway-roofs-and-stone-piers")


def sports():
    a=rect(1,1,58,78,"#b1cdb2",stroke="#acc2a1",stroke_width=.7)+rect(7,5,46,70,"#94c2cb")
    a+=rect(19,5,22,15,"#83b6c1")+rect(19,60,22,15,"#83b6c1")
    a+=path('M7 5h46v70H7ZM7 40h46M19 5v15h22V5M19 75V60h22v15M10 5v5a20 23 0 0 0 40 0V5M10 75v-5a20 23 0 0 1 40 0v5',stroke="#e5e2b0",stroke_width=.6)
    a+=circle(30,40,7,"none",stroke="#e5e2b0",stroke_width=.6)+path('M19 20a11 11 0 0 0 22 0M19 60a11 11 0 0 1 22 0',stroke="#e5e2b0",stroke_width=.6)
    a+=line('M26 8h8m-8 64h8',"#dce4d1",1)+circle(30,10,1.2,"none",stroke="#dce4d1",stroke_width=.5)+circle(30,70,1.2,"none",stroke="#dce4d1",stroke_width=.5)
    symbol('court-plan',60,80,a,"blue-playing-area-green-runoff-regulation-markings")
    a=rect(1,1,138,70,"#a5c8a7",stroke="#9cae8c",stroke_width=.6)
    a+=path('M9 6h122v60H9ZM70 6v60M9 23h20v26H9m122-26h-20v26h20M12 6a33 33 0 0 1 0 60m116-60a33 33 0 0 0 0 60',stroke="#dedfc6",stroke_width=.65)
    a+=circle(70,36,9,"none",stroke="#dedfc6",stroke_width=.65)+line('M13 31v10m114-10v10',"#dee6da",1.2)
    symbol('basketball-court',140,72,a,"separate-green-court")
    a=rect(2,2,128,221,"#bad4b4")+rect(2,2,128,221,"url(#atlas-flat-grain)")
    for y in [7,79,151]:
        for x in [7,68]:a+=use('art-court-plan',x,y,57,67,data_court="grouped")
    a+=line('M3 1v222h126V1',"#879a89",1.2)
    for y in range(4,220,15):a+=circle(3,y,1,"#d1d8c7")+circle(129,y,1,"#d1d8c7")
    a+=paving(2,227,128,9)+rect(2,240,128,50,"#b2cfae")+use('art-basketball-court',6,243,120,44,data_court="separate")
    a+=tree(6,236,12)+tree(123,231,13)+tree(128,272,9)
    symbol('courts-plan',132,292,a,"six-blue-courts-and-separate-southern-green-court")
    a=rect(2,2,306,563,"#e5e9d8",rx=149)+rect(8,7,294,554,"#cf9b80",rx=145)
    for i in range(6):a+=rect(14+i*5.5,13+i*5.5,282-i*11,542-i*11,"none",rx=139-i*5.5,stroke="#e9d6b9",stroke_width=.8)
    a+=rect(47,46,216,476,"#a6c59b",rx=107)+rect(47,46,216,476,"url(#atlas-lawn-grain)",rx=107)
    a+=path('M48 156Q48 47 155 47T262 156ZM48 411Q48 520 155 520T262 411Z',"#bad3d4")
    a+=path('M56 128Q57 91 96 86H214Q252 91 254 128V439Q252 477 214 480H96Q57 477 56 439Z',"#a8c59b")
    for i in range(11):a+=rect(58,116+i*31.8,194,15.9,"#bed3a9",opacity=.16)
    a+=path('M63 118h184v330H63ZM63 282h184M108 118v43h93v-43m-93 330v-43h93v43M131 118v19h47v-19m-47 330v-19h47v19',stroke="#e3e3cc",stroke_width=.95)
    a+=circle(155,282,29,"none",stroke="#e3e3cc",stroke_width=.95)+circle(155,282,1.6,"#e3e3cc")
    a+=path('M134 161a25 25 0 0 0 42 0m-42 244a25 25 0 0 1 42 0',stroke="#e3e3cc",stroke_width=.95)
    a+=rect(136,114,38,4,"none",stroke="#ede9d9",stroke_width=1)+rect(136,448,38,4,"none",stroke="#ede9d9",stroke_width=1)
    a+=path('M128 57h54v20h-54Z',"#e1d0ac")+path('M129 59h51v16h-51Z',"url(#atlas-lawn-grain)")
    for i in range(6):
        a+=line(f'M{14+i*5.5} 321v33',"#ead6bd",.6)+line(f'M9 {326+i*5}h36',"#ead6bd",.6)
    a+=line('M47 153h216M47 414h216',"#98b1b5",.7)
    symbol('track-plan',310,568,a,"six-lane-terracotta-track-striped-turf-blue-end-zones")


def surface(d, material, name):
    colors={'asphalt':'#dfe5df','granite':'#eeeee6','stone':'#e9e9dc','brick':'#e7e1cd','pebble':'#e7ebda','decking':'#d7ceba'}
    return group(path(d,colors[material],stroke='#cdd7ca',stroke_width=.65,stroke_linejoin='round')
                 +path(d,f'url(#atlas-{material})'),data_surface=material,id=name)


def grounds():
    a=rect(0,0,1000,1540,'#fff',id='atlas-white-background')
    # Roads are areas with independently drawn edges and junctions, not a reused centreline.
    streets=surface('M174 88 895 30 907 72 182 131ZM897 25h45v1484h-45Z','asphalt','atlas-city-streets')
    streets+=line('M202 109 865 54M920 103v1370','#fff',1.5,stroke_dasharray='12 10')
    streets+=line('M186 130 894 73M896 80v1416','#c5cfc3',.8)
    streets+=path('M143 154h43v113h-43Zm-8 131h51v65h-51Zm8 89h43v109h-43ZM131 512h55v87h-55Zm-18 108h73v79h-73Zm-12 102h85v70h-85ZM42 1007h29v128H42Zm0 150h29v105H42Zm0 133h29v114H42ZM971 128h27v154h-27Zm0 207h27v241h-27Z','#f3f5f0')
    a+=group(streets,id='atlas-context',aria_hidden='true')
    boundary='M200 132 850 78 879 397 883 870 880 1486 405 1505 88 1493 65 1032Q64 942 201 900L201 618 189 371Z'
    a+=path(boundary,'#f8f9f3',stroke='#d8dfd0',stroke_width=1)
    plots=surface('M204 136 347 124 346 583 208 591 199 371Z','asphalt','atlas-west-access')
    plots+=surface('M355 183 775 158 783 402 356 427Z','granite','atlas-teaching-courts')
    plots+=surface('M599 735 847 729 852 853 610 855Z','stone','atlas-museum-forecourt')
    plots+=surface('M408 1252 631 1242 851 1294 852 1490 411 1497Z','granite','atlas-south-courts')
    plots+=path('M88 987Q87 941 150 922H312Q387 927 392 1002L404 1480 89 1484Z','#edf1e2')
    a+=group(plots,id='atlas-ground-plots',aria_hidden='true')
    roads=surface('M338 122 365 119 365 402 360 523Q352 553 361 582L368 869Q372 913 397 955L415 1083 426 1471 404 1480 393 1084 378 963Q345 914 343 872L337 582Q334 557 343 521L344 402Z','asphalt','atlas-west-lane')
    roads+=surface('M547 87 577 85 577 397Q576 415 582 438L592 566 603 842 624 1124 645 1480 621 1483 601 1128 580 844 569 567 558 440Q552 414 551 398Z','stone','atlas-central-walk')
    roads+=surface('M759 114 785 111 791 391Q846 385 866 415L884 432 877 459 849 450Q840 419 779 421L766 401Z','granite','atlas-east-entry')
    roads+=surface('M838 467 883 465 884 1486 851 1488 849 1293 855 1149 845 853Z','granite','atlas-east-promenade')
    roads+=surface('M351 194 774 169 776 213 352 238Z','granite','atlas-north-promenade')
    roads+=surface('M370 205 758 182 759 197 370 220Z','decking','atlas-north-median')
    for x,y in [(383,203),(452,199),(521,195),(601,190),(672,186),(738,182)]:
        roads+=rect(x,y,3,4,'#a2afa2',rx=.5)
    roads+=surface('M349 398 775 375 778 410 354 435Z','stone','atlas-gateway-court')
    roads+=surface('M350 565 825 549 827 584 354 603Z','brick','atlas-garden-crossing')
    roads+=surface('M354 724 823 714 825 738 357 748Z','stone','atlas-museum-north-walk')
    roads+=surface('M358 850 612 838 616 864 369 877Z','stone','atlas-library-north-walk')
    roads+=surface('M392 965 612 958 615 978 395 985Z','granite','atlas-library-south-walk')
    roads+=surface('M408 1078 623 1074 626 1097 411 1104Z','granite','atlas-hall-south-walk')
    roads+=surface('M418 1234 633 1227 638 1251 423 1258Z','brick','atlas-gym-south-walk')
    roads+=surface('M626 1193 852 1191 853 1213 628 1217Z','stone','atlas-pond-north-walk')
    roads+=surface('M641 1302 850 1300 853 1326 641 1327Z','stone','atlas-dining-north-walk')
    roads+=surface('M408 1472 854 1472 855 1492 409 1496Z','brick','atlas-south-boundary-walk')
    # Granite bands, tree pits and pavement drains remain distinct from the narrow garden paths.
    roads+=line('M843 479 852 846 862 1149 858 1474','#b4c3b5',1.1)
    for y in range(480,1460,55):roads+=line(f'M856 {y}h22','#d0d8cc',.8)
    for y in [520,750,980,1210,1430]:
        roads+=rect(873,y,5,9,'#bdcbbd',rx=.5)+line(f'M874 {y+2}h3m-3 2h3m-3 2h3','#eaf0e4',.5)
    a+=group(roads,id='atlas-paths',aria_hidden='true')
    # Reference 7: shaded strip behind the lawns, with broadleaf crowns and a few autumn trees.
    patch=path('M373 444Q399 438 428 441L532 438Q545 444 547 459L545 499Q526 508 501 504L389 509Q371 506 370 491Z','#e3e9d2')
    patch+=planting([(382,459,16,'green'),(409,455,19,'green'),(442,453,18,'rust'),(477,452,18,'rust'),(515,453,19,'rust'),(532,479,18,'gold'),(503,488,18,'green'),(470,488,20,'green'),(433,489,20,'green'),(395,490,20,'green')])
    a+=group(patch,id='atlas-unnamed-plot',aria_hidden='true')
    # Explicit north-of-Zunjing plantings: large outer crowns, conifers inside, clear southern apron.
    wood=path('M612 591Q633 585 657 588L794 584Q814 588 819 606L823 690Q822 710 808 718L631 723Q611 715 609 697Z','#e4ebd4')
    wood+=surface('M614 704Q644 702 665 687L695 667 701 671 668 693Q642 710 614 711Z','pebble','atlas-woodland-path')
    wood+=paving(691,649,31,27,True)
    wood+=planting([(630,607,25,'green'),(663,602,29,'green'),(703,611,27,'green'),(739,599,26,'green'),(778,609,29,'green'),(803,629,22,'gold'),
                    (623,640,23,'gold'),(652,636,29,'green'),(686,641,26,'cedar'),(725,633,23,'cedar'),(754,641,30,'cedar'),(786,652,29,'green'),
                    (630,676,27,'green'),(660,668,25,'green'),(680,684,20,'green'),(737,680,27,'cedar'),(772,684,28,'green'),(804,686,22,'green'),
                    (644,706,23,'gold'),(674,706,24,'green'),(710,704,22,'green'),(749,712,23,'green'),(785,709,24,'gold')])
    wood+=roof(695,653,22,17,'dark')
    a+=group(wood,id='atlas-woodland',aria_hidden='true')
    bamboo=path('M836 1211h17v276H643v-12h193Z','#e6ecd6')
    for y in range(1220,1480,11):bamboo+=tree(845,y,10,'bamboo',y%4)
    for x in range(652,849,12):bamboo+=tree(x,1480,10,'bamboo',x%4)
    a+=group(bamboo,id='atlas-bamboo',aria_hidden='true')
    trees=''
    for i,(x,y) in enumerate([(367,114),(398,110),(430,107),(461,104),(492,101),(524,97),(605,91),(638,88),(671,86),(704,83),(737,81)]):trees+=tree(x,y,19+(i%3),'green',i)
    trees+=tree(416,206,21)+tree(555,244,23)+tree(555,281,22)+tree(558,320,22)+tree(561,355,20)
    # The avenue has overlapping mature crowns; the sports edge has smaller, spaced trees.
    for i,y in enumerate(range(852,1480,27)):trees+=tree(605+(y-855)*.04,y,17+i%3,'gold',i)
    for i,y in enumerate(range(916,1478,38)):trees+=tree(395+(y-903)*.025,y,10+i%2,'green',i)
    for i,y in enumerate(range(603,886,35)):trees+=tree(207,y,12+i%3,'green',i)
    for i,y in enumerate(range(486,1478,43)):
        trees+=paving(864,y-9,16,17)+rect(866,y-7,12,13,'#dce5ce',rx=2)+tree(872,y,12+i%2,'green',i)
    trees+=planting([(377,520,13,'green'),(550,519,14,'gold'),(833,495,12,'green'),(609,753,13,'green'),(609,813,15,'green'),(370,875,11,'green'),(385,1468,12,'green'),(136,1478,11,'green'),(371,1449,13,'green')])
    a+=group(paving(105,840,89,61)+roof(110,846,80,43,'silver'),id='atlas-west-annex',aria_hidden='true')
    a+='<g id="atlas-places"><g id="atlas-landscape-places"/>'+group(trees,id='atlas-trees',aria_hidden='true')+'<g id="atlas-buildings"/></g>'
    a+='<g id="atlas-context-labels" aria-hidden="true"><g class="atlas-surroundings"><text x="600" y="64" transform="rotate(-5 600 64)">书 院 巷</text><text x="928" y="661" transform="rotate(90 928 661)">人 民 路</text></g><text class="atlas-small-label" x="149" y="878" text-anchor="middle">梦工厂</text><text class="atlas-ground-label" x="850" y="1460" transform="rotate(-90 850 1460)">竹林</text></g>'
    return a+'<g id="atlas-labels"/>'


def main():
    definitions()
    teaching_buildings()
    southern_buildings()
    gardens()
    heritage()
    sports()
    scene=grounds()
    svg=('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1540" class="campus-art" data-map-version="3">\n'
         '<title>苏州中学校园地图</title>\n'
         '<desc>依据维护者提供的航拍影像重绘的北向上校园导览。建筑屋面、庭院和水岸按可见形态绘制；树冠和材质细节为矢量表达。保留原有地点坐标，非正射测绘图。</desc>\n'
         '<!-- Generated by tools/build-campus-art.py. Editable vector geometry; no embedded photographs. -->\n'
         '<defs>\n'+"\n".join(DEFS)+'\n</defs>\n'+scene+'\n</svg>\n')
    # One SVG element per line keeps the generated geometry inspectable in diffs.
    svg=svg.replace('><','>\n<')
    # Paint servers are self-contained even when the SVG is opened outside the application.
    svg=re.sub(r'<path (?![^>]*\bfill=)', '<path fill="none" ', svg)
    OUTPUT.write_text(svg)
    print(f'Wrote {OUTPUT.relative_to(ROOT)} ({len(svg.encode()):,} bytes)')


if __name__ == '__main__':
    main()
