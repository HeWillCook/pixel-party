import { P } from '../palette'
import { defineSprite } from '../sprite'

const colours = { d: P.wood[0], s: P.wood[1], w: P.wood[2], l: P.wood[3], h: P.wood[4], p: P.paper[4], m: P.stone[0], f: P.foliage[1], g: P.foliage[3], y: P.sun[4], r: P.flame[1], c: P.fur[2] }

export const sprites = {
  lighthouse: defineSprite([
    '.....dd.....', '....dyyd....', '....dppd....', '...ddwwdd...', '...dppppd...', '...dppppd...', '..ddppppdd..', '..dppwwppd..', '..dppwwppd..', '..dppppppd..', '.ddppppppdd.', '.dddddddddd.',
  ], colours),
  mailbox: defineSprite([
    '......rrrr...', '......r..r...', '..ddddr..r...', '.dwwwwdd.....', 'dwwwwwwd.....', 'dwwhhwwd.....', 'dwwwwwwd.....', 'dddddddd.....', '...dd........', '...dd........', '...dd........', '..dddd.......',
  ], colours),
  radio: defineSprite([
    '....d....d......', '.....d..d.......', '..dddddddddddd..', '.dwwwwwwwwwwwwd.', '.dmmmdhhhdmmmd..', '.dmhmdhphdmhmd..', '.dmmmdhhhdmmmd..', '.dwwwwwwwwwwwwd.', '..dddddddddddd..',
  ], colours),
  cat: defineSprite([
    '.....dd..........', '...ddccdd....dd..', '..dccccccddddcd..', '.dcccccchccccccd.', '.dccchcccccccccdd', '..dcccccccccccd..', '...ddddddddddd...',
  ], colours),
  plant: defineSprite([
    '....g...g....', '..ggfg.gfg...', '...gffgff....', '.gggffffgg...', '..ggffffg....', '....dffd.....', '..ddddddddd..', '...dwwwwwd...', '...dwwhwwd...', '....ddddd....',
  ], colours),
  lantern: defineSprite([
    '....dd....', '...d..d...', '...dddd...', '..dmyymd..', '..dmyymd..', '..dmppmd..', '..dmyymd..', '..dddddd..', '...dddd...',
  ], colours),
}
