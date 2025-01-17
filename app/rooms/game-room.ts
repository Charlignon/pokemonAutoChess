import { Client, Room } from "colyseus"
import { Dispatcher } from "@colyseus/command"
import GameState from "./states/game-state"
import Player from "../models/colyseus-models/player"
import { MapSchema } from "@colyseus/schema"
import UserMetadata, {
  IPokemonConfig
} from "../models/mongo-models/user-metadata"
import { BotV2 } from "../models/mongo-models/bot-v2"
import {
  OnShopCommand,
  OnSellDropCommand,
  OnRefreshCommand,
  OnLockCommand,
  OnLevelUpCommand,
  OnUpdateCommand,
  OnDragDropCommand,
  OnJoinCommand,
  OnDragDropItemCommand,
  OnDragDropCombineCommand,
  OnPickBerryCommand
} from "./commands/game-commands"
import {
  AdditionalPicksStages,
  DungeonPMDO,
  ExpPlace,
  LegendaryShop,
  PortalCarouselStages,
  RequiredStageLevelForXpElligibility,
  UniqueShop
} from "../types/Config"
import { Item } from "../types/enum/Item"
import PokemonFactory from "../models/pokemon-factory"
import EloRank from "elo-rank"
import admin from "firebase-admin"
import DetailledStatistic from "../models/mongo-models/detailled-statistic-v2"
import {
  Emotion,
  IDragDropCombineMessage,
  IDragDropItemMessage,
  IDragDropMessage,
  IGameHistoryPokemonRecord,
  IGameHistorySimplePlayer,
  IGameMetadata,
  IPokemon,
  Transfer
} from "../types"
import { Pkm, PkmDuos, PkmFamily, PkmProposition } from "../types/enum/Pokemon"
import { Synergy } from "../types/enum/Synergy"
import { Pokemon } from "../models/colyseus-models/pokemon"
import { IGameUser } from "../models/colyseus-models/game-user"
import History from "../models/mongo-models/history"
import { components } from "../api-v1/openapi"
import { Title, Role } from "../types"
import PRECOMPUTED_TYPE_POKEMONS from "../models/precomputed/type-pokemons.json"
import BannedUser from "../models/mongo-models/banned-user"
import { shuffleArray } from "../utils/random"
import { Rarity } from "../types/enum/Game"
import { Weather } from "../types/enum/Weather"
import { MiniGame } from "../core/matter/mini-game"
import { logger } from "../utils/logger"
import { computeElo } from "../core/elo"
import { Passive } from "../types/enum/Passive"
import { getAvatarString } from "../public/src/utils"
import { keys, values } from "../utils/schemas"
import { removeInArray } from "../utils/array"
import { CountEvolutionRule, ItemEvolutionRule } from "../core/evolution-rules"

export default class GameRoom extends Room<GameState> {
  dispatcher: Dispatcher<this>
  eloEngine: EloRank
  additionalUncommonPool: Array<Pkm>
  additionalRarePool: Array<Pkm>
  additionalEpicPool: Array<Pkm>
  miniGame: MiniGame
  constructor() {
    super()
    this.dispatcher = new Dispatcher(this)
    this.eloEngine = new EloRank()
    this.additionalUncommonPool = new Array<Pkm>()
    this.additionalRarePool = new Array<Pkm>()
    this.additionalEpicPool = new Array<Pkm>()
    this.miniGame = new MiniGame()
  }

