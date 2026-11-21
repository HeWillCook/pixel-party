export interface DailyPrompt { prompt: string; subject: string }

const DAY_MS = 86_400_000

/**
 * Prompts that ran before `PROMPT_ROTATION_START`.
 *
 * This list and its order are FROZEN. The legacy rotation below is a fixed
 * shuffle of exactly these 84 entries, and `promptForDay` keeps using it for
 * every day up to and including 2026-11-22 so mid-attempt drawings and past
 * history keep the prompt they started with. Append new prompts to
 * `ADDED_PROMPTS`, never here.
 */
const LEGACY_PROMPTS: readonly DailyPrompt[] = [
  { prompt: 'a lighthouse in a storm', subject: 'lighthouse' },
  { prompt: 'a cat sleeping in a teacup', subject: 'cat' },
  { prompt: 'a fox under a mushroom', subject: 'fox' },
  { prompt: 'a whale beneath a sailboat', subject: 'whale' },
  { prompt: 'a robot watering a flower', subject: 'robot' },
  { prompt: 'a turtle carrying a garden', subject: 'turtle' },
  { prompt: 'a penguin wearing a scarf', subject: 'penguin' },
  { prompt: 'a moon above snowy mountains', subject: 'moon' },
  { prompt: 'a frog sitting on a lily pad', subject: 'frog' },
  { prompt: 'a snail with a striped shell', subject: 'snail' },
  { prompt: 'a bee beside a sunflower', subject: 'bee' },
  { prompt: 'a castle on a cloud', subject: 'castle' },
  { prompt: 'a rocket passing a ringed planet', subject: 'rocket' },
  { prompt: 'a cactus in a spotted pot', subject: 'cactus' },
  { prompt: 'a duck in a rain puddle', subject: 'duck' },
  { prompt: 'a barn beneath a rainbow', subject: 'barn' },
  { prompt: 'a rabbit peeking from a hat', subject: 'rabbit' },
  { prompt: 'a fish swimming past coral', subject: 'fish' },
  { prompt: 'a lantern hanging from a branch', subject: 'lantern' },
  { prompt: 'a squirrel holding an acorn', subject: 'squirrel' },
  { prompt: 'a bicycle beside a tree', subject: 'bicycle' },
  { prompt: 'an owl on a snowy branch', subject: 'owl' },
  { prompt: 'a ship inside a bottle', subject: 'ship' },
  { prompt: 'a dragon flying over a hill', subject: 'dragon' },
  { prompt: 'a hedgehog carrying an apple', subject: 'hedgehog' },
  { prompt: 'a tent beneath the stars', subject: 'tent' },
  { prompt: 'a koala hugging a tree', subject: 'koala' },
  { prompt: 'a cupcake with a cherry', subject: 'cupcake' },
  { prompt: 'a crab beside a sandcastle', subject: 'crab' },
  { prompt: 'a train crossing a bridge', subject: 'train' },
  { prompt: 'a bat hanging from a cave', subject: 'bat' },
  { prompt: 'a jellyfish among bubbles', subject: 'jellyfish' },
  { prompt: 'a windmill in a field of flowers', subject: 'windmill' },
  { prompt: 'a panda eating bamboo', subject: 'panda' },
  { prompt: 'a crown on a cushion', subject: 'crown' },
  { prompt: 'a bear holding a honey pot', subject: 'bear' },
  { prompt: 'a volcano on an island', subject: 'volcano' },
  { prompt: 'a kite above a hill', subject: 'kite' },
  { prompt: 'a mouse beside a wedge of cheese', subject: 'mouse' },
  { prompt: 'a sailboat at sunset', subject: 'sailboat' },
  { prompt: 'a butterfly on a leaf', subject: 'butterfly' },
  { prompt: 'a pizza with three mushrooms', subject: 'pizza' },
  { prompt: 'a ghost holding a balloon', subject: 'ghost' },
  { prompt: 'a teapot pouring into a cup', subject: 'teapot' },
  { prompt: 'a flamingo standing in water', subject: 'flamingo' },
  { prompt: 'a house with a red door', subject: 'house' },
  { prompt: 'a horse jumping over a fence', subject: 'horse' },
  { prompt: 'a star reflected in a pond', subject: 'star' },
  { prompt: 'a ladybug on a daisy', subject: 'ladybug' },
  { prompt: 'a snowman with a carrot nose', subject: 'snowman' },
  { prompt: 'an octopus holding a shell', subject: 'octopus' },
  { prompt: 'a clock above a fireplace', subject: 'clock' },
  { prompt: 'a parrot on a pirate hat', subject: 'parrot' },
  { prompt: 'a balloon tied to a gift', subject: 'balloon' },
  { prompt: 'a goat on a rocky hill', subject: 'goat' },
  { prompt: 'a pumpkin with a green bow', subject: 'pumpkin' },
  { prompt: 'a cloud raining on a flower', subject: 'cloud' },
  { prompt: 'a dog chasing a ball', subject: 'dog' },
  { prompt: 'a candle beside an open book', subject: 'candle' },
  { prompt: 'a dolphin leaping over a wave', subject: 'dolphin' },
  { prompt: 'a tree with a birdhouse', subject: 'tree' },
  { prompt: 'a crown resting on a pumpkin', subject: 'crown' },
  { prompt: 'a rooster on a fence', subject: 'rooster' },
  { prompt: 'a submarine near a treasure chest', subject: 'submarine' },
  { prompt: 'a raccoon inside a box', subject: 'raccoon' },
  { prompt: 'a mitten covered in snowflakes', subject: 'mitten' },
  { prompt: 'a giraffe reaching for leaves', subject: 'giraffe' },
  { prompt: 'a bridge over a river', subject: 'bridge' },
  { prompt: 'a seal balancing a ball', subject: 'seal' },
  { prompt: 'an umbrella in the rain', subject: 'umbrella' },
  { prompt: 'a sheep beside a haystack', subject: 'sheep' },
  { prompt: 'a key beside a locked chest', subject: 'key' },
  { prompt: 'a peacock displaying its tail', subject: 'peacock' },
  { prompt: 'a boot filled with flowers', subject: 'boot' },
  { prompt: 'a caterpillar on an apple', subject: 'caterpillar' },
  { prompt: 'a cabin in a snowy forest', subject: 'cabin' },
  { prompt: 'a seahorse beside seaweed', subject: 'seahorse' },
  { prompt: 'a toaster popping up toast', subject: 'toaster' },
  { prompt: 'a kangaroo carrying a joey', subject: 'kangaroo' },
  { prompt: 'a pineapple wearing sunglasses', subject: 'pineapple' },
  { prompt: 'a pot of gold under a rainbow', subject: 'pot' },
  { prompt: 'a turkey wearing a bow tie', subject: 'turkey' },
  { prompt: 'a bucket and shovel on a beach', subject: 'bucket' },
  { prompt: 'a zebra beside a watering hole', subject: 'zebra' },
]

