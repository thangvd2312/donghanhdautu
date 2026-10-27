import { describe, expect, it } from 'vitest'
import { groupBriefs, groupChats, vnTime } from './conversations'
import type { AdvisorConversationSummary } from './types'

const NOW = Date.parse('2026-10-27T05:00:00Z') // 12:00 ngày 27/10 giờ VN

const conv = (id: string, at: string, brief?: AdvisorConversationSummary['brief']): AdvisorConversationSummary => ({
  id,
  title: id,
  createdAt: at,
  updatedAt: at,
  ...(brief ? { brief } : {}),
})

describe('advisor conversation groups', () => {
  it('groups briefs per Vietnam day', () => {
    const groups = groupBriefs(
      [
        conv('11h', '2026-10-27T04:00:00Z', 'crypto'),
        conv('00h', '2026-10-26T17:00:00Z', 'crypto'), // 00:00 ngày 27 giờ VN
        conv('23h', '2026-10-26T16:00:00Z', 'crypto'),
        conv('sang', '2026-10-24T01:30:00Z', 'morning'),
      ],
      NOW,
    )
    expect(groups.map((g) => [g.label, g.items.map((c) => c.id)])).toEqual([
      ['Hôm nay', ['11h', '00h']],
      ['Hôm qua', ['23h']],
      [expect.stringMatching(/24\/10$/), ['sang']],
    ])
  })

  it('groups own questions into today / yesterday / last 7 / last 30 days / older', () => {
    const groups = groupChats(
      [
        conv('a', '2026-10-27T03:00:00Z'),
        conv('b', '2026-10-26T03:00:00Z'),
        conv('c', '2026-10-23T03:00:00Z'),
        conv('d', '2026-10-10T03:00:00Z'),
        conv('e', '2026-08-01T03:00:00Z'),
      ],
      NOW,
    )
    expect(groups.map((g) => g.label)).toEqual(['Hôm nay', 'Hôm qua', '7 ngày qua', '30 ngày qua', 'Cũ hơn'])
  })

  it('shows brief time in Vietnam time', () => {
    expect(vnTime('2026-10-27T04:00:00Z')).toBe('11:00')
  })
})