  // When room is initialized
  async onCreate(options: {
    users: MapSchema<IGameUser>
    preparationId: string
    name: string
    idToken: string
    noElo: boolean
    selectedMap: DungeonPMDO | "random"
    whenReady: (room: GameRoom) => void
  }) {
    logger.trace("create game room")
    this.setMetadata(<IGameMetadata>{
      name: options.name,
      playerIds: keys(options.users).filter(
        (id) => options.users.get(id)!.isBot === false
      ),
      stageLevel: 0,
      type: "game"
    })
    // logger.debug(options);
    this.setState(
      new GameState(
        options.preparationId,
        options.name,
        options.noElo,
        options.selectedMap
      )
    )
    this.miniGame.create(
      this.state.avatars,
      this.state.floatingItems,
      this.state.portals,
      this.state.symbols
    )
    Object.keys(PRECOMPUTED_TYPE_POKEMONS).forEach((type) => {
      PRECOMPUTED_TYPE_POKEMONS[type].additionalPokemons.forEach((p) => {
        const pokemon = PokemonFactory.createPokemonFromName(p)
        if (
          (pokemon.rarity === Rarity.UNCOMMON ||
            pokemon.rarity === Rarity.COMMON) && // TEMP: we should move all common add picks to uncommon rarity
          !this.additionalUncommonPool.includes(p) &&
          pokemon.stars === 1
        ) {
          this.additionalUncommonPool.push(p)
        } else if (
          pokemon.rarity === Rarity.RARE &&
          !this.additionalRarePool.includes(p) &&
          pokemon.stars === 1
        ) {
          this.additionalRarePool.push(p)
        } else if (
          pokemon.rarity === Rarity.EPIC &&
          !this.additionalEpicPool.includes(p) &&
          pokemon.stars === 1
        ) {
          this.additionalEpicPool.push(p)
        }
      })
    })
    shuffleArray(this.additionalUncommonPool)
    shuffleArray(this.additionalRarePool)
    shuffleArray(this.additionalEpicPool)

    await Promise.all(
      keys(options.users).map(async (id) => {
        const user = options.users[id]
        //logger.debug(`init player`, user)
        if (user.isBot) {
          const player = new Player(
            user.id,
            user.name,
            user.elo,
            user.avatar,
            true,
            this.state.players.size + 1,
            new Map<string, IPokemonConfig>(),
            "",
            Role.BOT
          )
          this.state.players.set(user.id, player)
          this.state.botManager.addBot(player)
          //this.state.shop.assignShop(player)
        } else {
          const user = await UserMetadata.findOne({ uid: id })
          if (user) {
            // init player
            const player = new Player(
              user.uid,
              user.displayName,
              user.elo,
              user.avatar,
              false,
              this.state.players.size + 1,
              user.pokemonCollection,
              user.title,
              user.role
            )

            this.state.players.set(user.uid, player)
            this.state.shop.assignShop(player, false, 1)
          }
        }
      })
    )

    setTimeout(() => {
      this.broadcast(Transfer.LOADING_COMPLETE)
      this.startGame()
    }, 5 * 60 * 1000) // maximum 5 minutes of loading game, game will start no matter what after that

    this.onMessage(Transfer.ITEM, (client, item: Item) => {
      if (!this.state.gameFinished && client.auth) {
        try {
          this.pickItemProposition(client.auth.uid, item)
        } catch (error) {
          logger.error(error)
        }
      }
    })

    this.onMessage(Transfer.SHOP, (client, message) => {
      if (!this.state.gameFinished && client.auth) {
        try {
          this.dispatcher.dispatch(new OnShopCommand(), {
            playerId: client.auth.uid,
            index: message.id
          })
        } catch (error) {
          logger.error("shop error", message, error)
        }
      }
    })

    this.onMessage(Transfer.POKEMON_PROPOSITION, (client, pkm: Pkm) => {
      if (!this.state.gameFinished && client.auth) {
        try {
          this.pickPokemonProposition(client.auth.uid, pkm)
        } catch (error) {
          logger.error(error)
        }
      }
    })

    this.onMessage(Transfer.DRAG_DROP, (client, message: IDragDropMessage) => {
      if (!this.state.gameFinished) {
        try {
          this.dispatcher.dispatch(new OnDragDropCommand(), {
            client: client,
            detail: message
          })
        } catch (error) {
          const errorInformation = {
            updateBoard: true,
            updateItems: true
          }
          client.send(Transfer.DRAG_DROP_FAILED, errorInformation)
          logger.error("drag drop error", error)
        }
      }
    })

    this.onMessage(
      Transfer.DRAG_DROP_ITEM,
      (client, message: IDragDropItemMessage) => {
        if (!this.state.gameFinished) {
          try {
            this.dispatcher.dispatch(new OnDragDropItemCommand(), {
              client: client,
              detail: message
            })
          } catch (error) {
            const errorInformation = {
              updateBoard: true,
              updateItems: true
            }
            client.send(Transfer.DRAG_DROP_FAILED, errorInformation)
            logger.error("drag drop error", error)
          }
        }
      }
    )

    this.onMessage(
      Transfer.DRAG_DROP_COMBINE,
      (client, message: IDragDropCombineMessage) => {
        if (!this.state.gameFinished) {
          try {
            this.dispatcher.dispatch(new OnDragDropCombineCommand(), {
              client: client,
              detail: message
            })
          } catch (error) {
            const errorInformation = {
              updateBoard: true,
              updateItems: true
            }
            client.send(Transfer.DRAG_DROP_FAILED, errorInformation)
            logger.error("drag drop error", error)
          }
        }
      }
    )

    this.onMessage(
      Transfer.VECTOR,
      (client, message: { x: number; y: number }) => {
        try {
          if (client.auth) {
            this.miniGame.applyVector(client.auth.uid, message.x, message.y)
          }
        } catch (error) {
          logger.error(error)
        }
      }
    )

    this.onMessage(
      Transfer.SELL_DROP,
      (client, message: { pokemonId: string }) => {
        if (!this.state.gameFinished && client.auth) {
          try {
            this.dispatcher.dispatch(new OnSellDropCommand(), {
              client,
              detail: message
            })
          } catch (error) {
            logger.error("sell drop error", message)
          }
        }
      }
    )

    this.onMessage(Transfer.REQUEST_TILEMAP, (client, message) => {
      client.send(Transfer.REQUEST_TILEMAP, this.state.tilemap)
    })

    this.onMessage(Transfer.REFRESH, (client, message) => {
      if (!this.state.gameFinished && client.auth) {
        try {
          this.dispatcher.dispatch(new OnRefreshCommand(), client.auth.uid)
        } catch (error) {
          logger.error("refresh error", message)
        }
      }
    })

    this.onMessage(Transfer.LOCK, (client, message) => {
      if (!this.state.gameFinished && client.auth) {
        try {
          this.dispatcher.dispatch(new OnLockCommand(), client.auth.uid)
        } catch (error) {
          logger.error("lock error", message)
        }
      }
    })

    this.onMessage(Transfer.LEVEL_UP, (client, message) => {
      if (!this.state.gameFinished && client.auth) {
        try {
          this.dispatcher.dispatch(new OnLevelUpCommand(), client.auth.uid)
        } catch (error) {
          logger.error("level up error", message)
        }
      }
    })

    this.onMessage(
      Transfer.TOGGLE_ANIMATION,
      (client: Client, message?: string) => {
        if (client.auth) {
          this.broadcast(Transfer.TOGGLE_ANIMATION, {
            id: client.auth.uid,
            emote: message
          })
        }
      }
    )

    this.onMessage(Transfer.UNOWN_ENCOUNTER, async (client, unownIndex) => {
      try {
        if (client.auth) {
          const DUST_PER_ENCOUNTER = 50
          const u = await UserMetadata.findOne({ uid: client.auth.uid })
          if (u) {
            const c = u.pokemonCollection.get(unownIndex)
            if (c) {
              c.dust += DUST_PER_ENCOUNTER
            } else {
              u.pokemonCollection.set(unownIndex, {
                id: unownIndex,
                emotions: [],
                shinyEmotions: [],
                dust: DUST_PER_ENCOUNTER,
                selectedEmotion: Emotion.NORMAL,
                selectedShiny: false
              })
            }
            u.save()
          }
        }
      } catch (error) {
        logger.error(error)
      }
    })

    this.onMessage(Transfer.PICK_BERRY, async (client) => {
      if (!this.state.gameFinished && client.auth) {
        try {
          this.dispatcher.dispatch(new OnPickBerryCommand(), client.auth.uid)
        } catch (error) {
          logger.error("error picking berry", error)
        }
      }
    })

    this.onMessage(Transfer.LOADING_PROGRESS, (client, progress: number) => {
      if (client.auth) {
        const player = this.state.players.get(client.auth.uid)
        if (player) {
          player.loadingProgress = progress
        }
      }
    })

    this.onMessage(Transfer.LOADING_COMPLETE, (client) => {
      if (client.auth) {
        const player = this.state.players.get(client.auth.uid)
        if (player) {
          player.loadingProgress = 100
        }
        if (this.state.gameLoaded) {
          // already started, presumably a user refreshed page and wants to reconnect to game
          client.send(Transfer.LOADING_COMPLETE)
        } else if (
          values(this.state.players).every((p) => p.loadingProgress === 100)
        ) {
          this.broadcast(Transfer.LOADING_COMPLETE)
          this.startGame()
        }
      }
    })

    // room ready
    options.whenReady(this)
  }

