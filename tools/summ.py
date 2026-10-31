import json,sys
for fn in sys.argv[1:]:
  for line in open(fn):
    try: r=json.loads(line)
    except: print(line[:300]); continue
    rh=r['rhythm']; m=r['master']; le=r['lowEnd']
    print(f"{r['gid']:15} {r['bpm']} {r['key']:12} K{rh['kick']['vsContract']:.2f} S{rh['snare'].get('vsContract',0):.2f} H{rh['hats']['vsScore']:.2f} | harm {r['harmony']['chordMatch']} chg {r['harmony']['changesPerBar']}/{r['harmony']['expectedChangesPerBar']} | bass {r['bass']['pitchClassOk']} n{r['bass'].get('beats')} {r['bass']['errors'][:2]} | k@b {le['kickAtBassOnsetDb_p90']} ov {le['lowOverlap']} mono {le['monoCorr120']} | LUFS {m['lufs']}/{m['target']} PLR {m['plr']} slope {m['slopeDbOct']} S/M {m.get('sideMidDb')} clk mix {r['mixClicks']} {r['stemClicks']}")
    print('   centroid', r.get('centroid'))