/**
 * Prompts that join the rotation on 2026-11-23. Every subject here is a single
 * concrete noun, readable at 32x32, and distinct from every subject above.
 */
const ADDED_PROMPTS: readonly DailyPrompt[] = [
  // animals
  { prompt: 'a lion with a fluffy mane', subject: 'lion' },
  { prompt: 'a tiger resting by a stream', subject: 'tiger' },
  { prompt: 'an elephant spraying water', subject: 'elephant' },
  { prompt: 'a monkey swinging on a vine', subject: 'monkey' },
  { prompt: 'a hippo in a muddy river', subject: 'hippo' },
  { prompt: 'a rhino beside a small tree', subject: 'rhino' },
  { prompt: 'a camel with two humps', subject: 'camel' },
  { prompt: 'a lizard on a warm rock', subject: 'lizard' },
  { prompt: 'a snake curled on a branch', subject: 'snake' },
  { prompt: 'a spider weaving a web', subject: 'spider' },
  { prompt: 'an ant carrying a crumb', subject: 'ant' },
  { prompt: 'a moth circling a lamp', subject: 'moth' },
  { prompt: 'a beetle with spotted wings', subject: 'beetle' },
  { prompt: 'a worm peeking from soil', subject: 'worm' },
  { prompt: 'a shark showing its fin', subject: 'shark' },
  { prompt: 'a walrus on an ice floe', subject: 'walrus' },
  { prompt: 'an otter floating on its back', subject: 'otter' },
  { prompt: 'a beaver building a dam', subject: 'beaver' },
  { prompt: 'a badger near a burrow', subject: 'badger' },
  { prompt: 'a mole poking from a hill', subject: 'mole' },
  { prompt: 'a hamster in a cage', subject: 'hamster' },
  { prompt: 'a ferret wearing a scarf', subject: 'ferret' },
  { prompt: 'a skunk with a striped tail', subject: 'skunk' },
  { prompt: 'a deer in a misty clearing', subject: 'deer' },
  { prompt: 'a moose beside a lake', subject: 'moose' },
  { prompt: 'a bison on a grassy plain', subject: 'bison' },
  { prompt: 'a llama wearing a hat', subject: 'llama' },
  { prompt: 'a donkey carrying a basket', subject: 'donkey' },
  { prompt: 'a pig rolling in mud', subject: 'pig' },
  { prompt: 'a cow wearing a bell', subject: 'cow' },
  { prompt: 'a hen sitting on a nest', subject: 'hen' },
  { prompt: 'a chick hatching from an egg', subject: 'chick' },
  { prompt: 'a goose honking at a cloud', subject: 'goose' },
  { prompt: 'a swan gliding on a pond', subject: 'swan' },
  { prompt: 'a heron standing in reeds', subject: 'heron' },
  { prompt: 'a pelican with a full beak', subject: 'pelican' },
  { prompt: 'a seagull above a pier', subject: 'seagull' },
  { prompt: 'an eagle landing on a crag', subject: 'eagle' },
  { prompt: 'a crow on a fence post', subject: 'crow' },
  { prompt: 'a robin on a snowy twig', subject: 'robin' },
  { prompt: 'a pigeon pecking at crumbs', subject: 'pigeon' },
  { prompt: 'an ostrich with its head down', subject: 'ostrich' },
  { prompt: 'a crocodile with open jaws', subject: 'crocodile' },
  { prompt: 'a gecko on a glass jar', subject: 'gecko' },
  { prompt: 'a chameleon on a branch', subject: 'chameleon' },
  { prompt: 'a tortoise crossing a road', subject: 'tortoise' },
  { prompt: 'a salmon leaping up a falls', subject: 'salmon' },
  { prompt: 'a puffin holding a fish', subject: 'puffin' },
  { prompt: 'a porcupine near a cactus', subject: 'porcupine' },
  { prompt: 'a sloth hanging upside down', subject: 'sloth' },
  // food
  { prompt: 'a burger with tall layers', subject: 'burger' },
  { prompt: 'a sandwich cut in half', subject: 'sandwich' },
  { prompt: 'a taco with spilled filling', subject: 'taco' },
  { prompt: 'a burrito wrapped in foil', subject: 'burrito' },
  { prompt: 'a pretzel with salt dots', subject: 'pretzel' },
  { prompt: 'a bagel beside cream cheese', subject: 'bagel' },
  { prompt: 'a donut with sprinkles', subject: 'donut' },
  { prompt: 'a waffle with syrup', subject: 'waffle' },
  { prompt: 'a pancake stack with berries', subject: 'pancake' },
  { prompt: 'a croissant on a plate', subject: 'croissant' },
  { prompt: 'a loaf of bread', subject: 'bread' },
  { prompt: 'a cheese wedge with holes', subject: 'cheese' },
  { prompt: 'an egg in an egg cup', subject: 'egg' },
  { prompt: 'bacon strips on a plate', subject: 'bacon' },
  { prompt: 'a sausage on a fork', subject: 'sausage' },
  { prompt: 'a steak with a bone', subject: 'steak' },
  { prompt: 'a bowl of soup steaming', subject: 'soup' },
  { prompt: 'a salad in a wooden bowl', subject: 'salad' },
  { prompt: 'a carrot with leafy top', subject: 'carrot' },
  { prompt: 'a broccoli crown', subject: 'broccoli' },
  { prompt: 'an ear of corn husked', subject: 'corn' },
  { prompt: 'a potato with a sprout', subject: 'potato' },
  { prompt: 'a tomato on a vine', subject: 'tomato' },
  { prompt: 'an onion with layers', subject: 'onion' },
  { prompt: 'a garlic bulb', subject: 'garlic' },
  { prompt: 'a bell pepper sliced', subject: 'pepper' },
  { prompt: 'a bunch of purple grapes', subject: 'grape' },
  { prompt: 'a banana peeled halfway', subject: 'banana' },
  { prompt: 'an orange with a leaf', subject: 'orange' },
  { prompt: 'a lemon cut in half', subject: 'lemon' },
  { prompt: 'a peach with one leaf', subject: 'peach' },
  { prompt: 'a pair of cherries', subject: 'cherry' },
  { prompt: 'a watermelon slice with seeds', subject: 'watermelon' },
  { prompt: 'a strawberry with a leaf', subject: 'strawberry' },
  // objects
  { prompt: 'a chair with a cushion', subject: 'chair' },
  { prompt: 'a table with a vase', subject: 'table' },
  { prompt: 'a bed with a quilt', subject: 'bed' },
  { prompt: 'a sofa with two pillows', subject: 'sofa' },
  { prompt: 'a lamp with a fringed shade', subject: 'lamp' },
  { prompt: 'a mirror in a frame', subject: 'mirror' },
  { prompt: 'a rug with a pattern', subject: 'rug' },
  { prompt: 'a shelf with three books', subject: 'shelf' },
  { prompt: 'an open drawer with socks', subject: 'drawer' },
  { prompt: 'a basket full of apples', subject: 'basket' },
  { prompt: 'a broom leaning on a wall', subject: 'broom' },
  { prompt: 'a sponge with bubbles', subject: 'sponge' },
  { prompt: 'a bar of soap with bubbles', subject: 'soap' },
  { prompt: 'a towel on a hook', subject: 'towel' },
  { prompt: 'a paintbrush and a pot', subject: 'brush' },
  { prompt: 'a comb with a mirror', subject: 'comb' },
  { prompt: 'scissors cutting paper', subject: 'scissors' },
  { prompt: 'a big button with four holes', subject: 'button' },
  { prompt: 'a wallet with coins', subject: 'wallet' },
  { prompt: 'a suitcase with stickers', subject: 'suitcase' },
  { prompt: 'a compass with a needle', subject: 'compass' },
  { prompt: 'a map with a dotted path', subject: 'map' },
  { prompt: 'a globe on a stand', subject: 'globe' },
  { prompt: 'a telescope aimed at a star', subject: 'telescope' },
  { prompt: 'a magnet pulling paper clips', subject: 'magnet' },
  { prompt: 'a battery with a lightning mark', subject: 'battery' },
  { prompt: 'a lightbulb glowing', subject: 'lightbulb' },
  { prompt: 'a fan with spinning blades', subject: 'fan' },
  { prompt: 'a kettle with a whistle', subject: 'kettle' },
  { prompt: 'a blender full of fruit', subject: 'blender' },
  { prompt: 'an oven with a pie inside', subject: 'oven' },
  { prompt: 'a fridge covered in magnets', subject: 'fridge' },
  // vehicles
  { prompt: 'a truck carrying logs', subject: 'truck' },
  { prompt: 'a bus at a bus stop', subject: 'bus' },
  { prompt: 'a tractor pulling a plow', subject: 'tractor' },
  { prompt: 'an ambulance with lights on', subject: 'ambulance' },
  { prompt: 'a taxi with a checker stripe', subject: 'taxi' },
  { prompt: 'a motorcycle with a sidecar', subject: 'motorcycle' },
  { prompt: 'a wagon with wooden wheels', subject: 'wagon' },
  { prompt: 'a canoe on a calm lake', subject: 'canoe' },
  { prompt: 'a kayak by a waterfall', subject: 'kayak' },
  { prompt: 'a raft made of logs', subject: 'raft' },
  { prompt: 'a ferry crossing the bay', subject: 'ferry' },
  { prompt: 'a yacht with white sails', subject: 'yacht' },
  { prompt: 'a helicopter over a hill', subject: 'helicopter' },
  { prompt: 'an airplane above the clouds', subject: 'airplane' },
  { prompt: 'a blimp above a stadium', subject: 'blimp' },
  { prompt: 'a parachute with a crate', subject: 'parachute' },
  { prompt: 'a bulldozer moving dirt', subject: 'bulldozer' },
  { prompt: 'an excavator digging a hole', subject: 'excavator' },
  // places
  { prompt: 'a mountain with a snowy peak', subject: 'mountain' },
  { prompt: 'a canyon with a river', subject: 'canyon' },
  { prompt: 'a desert with one cactus', subject: 'desert' },
  { prompt: 'a jungle with hanging vines', subject: 'jungle' },
  { prompt: 'a swamp with lily pads', subject: 'swamp' },
  { prompt: 'a meadow full of daisies', subject: 'meadow' },
  { prompt: 'an orchard of apple trees', subject: 'orchard' },
  { prompt: 'a farm with a red barn', subject: 'farm' },
  { prompt: 'a stone well with a bucket', subject: 'well' },
  { prompt: 'a fountain splashing water', subject: 'fountain' },
  { prompt: 'a statue on a pedestal', subject: 'statue' },
  { prompt: 'a pyramid in the sand', subject: 'pyramid' },
  { prompt: 'a temple on a hill', subject: 'temple' },
  { prompt: 'a market stall with fruit', subject: 'market' },
  { prompt: 'a bakery with a cupcake sign', subject: 'bakery' },
  { prompt: 'a library with tall shelves', subject: 'library' },
  { prompt: 'a school with a bell tower', subject: 'school' },
  { prompt: 'a hotel with many windows', subject: 'hotel' },
  { prompt: 'a theater with red curtains', subject: 'theater' },
  { prompt: 'a stadium full of lights', subject: 'stadium' },
  { prompt: 'a playground with a slide', subject: 'playground' },
  { prompt: 'a harbor full of boats', subject: 'harbor' },
  { prompt: 'a pier over calm water', subject: 'pier' },
  { prompt: 'an island with one palm', subject: 'island' },
  { prompt: 'a cave with glowing crystals', subject: 'cave' },
  { prompt: 'a cliff above the sea', subject: 'cliff' },
  // weather and space
  { prompt: 'rain falling on a roof', subject: 'rain' },
  { prompt: 'snow drifting past a window', subject: 'snow' },
  { prompt: 'a storm with one lightning bolt', subject: 'storm' },
  { prompt: 'lightning splitting a cloud', subject: 'lightning' },
  { prompt: 'a tornado crossing a field', subject: 'tornado' },
  { prompt: 'a rainbow over a hill', subject: 'rainbow' },
  { prompt: 'fog around a street lamp', subject: 'fog' },
  { prompt: 'icicles under a roof', subject: 'icicle' },
  { prompt: 'a puddle with a paper boat', subject: 'puddle' },
  { prompt: 'a river winding through hills', subject: 'river' },
  { prompt: 'a lake with a small dock', subject: 'lake' },
  { prompt: 'a pond with three lily pads', subject: 'pond' },
  { prompt: 'an ocean with a whale tail', subject: 'ocean' },
  { prompt: 'a comet with a long tail', subject: 'comet' },
  // fantasy
  { prompt: 'a unicorn under a rainbow', subject: 'unicorn' },
  { prompt: 'a mermaid on a rock', subject: 'mermaid' },
  { prompt: 'a wizard with a tall hat', subject: 'wizard' },
  { prompt: 'a witch stirring a cauldron', subject: 'witch' },
  { prompt: 'a fairy on a mushroom', subject: 'fairy' },
  { prompt: 'a gnome with a red hat', subject: 'gnome' },
  { prompt: 'a troll under a bridge', subject: 'troll' },
  { prompt: 'a knight with a shield', subject: 'knight' },
  { prompt: 'a pirate with a parrot', subject: 'pirate' },
  { prompt: 'a viking on a longship', subject: 'viking' },
  { prompt: 'a pharaoh with a staff', subject: 'pharaoh' },
  { prompt: 'a mummy wrapped in bandages', subject: 'mummy' },
  { prompt: 'a genie out of a lamp', subject: 'genie' },
  { prompt: 'an elf wrapping a gift', subject: 'elf' },
  { prompt: 'a pegasus over a cloud', subject: 'pegasus' },
  { prompt: 'a phoenix rising from flames', subject: 'phoenix' },
  { prompt: 'a sphinx in the desert', subject: 'sphinx' },
  { prompt: 'a scarecrow in a cornfield', subject: 'scarecrow' },
  // sports and games
  { prompt: 'a skateboard mid kickflip', subject: 'skateboard' },
  { prompt: 'a snowboard on a slope', subject: 'snowboard' },
  { prompt: 'a surfboard in a wave', subject: 'surfboard' },
  { prompt: 'a basketball through a hoop', subject: 'basketball' },
  { prompt: 'a baseball and a bat', subject: 'baseball' },
  { prompt: 'a trophy with a star', subject: 'trophy' },
  { prompt: 'a medal on a ribbon', subject: 'medal' },
  { prompt: 'a helmet with a crack', subject: 'helmet' },
  { prompt: 'a trampoline with a jumper', subject: 'trampoline' },
  { prompt: 'a hammock between palms', subject: 'hammock' },
  // music
  { prompt: 'a piano with open lid', subject: 'piano' },
  { prompt: 'a drum with two sticks', subject: 'drum' },
  { prompt: 'a violin with a bow', subject: 'violin' },
  { prompt: 'a trumpet with a mute', subject: 'trumpet' },
  { prompt: 'a saxophone with a shine', subject: 'saxophone' },
  { prompt: 'a harp with a ribbon', subject: 'harp' },
  // celebrations
  { prompt: 'a gift with a big bow', subject: 'gift' },
  { prompt: 'a wreath on a door', subject: 'wreath' },
  { prompt: 'a stocking with a candy cane', subject: 'stocking' },
  { prompt: 'a reindeer with a red nose', subject: 'reindeer' },
]