  startGame() {
    if (this.state.gameLoaded) return // already started
    this.state.gameLoaded = true
    this.setSimulationInterval((deltaTime: number) => {
      if (!this.state.gameFinished) {
        try {
          this.dispatcher.dispatch(new OnUpdateCommand(), { deltaTime })
        } catch (error) {
          logger.error("update error", error)
        }
      }
    })
  }

  async onAuth(client: Client, options: any, request: any) {
    try {
      super.onAuth(client, options, request)
      const token = await admin.auth().verifyIdToken(options.idToken)
      const user = await admin.auth().getUser(token.uid)
      const isBanned = await BannedUser.findOne({ uid: user.uid })
      const userProfile = await UserMetadata.findOne({ uid: user.uid })
      client.send(Transfer.USER_PROFILE, userProfile)

      if (!user.displayName) {
        throw "No display name"
      } else if (isBanned) {
        throw "User banned"
      } else {
        return user
      }
    } catch (error) {
      logger.error(error)
    }
  }

  onJoin(client: Client, options: any, auth: any) {
    this.dispatcher.dispatch(new OnJoinCommand(), { client, options, auth })
  }

  async onLeave(client: Client, consented: boolean) {
    try {
      if (client && client.auth && client.auth.displayName) {
        logger.info(`${client.auth.displayName} has been disconnected`)
      }
      if (consented) {
        throw new Error("consented leave")
      }

      // allow disconnected client to reconnect into this room until 3 minutes
      await this.allowReconnection(client, 180)
    } catch (e) {
      if (client && client.auth && client.auth.displayName) {
        logger.info(`${client.auth.displayName} left game`)
        const player = this.state.players.get(client.auth.uid)
        if (player && this.state.stageLevel <= 5) {
          // if player left game during the loading screen or before stage 6, remove it from the players
          this.state.players.delete(client.auth.uid)
          this.setMetadata({
            playerIds: removeInArray(this.metadata.playerIds, client.auth.uid)
          })
          logger.info(
            `${client.auth.displayName} has been removed from players list`
          )
        }
      }
      if (values(this.state.players).every((p) => p.loadingProgress === 100)) {
        this.broadcast(Transfer.LOADING_COMPLETE)
        this.startGame()
      }
    }
  }

