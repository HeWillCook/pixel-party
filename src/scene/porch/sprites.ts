import { P } from '../palette'
import { defineSprite } from '../sprite'

const colours = { d: P.wood[0], s: P.wood[1], w: P.wood[2], l: P.wood[3], h: P.wood[4], p: P.paper[4], m: P.stone[0], f: P.foliage[1], g: P.foliage[3], y: P.sun[4], r: P.flame[1], c: P.fur[2], a: P.sky[2], b: P.sky[3], q: P.paper[2], n: P.fur[1], t: P.fur[3] }

export const sprites = {
  lighthouse: defineSprite([
    '......aaa', '.....abbaa', '....aayyaa', '....aaqyqa', '....aaqyqa', '...aaaaaaaa', '...aqqqqqqa', '....abbbba', '....abbbba', '....aqqqqa', '....aqqqqa', '...aaqqqqaa', '...abbbbbb a'.replace(' ', ''), '...abbbbbba', '...aqqqqqqa', '...aqqqqqqa', '..aaqqqqqqaa', '..abbbbbbbba', '..abbbbbbbba', '..aqqqqqqqqa', '..aqqqqqqqqa', '.aaaaaaaaaaaa',
  ].map(row => row.padEnd(14, '.')), colours),
  mailbox: defineSprite([
    '....pp........', '...dppd.......', '..dhhhhd...rrr', '.dhhhhhhd..r..', '.ddddddddddr..', '.dwwwwwwwwdr..', '.dwwddddwwdr..', '.dwwwwwwwwdr..', '.dwwwwwwwwdr..', '.dwwwwwwwwdd..', '.dwwwwwwwhd...', '..dddddddd....',
  ], colours),
  radio: defineSprite([
    '....d....d......', '.....d..d.......', '..dddddddddddd..', '.dwwwwwwwwwwwwd.', '.dmmmdhhhdmmmd..', '.dmhmdhphdmhmd..', '.dmmmdhhhdmmmd..', '.dwwwwwwwwwwwwd.', '..dddddddddddd..',
  ], colours),
  cat: defineSprite([
    '...nn...nn...................', '..nccn.nccn..................', '..ncccncccn......nnnnnn......', '.ncccccccccn...nnccccccnn....', '.nccccccccccnnnccccccccccn...', '.nccccccccccccccctttttcccn...', '..ncccccccccccctttttttcccn...', '..ncccccttttttttttttttccn....', '...ncccttttttttttttttccn.....', '....nncccttttttttttttnn......', '......nnccccccccccccn........', '........nnnnnnnnnnnn.........',
  ].map(row => row.padEnd(29, '.')), colours),
  plant: defineSprite([
    '....g...g....', '..ggfg.gfg...', '...gffgff....', '.gggffffgg...', '..ggffffg....', '....dffd.....', '..ddddddddd..', '...dwwwwwd...', '...dwwhwwd...', '....ddddd....',
  ], colours),
  lantern: defineSprite([
    '....dd....', '...d..d...', '...dddd...', '..dmyymd..', '..dmyymd..', '..dmppmd..', '..dmyymd..', '..dddddd..', '...dddd...',
  ], colours),
}