export const DAILY_PROMPTS: readonly DailyPrompt[] = [...LEGACY_PROMPTS, ...ADDED_PROMPTS]

/** First day the expanded rotation runs. Days before it keep the legacy order. */
export const PROMPT_ROTATION_START = '2026-11-23'

const LEGACY_SEED = 0x12345678
const ROTATION_SEED = 0x5eed1234

function dayNumber(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS)
}

function wrap(index: number, length: number): number {
  return ((index % length) + length) % length
}

function seededShuffle(items: readonly DailyPrompt[], seed: number): DailyPrompt[] {
  const shuffled = [...items]
  let state = seed
  for (let index = shuffled.length - 1; index > 0; index--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const swap = state % (index + 1)
    ;[shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]]
  }
  return shuffled
}

/** Frozen historical mapping: a fixed shuffle of the 84 original prompts. */
const legacyOrder = seededShuffle(LEGACY_PROMPTS, LEGACY_SEED)

/** Full-list rotation used from `PROMPT_ROTATION_START` onward. */
const rotationOrder = seededShuffle(DAILY_PROMPTS, ROTATION_SEED)

const lastLegacyPrompt = legacyOrder[wrap(dayNumber('2026-11-22'), legacyOrder.length)]

// Start the new cycle on a different prompt than the one players saw the day
// before, so nothing repeats back-to-back across the cutoff.
const ROTATION_OFFSET = Math.max(
  0,
  rotationOrder.findIndex((entry) => entry.prompt !== lastLegacyPrompt.prompt),
)

const rotationStartDays = dayNumber(PROMPT_ROTATION_START)

export function promptForDay(day: string): DailyPrompt {
  const days = dayNumber(day)
  if (days < rotationStartDays) {
    return legacyOrder[wrap(days, legacyOrder.length)]
  }
  return rotationOrder[wrap(days - rotationStartDays + ROTATION_OFFSET, rotationOrder.length)]
}