  async onDispose() {
    const numberOfPlayersAlive = values(this.state.players).filter(
      (p) => p.alive
    ).length
    if (numberOfPlayersAlive > 1) {
      logger.warn(
        `Game room has been disposed while they were still ${numberOfPlayersAlive} players alive.`
      )
      return // we skip elo compute/game history in case of technical issue such as a crash of node
    }

    try {
      this.state.endTime = Date.now()
      const players: components["schemas"]["GameHistory"]["players"] = []
      this.state.players.forEach((p) => {
        if (!p.isBot) {
          players.push(this.transformToSimplePlayer(p))
        }
      })
      History.create({
        id: this.state.preparationId,
        name: this.state.name,
        startTime: this.state.startTime,
        endTime: this.state.endTime,
        players
      })

      const humans: Player[] = []
      const bots: Player[] = []

      this.state.players.forEach((player) => {
        if (player.isBot) {
          bots.push(player)
        } else {
          humans.push(player)
        }
      })

      const elligibleToXP =
        this.state.players.size >= 2 &&
        this.state.stageLevel >= RequiredStageLevelForXpElligibility
      const elligibleToELO =
        elligibleToXP && !this.state.noElo && humans.length >= 2

      if (elligibleToXP) {
        for (let i = 0; i < bots.length; i++) {
          const player = bots[i]
          const results = await BotV2.find({ id: player.id })
          if (results) {
            results.forEach((bot) => {
              bot.elo = computeElo(
                this.transformToSimplePlayer(player),
                player.rank,
                bot.elo,
                [...humans, ...bots].map((p) => this.transformToSimplePlayer(p))
              )
              bot.save()
            })
          }
        }

        for (let i = 0; i < humans.length; i++) {
          const player = humans[i]
          const exp = ExpPlace[player.rank - 1]
          let rank = player.rank

          if (!this.state.gameFinished && player.life > 0) {
            let rankOfLastPlayerAlive = this.state.players.size
            this.state.players.forEach((plyr) => {
              if (plyr.life <= 0 && plyr.rank < rankOfLastPlayerAlive) {
                rankOfLastPlayerAlive = plyr.rank
              }
            })
            rank = rankOfLastPlayerAlive
          }

          const usr = await UserMetadata.findOne({ uid: player.id })
          if (usr) {
            const expThreshold = 1000
            if (usr.exp + exp >= expThreshold) {
              usr.level += 1
              usr.booster += 1
              usr.exp = usr.exp + exp - expThreshold
            } else {
              usr.exp = usr.exp + exp
            }
            usr.exp = !isNaN(usr.exp) ? usr.exp : 0

            if (rank === 1) {
              usr.wins += 1
            }

            if (usr.level >= 10) {
              player.titles.add(Title.ROOKIE)
            }
            if (usr.level >= 20) {
              player.titles.add(Title.AMATEUR)
              player.titles.add(Title.BOT_BUILDER)
            }
            if (usr.level >= 30) {
              player.titles.add(Title.VETERAN)
            }
            if (usr.level >= 50) {
              player.titles.add(Title.PRO)
            }
            if (usr.level >= 100) {
              player.titles.add(Title.EXPERT)
            }
            if (usr.level >= 150) {
              player.titles.add(Title.ELITE)
            }
            if (usr.level >= 200) {
              player.titles.add(Title.MASTER)
            }
            if (usr.level >= 300) {
              player.titles.add(Title.GRAND_MASTER)
            }

            if (usr.elo != null && elligibleToELO) {
              const elo = computeElo(
                this.transformToSimplePlayer(player),
                rank,
                usr.elo,
                humans.map((p) => this.transformToSimplePlayer(p))
              )
              if (elo) {
                if (elo > 1100) {
                  player.titles.add(Title.GYM_TRAINER)
                }
                if (elo > 1200) {
                  player.titles.add(Title.GYM_CHALLENGER)
                }
                if (elo > 1400) {
                  player.titles.add(Title.GYM_LEADER)
                }
                usr.elo = elo
              }

              const dbrecord = this.transformToSimplePlayer(player)
              DetailledStatistic.create({
                time: Date.now(),
                name: dbrecord.name,
                pokemons: dbrecord.pokemons,
                rank: dbrecord.rank,
                avatar: dbrecord.avatar,
                playerId: dbrecord.id,
                elo: elo
              })
            }

            if (player.life === 100 && rank === 1) {
              player.titles.add(Title.TYRANT)
            }
            if (player.life === 1 && rank === 1) {
              player.titles.add(Title.SURVIVOR)
            }

            if (player.rerollCount > 60) {
              player.titles.add(Title.GAMBLER)
            }

            if (usr.titles === undefined) {
              usr.titles = []
            }

            player.titles.forEach((t) => {
              if (!usr.titles.includes(t)) {
                logger.info("title added ", t)
                usr.titles.push(t)
              }
            })
            //logger.debug(usr);
            //usr.markModified('metadata');
            usr.save()
          }
        }
      }
      this.dispatcher.stop()
    } catch (error) {
      logger.error(error)
    }
  }

