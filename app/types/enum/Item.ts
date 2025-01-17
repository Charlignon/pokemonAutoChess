import { Synergy } from "./Synergy"

export enum Item {
  FOSSIL_STONE = "FOSSIL_STONE",
  TWISTED_SPOON = "TWISTED_SPOON",
  MYSTIC_WATER = "MYSTIC_WATER",
  MAGNET = "MAGNET",
  BLACK_GLASSES = "BLACK_GLASSES",
  MIRACLE_SEED = "MIRACLE_SEED",
  NEVER_MELT_ICE = "NEVER_MELT_ICE",
  CHARCOAL = "CHARCOAL",
  HEART_SCALE = "HEART_SCALE",
  OLD_AMBER = "OLD_AMBER",
  DAWN_STONE = "DAWN_STONE",
  WATER_STONE = "WATER_STONE",
  THUNDER_STONE = "THUNDER_STONE",
  FIRE_STONE = "FIRE_STONE",
  MOON_STONE = "MOON_STONE",
  DUSK_STONE = "DUSK_STONE",
  LEAF_STONE = "LEAF_STONE",
  ICE_STONE = "ICE_STONE",
  CHOICE_SPECS = "CHOICE_SPECS",
  SOUL_DEW = "SOUL_DEW",
  UPGRADE = "UPGRADE",
  REAPER_CLOTH = "REAPER_CLOTH",
  POKEMONOMICON = "POKEMONOMICON",
  POWER_LENS = "POWER_LENS",
  SHELL_BELL = "SHELL_BELL",
  LUCKY_EGG = "LUCKY_EGG",
  AQUA_EGG = "AQUA_EGG",
  BLUE_ORB = "BLUE_ORB",
  SCOPE_LENS = "SCOPE_LENS",
  STAR_DUST = "STAR_DUST",
  DELTA_ORB = "DELTA_ORB",
  MANA_SCARF = "MANA_SCARF",
  SMOKE_BALL = "SMOKE_BALL",
  XRAY_VISION = "XRAY_VISION",
  RAZOR_FANG = "RAZOR_FANG",
  LEFTOVERS = "LEFTOVERS",
  CHOICE_SCARF = "CHOICE_SCARF",
  FIRE_GEM = "FIRE_GEM",
  DEFENSIVE_RIBBON = "DEFENSIVE_RIBBON",
  WONDER_BOX = "WONDER_BOX",
  CLEANSE_TAG = "CLEANSE_TAG",
  WIDE_LENS = "WIDE_LENS",
  RAZOR_CLAW = "RAZOR_CLAW",
  FLUFFY_TAIL = "FLUFFY_TAIL",
  KINGS_ROCK = "KINGS_ROCK",
  SHINY_CHARM = "SHINY_CHARM",
  GRACIDEA_FLOWER = "GRACIDEA_FLOWER",
  FLAME_ORB = "FLAME_ORB",
  ASSAULT_VEST = "ASSAULT_VEST",
  AMULET_COIN = "AMULET_COIN",
  POKE_DOLL = "POKE_DOLL",
  RED_ORB = "RED_ORB",
  MAX_REVIVE = "MAX_REVIVE",
  ROCKY_HELMET = "ROCKY_HELMET",
  AGUAV_BERRY = "AGUAV_BERRY",
  APICOT_BERRY = "APICOT_BERRY",
  ASPEAR_BERRY = "ASPEAR_BERRY",
  BABIRI_BERRY = "BABIRI_BERRY",
  CHERI_BERRY = "CHERI_BERRY",
  CHESTO_BERRY = "CHESTO_BERRY",
  GANLON_BERRY = "GANLON_BERRY",
  JABOCA_BERRY = "JABOCA_BERRY",
  LANSAT_BERRY = "LANSAT_BERRY",
  LEPPA_BERRY = "LEPPA_BERRY",
  LIECHI_BERRY = "LIECHI_BERRY",
  LUM_BERRY = "LUM_BERRY",
  ORAN_BERRY = "ORAN_BERRY",
  PECHA_BERRY = "PECHA_BERRY",
  PERSIM_BERRY = "PERSIM_BERRY",
  PETAYA_BERRY = "PETAYA_BERRY",
  RAWST_BERRY = "RAWST_BERRY",
  ROWAP_BERRY = "ROWAP_BERRY",
  SALAC_BERRY = "SALAC_BERRY",
  SITRUS_BERRY = "SITRUS_BERRY"
}

export const AllItems: Item[] = Object.values(Item)

export const BasicItems: Item[] = [
  Item.FOSSIL_STONE,
  Item.TWISTED_SPOON,
  Item.MAGNET,
  Item.BLACK_GLASSES,
  Item.MIRACLE_SEED,
  Item.CHARCOAL,
  Item.NEVER_MELT_ICE,
  Item.HEART_SCALE,
  Item.MYSTIC_WATER
]

export const Berries: Item[] = [
  Item.AGUAV_BERRY,
  Item.APICOT_BERRY,
  Item.ASPEAR_BERRY,
  Item.BABIRI_BERRY,
  Item.CHERI_BERRY,
  Item.CHESTO_BERRY,
  Item.GANLON_BERRY,
  Item.JABOCA_BERRY,
  Item.LANSAT_BERRY,
  Item.LEPPA_BERRY,
  Item.LIECHI_BERRY,
  Item.LUM_BERRY,
  Item.ORAN_BERRY,
  Item.PECHA_BERRY,
  Item.PERSIM_BERRY,
  Item.PETAYA_BERRY,
  Item.RAWST_BERRY,
  Item.ROWAP_BERRY,
  Item.SALAC_BERRY,
  Item.SITRUS_BERRY
]

export const CompletedItems: Item[] = Object.values(Item).filter(
  (item) =>
    BasicItems.includes(item) === false && Berries.includes(item) === false
)

export const SynergyStones = [
  Item.OLD_AMBER,
  Item.DAWN_STONE,
  Item.WATER_STONE,
  Item.THUNDER_STONE,
  Item.FIRE_STONE,
  Item.MOON_STONE,
  Item.DUSK_STONE,
  Item.LEAF_STONE,
  Item.ICE_STONE
]

export const SynergyByStone = {
  [Item.OLD_AMBER]: Synergy.FOSSIL,
  [Item.DAWN_STONE]: Synergy.PSYCHIC,
  [Item.WATER_STONE]: Synergy.WATER,
  [Item.THUNDER_STONE]: Synergy.ELECTRIC,
  [Item.FIRE_STONE]: Synergy.FIRE,
  [Item.MOON_STONE]: Synergy.FAIRY,
  [Item.DUSK_STONE]: Synergy.DARK,
  [Item.LEAF_STONE]: Synergy.GRASS,
  [Item.ICE_STONE]: Synergy.ICE
}

export const NonSpecialItemComponents: Item[] = [
  Item.TWISTED_SPOON,
  Item.MAGNET,
  Item.BLACK_GLASSES,
  Item.MIRACLE_SEED,
  Item.CHARCOAL,
  Item.NEVER_MELT_ICE,
  Item.HEART_SCALE,
  Item.MYSTIC_WATER
]
