import type { PluginContext } from '@rcv-prod-toolkit/types'
import type { GfxState } from './types/GfxState'
import { isDeepStrictEqual } from 'util'
import dayjs from 'dayjs'

const initialState: GfxState = {
  state: 'NO_MATCH',
  teams: {},
  bestOf: 1,
  roundOf: 2
}

module.exports = async (ctx: PluginContext) => {
  const namespace = ctx.plugin.module.getName()

  let gfxState = initialState

  // Register new UI page
  ctx.LPTE.emit({
    meta: {
      type: 'add-pages',
      namespace: 'ui',
      version: 1
    },
    pages: [
      {
        name: `Teams`,
        frontend: 'frontend',
        id: `op-${namespace}`
      }
    ]
  })

  // Answer requests to get state
  ctx.LPTE.on(namespace, 'request-current', async (e: any) => {
    ctx.LPTE.emit({
      meta: {
        type: e.meta.reply,
        namespace: 'reply',
        version: 1
      },
      state: gfxState.state,
      teams: gfxState.teams,
      bestOf: gfxState.bestOf,
      roundOf: gfxState.roundOf
    })
  })

  ctx.LPTE.on(namespace, 'request-matches-of-the-day', async (e: any) => {
    const res = await ctx.LPTE.request({
      meta: {
        type: 'request',
        namespace: 'plugin-database',
        version: 1
      },
      collection: 'match',
      filter: (match: any) =>
        match.date >= dayjs(new Date()).startOf('day').valueOf() &&
        match.date <= dayjs(new Date()).endOf('day').valueOf(),
      sort: (a: any, b: any) => a - b
    })

    ctx.LPTE.emit({
      meta: {
        type: e.meta.reply,
        namespace: 'reply',
        version: 1
      },
      matches: res
    })
  })

  ctx.LPTE.on(namespace, 'set', async (e: any) => {
    if (
      isDeepStrictEqual(gfxState.teams, e.teams) &&
      gfxState.bestOf == e.bestOf &&
      gfxState.roundOf == e.roundOf
    )
      return

    if (
      gfxState.teams.blueTeam?.name == e.teams.redTeam.name &&
      gfxState.teams.redTeam?.name == e.teams.blueTeam.name
    ) {
      ctx.LPTE.emit({
        meta: {
          type: 'updateOne',
          namespace: 'plugin-database',
          version: 1
        },
        collection: 'match',
        id: gfxState.id,
        data: {
          teams: {
            blueTeam: e.teams.redTeam,
            redTeam: e.teams.blueTeam
          },
          bestOf: e.bestOf,
          roundOf: e.roundOf
        }
      })
    } else if (
      gfxState.teams.blueTeam?.name == e.teams.blueTeam.name &&
      gfxState.teams.redTeam?.name == e.teams.redTeam.name
    ) {
      ctx.LPTE.emit({
        meta: {
          type: 'updateOne',
          namespace: 'plugin-database',
          version: 1
        },
        collection: 'match',
        id: gfxState.id,
        data: {
          teams: {
            blueTeam: e.teams.blueTeam,
            redTeam: e.teams.redTeam
          },
          bestOf: e.bestOf,
          roundOf: e.roundOf
        }
      })
    } else {
      const response = await ctx.LPTE.request({
        meta: {
          type: 'insertOne',
          namespace: 'plugin-database',
          version: 1
        },
        collection: 'match',
        data: {
          teams: {
            blueTeam: e.teams.blueTeam,
            redTeam: e.teams.redTeam
          },
          bestOf: e.bestOf,
          roundOf: e.roundOf,
          date: new Date().getTime()
        }
      })

      if (response === undefined || response.id === undefined) {
        return ctx.log.warn('match could not be inserted')
      }
      gfxState.id = response.id
    }

    gfxState.state = 'READY'
    gfxState.teams = e.teams
    gfxState.bestOf = e.bestOf
    gfxState.roundOf = e.roundOf

    ctx.LPTE.emit({
      meta: {
        type: 'update',
        namespace,
        version: 1
      },
      state: gfxState.state,
      teams: gfxState.teams,
      bestOf: gfxState.bestOf,
      roundOf: gfxState.roundOf
    })
  })

  ctx.LPTE.on(namespace, 'swop', (e: any) => {
    if (gfxState.state !== 'READY') return
    if (!gfxState.teams.redTeam || !gfxState.teams.blueTeam) return

    gfxState.teams = {
      blueTeam: gfxState.teams.redTeam,
      redTeam: gfxState.teams.blueTeam
    }

    ctx.LPTE.emit({
      meta: {
        type: 'update',
        namespace,
        version: 1
      },
      state: gfxState.state,
      teams: gfxState.teams,
      bestOf: gfxState.bestOf,
      roundOf: gfxState.roundOf
    })
  })

  ctx.LPTE.on(namespace, 'unset', (e: any) => {
    gfxState = {
      state: 'NO_MATCH',
      teams: {},
      bestOf: 1,
      roundOf: 2
    }

    ctx.LPTE.emit({
      meta: {
        type: 'update',
        namespace,
        version: 1
      },
      state: gfxState.state,
      teams: gfxState.teams,
      bestOf: gfxState.bestOf,
      roundOf: gfxState.roundOf
    })
  })

  ctx.LPTE.on(namespace, 'clear-matches', (e: any) => {
    ctx.LPTE.emit({
      meta: {
        namespace: 'plugin-database',
        type: 'delete',
        version: 1
      },
      collection: 'match',
      filter: {}
    })

    gfxState = {
      state: 'NO_MATCH',
      teams: {},
      bestOf: 1,
      roundOf: 2
    }

    ctx.LPTE.emit({
      meta: {
        type: 'update',
        namespace,
        version: 1
      },
      state: gfxState.state,
      teams: gfxState.teams,
      bestOf: gfxState.bestOf,
      roundOf: gfxState.roundOf
    })
  })

  ctx.LPTE.on(namespace, 'delete-team', async (e: any) => {
    await ctx.LPTE.request({
      meta: {
        type: 'deleteOne',
        namespace: 'plugin-database',
        version: 1
      },
      collection: 'team',
      id: e.id
    })

    const res = await ctx.LPTE.request({
      meta: {
        type: 'request',
        namespace: 'plugin-database',
        version: 1
      },
      collection: 'team',
      limit: 30
    })

    if (res === undefined || res.data === undefined) {
      ctx.log.warn('teams could not be loaded')
    }

    ctx.LPTE.emit({
      meta: {
        type: 'update-teams-set',
        namespace,
        version: 1
      },
      teams: res?.data
    })
  })

  ctx.LPTE.on(namespace, 'add-team', async (e: any) => {
    await ctx.LPTE.request({
      meta: {
        type: 'insertOne',
        namespace: 'plugin-database',
        version: 1
      },
      collection: 'team',
      data: {
        logo: e.logo,
        name: e.name,
        tag: e.tag,
        color: e.color,
        standing: e.standing,
        coach: e.coach
      }
    })

    const res = await ctx.LPTE.request({
      meta: {
        type: 'request',
        namespace: 'plugin-database',
        version: 1
      },
      collection: 'team',
      limit: 30
    })

    if (res === undefined || res.data === undefined) {
      ctx.log.warn('teams could not be loaded')
    }

    ctx.LPTE.emit({
      meta: {
        type: 'update-teams-set',
        namespace,
        version: 1
      },
      teams: res?.data
    })
  })

  ctx.LPTE.on(namespace, 'update-team', async (e: any) => {
    await ctx.LPTE.request({
      meta: {
        type: 'updateOne',
        namespace: 'plugin-database',
        version: 1
      },
      collection: 'team',
      id: e.id,
      data: {
        logo: e.logo,
        name: e.name,
        tag: e.tag,
        color: e.color,
        standing: e.standing,
        coach: e.coach
      }
    })

    const res = await ctx.LPTE.request({
      meta: {
        type: 'request',
        namespace: 'plugin-database',
        version: 1
      },
      collection: 'team',
      limit: 30
    })

    if (res === undefined || res.data === undefined) {
      ctx.log.warn('teams could not be loaded')
    }

    ctx.LPTE.emit({
      meta: {
        type: 'update-teams-set',
        namespace,
        version: 1
      },
      teams: res?.data
    })
  })

  ctx.LPTE.on(namespace, 'request-teams', async (e: any) => {
    const res = await ctx.LPTE.request({
      meta: {
        type: 'request',
        namespace: 'plugin-database',
        version: 1
      },
      collection: 'team',
      limit: 30
    })

    if (res === undefined || res.data === undefined) {
      ctx.log.warn('teams could not be loaded')
    }

    ctx.LPTE.emit({
      meta: {
        type: e.meta.reply,
        namespace: 'reply',
        version: 1
      },
      teams: res?.data
    })
  })

  if (gfxState.state == 'NO_MATCH') {
    const res = await ctx.LPTE.request({
      meta: {
        type: 'request',
        namespace: 'plugin-database',
        version: 1
      },
      collection: 'match',
      filter: (match: any) =>
        match.date >= dayjs(new Date()).startOf('day').valueOf() &&
        match.date <= dayjs(new Date()).endOf('day').valueOf(),
      sort: (a: any, b: any) => a - b,
      limit: 1
    })

    if (res === undefined || res.data === undefined) {
      return ctx.log.warn('matches could not be loaded')
    }

    if (res.data[0]) {
      gfxState.state = 'READY'
      gfxState.teams = res.data[0].teams
      gfxState.bestOf = res.data[0].bestOf
      gfxState.id = res.data[0].id
      gfxState.roundOf = res.data[0].roundOf
    }
  }

  ctx.LPTE.emit({
    meta: {
      namespace,
      type: 'teams-loaded',
      version: 1
    },
    state: gfxState.state,
    teams: gfxState.teams,
    bestOf: gfxState.bestOf,
    roundOf: gfxState.roundOf
  })

  // Emit event that we're ready to operate
  ctx.LPTE.emit({
    meta: {
      type: 'plugin-status-change',
      namespace: 'lpt',
      version: 1
    },
    status: 'RUNNING'
  })
}