  transformToSimplePlayer(player: Player): IGameHistorySimplePlayer {
    const simplePlayer: IGameHistorySimplePlayer = {
      name: player.name,
      id: player.id,
      rank: player.rank,
      avatar: player.avatar,
      pokemons: new Array<{
        name: Pkm
        avatar: string
        items: Item[]
        inventory: Item[]
      }>(),
      elo: player.elo,
      synergies: [],
      title: player.title,
      role: player.role
    }

    player.synergies.forEach((v, k) => {
      simplePlayer.synergies.push({ name: k as Synergy, value: v })
    })

    player.board.forEach((pokemon: IPokemon) => {
      if (pokemon.positionY != 0) {
        const avatar = getAvatarString(
          pokemon.index,
          pokemon.shiny,
          pokemon.emotion
        )
        const s: IGameHistoryPokemonRecord = {
          name: pokemon.name,
          avatar: avatar,
          items: new Array<Item>(),
          inventory: new Array<Item>()
        }
        pokemon.items.forEach((i) => {
          s.items.push(i)
          s.inventory.push(i)
        })
        simplePlayer.pokemons.push(s)
      }
    })
    return simplePlayer
  }

  swap(player: Player, pokemon: IPokemon, x: number, y: number) {
    const pokemonToSwap = this.getPokemonByPosition(player, x, y)
    if (pokemonToSwap) {
      pokemonToSwap.positionX = pokemon.positionX
      pokemonToSwap.positionY = pokemon.positionY
      pokemonToSwap.onChangePosition(
        pokemon.positionX,
        pokemon.positionY,
        player,
        this.state.lightX,
        this.state.lightY
      )
    }
    pokemon.positionX = x
    pokemon.positionY = y
  }

  getPokemonByPosition(
    player: Player,
    x: number,
    y: number
  ): Pokemon | undefined {
    return values(player.board).find(
      (pokemon) => pokemon.positionX == x && pokemon.positionY == y
    )
  }

  checkDynamicSynergies(player: Player, pokemon: Pokemon) {
    const n =
      pokemon.passive === Passive.PROTEAN3
        ? 3
        : pokemon.passive === Passive.PROTEAN2
        ? 2
        : 1
    const rankArray = new Array<{ s: Synergy; v: number }>()
    player.synergies.forEach((value, key) => {
      if (value > 0) {
        rankArray.push({ s: key as Synergy, v: value })
      }
    })
    rankArray.sort((a, b) => {
      return b.v - a.v
    })
    pokemon.types.clear()
    for (let i = 0; i < n; i++) {
      const kv = rankArray.shift()
      if (kv) {
        pokemon.types.add(kv.s)
      }
    }
    player.synergies.update(player.board)
    player.effects.update(player.synergies, player.board)
  }

  checkEvolutionsAfterPokemonAcquired(playerId: string) {
    const player = this.state.players.get(playerId)
    if (!player) return false

    player.board.forEach((pokemon) => {
      if (
        pokemon.evolution !== Pkm.DEFAULT &&
        pokemon.evolutionRule instanceof CountEvolutionRule
      ) {
        const pokemonEvolved = pokemon.evolutionRule.tryEvolve(
          pokemon,
          player,
          this.state.stageLevel
        )
        if (pokemonEvolved) {
          // check item evolution rule after count evolution (example: Clefairy)
          this.checkEvolutionsAfterItemAcquired(playerId, pokemonEvolved)
        }
      }
    })

    player.boardSize = this.getTeamSize(player.board)
  }

  checkEvolutionsAfterItemAcquired(playerId: string, pokemon: Pokemon) {
    const player = this.state.players.get(playerId)
    if (!player) return false

    if (
      pokemon.evolutionRule &&
      pokemon.evolutionRule instanceof ItemEvolutionRule
    ) {
      const pokemonEvolved = pokemon.evolutionRule.tryEvolve(
        pokemon,
        player,
        this.state.stageLevel
      )
      if (pokemonEvolved) {
        // check additional item evolution rules. Not used yet in the game but we never know
        this.checkEvolutionsAfterItemAcquired(playerId, pokemonEvolved)
      }
    }
  }

  getNumberOfPlayersAlive(players: MapSchema<Player>) {
    let numberOfPlayersAlive = 0
    players.forEach((player, key) => {
      if (player.alive) {
        numberOfPlayersAlive++
      }
    })
    return numberOfPlayersAlive
  }

  getTeamSize(board: MapSchema<Pokemon>) {
    let size = 0

    board.forEach((pokemon, key) => {
      if (pokemon.positionY != 0) {
        size++
      }
    })

    return size
  }

  updateCastform(weather: Weather) {
    let newForm: Pkm = Pkm.CASTFORM
    if (weather === Weather.SNOW) {
      newForm = Pkm.CASTFORM_HAIL
    } else if (weather === Weather.RAIN) {
      newForm = Pkm.CASTFORM_RAIN
    } else if (weather === Weather.SUN) {
      newForm = Pkm.CASTFORM_SUN
    }

    this.state.players.forEach((player) => {
      player.board.forEach((pokemon, id) => {
        if (
          PkmFamily[pokemon.name] === PkmFamily[Pkm.CASTFORM] &&
          pokemon.name !== newForm
        ) {
          const newPokemon = PokemonFactory.createPokemonFromName(
            newForm,
            player
          )
          pokemon.items.forEach((item) => {
            newPokemon.items.add(item)
          })
          newPokemon.positionX = pokemon.positionX
          newPokemon.positionY = pokemon.positionY
          player.board.delete(id)
          player.board.set(newPokemon.id, newPokemon)
          player.synergies.update(player.board)
          player.effects.update(player.synergies, player.board)
        }
      })
    })
  }

  pickPokemonProposition(
    playerId: string,
    pkm: PkmProposition,
    bypassLackOfSpace = false
  ) {
    const player = this.state.players.get(playerId)
    if (!player || player.pokemonsProposition.length === 0) return
    if (this.state.additionalPokemons.includes(pkm)) return // already picked, probably a double click
    if (UniqueShop.includes(pkm)) {
      if (this.state.stageLevel !== PortalCarouselStages[0]) return // should not be pickable at this stage
      if (values(player.board).some((p) => UniqueShop.includes(p.name))) return // already picked a T10 mythical
    }
    if (LegendaryShop.includes(pkm)) {
      if (this.state.stageLevel !== PortalCarouselStages[1]) return // should not be pickable at this stage
      if (values(player.board).some((p) => LegendaryShop.includes(p.name)))
        return // already picked a T10 mythical
    }

    const pokemonsObtained: Pokemon[] = (
      pkm in PkmDuos ? PkmDuos[pkm] : [pkm]
    ).map((p) => PokemonFactory.createPokemonFromName(p, player))

    const freeSpace = player.getFreeSpaceOnBench()
    if (freeSpace < pokemonsObtained.length && !bypassLackOfSpace) return // prevent picking if not enough space on bench

    // at this point, the player is allowed to pick a proposition
    if (AdditionalPicksStages.includes(this.state.stageLevel)) {
      this.state.additionalPokemons.push(pkm)
      this.state.shop.addAdditionalPokemon(pkm)
      const selectedIndex = player.pokemonsProposition.indexOf(pkm)
      if (
        player.itemsProposition.length > 0 &&
        player.itemsProposition[selectedIndex] != null
      ) {
        player.items.add(player.itemsProposition[selectedIndex])
        player.itemsProposition.clear()
      }
    }

    pokemonsObtained.forEach((pokemon) => {
      const freeCellX = player.getFirstAvailablePositionInBench()
      if (freeCellX !== undefined) {
        pokemon.positionX = freeCellX
        pokemon.positionY = 0
        player.board.set(pokemon.id, pokemon)
      }
    })

    player.pokemonsProposition.clear()
  }

  pickItemProposition(playerId: string, item: Item) {
    const player = this.state.players.get(playerId)
    if (player && player.itemsProposition.includes(item)) {
      player.items.add(item)
      player.itemsProposition.clear()
    }
  }
}
