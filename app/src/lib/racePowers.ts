// The thirty six powers of the Elevator Race, drafted in three cycles of
// sealed bids. The order inside a column matters: an outbid player slides down
// it to the next power still free.

export type PowerColumn = 'edit' | 'plus' | 'special'
/** purple abilities are the ones Silence can switch off */
export type PowerColour = 'orange' | 'purple'

export interface Power {
  id: string
  name: string
  column: PowerColumn
  colour: PowerColour
  text: string
  /** the engine applies this one on its own, with no ruling from the host */
  automatic: boolean
}

export const POWERS: Power[] = [
  // ---- column one: edits, all taken before the first roll ----
  { id: 'coin_edit', name: 'Coin Edit', column: 'edit', colour: 'orange', automatic: true,
    text: 'Замените «1» на монете любым числом от 2 до 8. [начало игры]' },
  { id: 'spinner_edit', name: 'Spinner Edit', column: 'edit', colour: 'orange', automatic: true,
    text: 'Замените числа спиннера любыми тремя разными от 1 до 6. [начало игры]' },
  { id: 'dice_edit', name: 'Dice Edit', column: 'edit', colour: 'orange', automatic: true,
    text: 'Кубик становится пятигранным, новая грань любое число от 1 до 8. [начало игры]' },
  { id: 'lotto_edit', name: 'Lotto Edit', column: 'edit', colour: 'orange', automatic: true,
    text: 'Уберите из лото любые три исхода, включая bust. Они не вернутся. [начало игры]' },
  { id: 'negative', name: 'Negative', column: 'edit', colour: 'orange', automatic: true,
    text: 'Сделайте любые числа на своих роллерах отрицательными: 3 становится -3. [начало игры]' },
  { id: 'reserve', name: 'Reserve', column: 'edit', colour: 'orange', automatic: false,
    text: 'У вас есть по одной запасной копии каждого роллера, каждая на один бросок. [начало игры]' },
  { id: 'less', name: 'Less', column: 'edit', colour: 'orange', automatic: true,
    text: 'Вы играете тремя роллерами: один убран из игры. Сброс возвращает эти три. [начало игры]' },
  { id: 'more', name: 'More', column: 'edit', colour: 'orange', automatic: true,
    text: 'Вы играете пятью роллерами: лишняя копия одного из них. Сброс возвращает эти пять. [начало игры]' },
  { id: 'dash', name: 'Dash', column: 'edit', colour: 'orange', automatic: true,
    text: 'Удвойте числа трёх своих роллеров. Пока никто не финишировал, все лифты для вас идут вниз, после этого все вверх.' },
  { id: 'single', name: 'Single', column: 'edit', colour: 'orange', automatic: true,
    text: 'При сбросе вместо всех роллеров берите четыре копии одного. Один и тот же роллер два сброса подряд нельзя.' },
  { id: 'return', name: 'Return', column: 'edit', colour: 'orange', automatic: false,
    text: 'Выбросив максимум на роллере, можете вернуть одному игроку сброшенный роллер. [фаза блефа]' },
  { id: 'plus_choice', name: 'Plus', column: 'edit', colour: 'orange', automatic: false,
    text: 'Получите одну из четырёх сил Plus на выбор.' },

  // ---- column two: the plus set and the movement tricks ----
  { id: 'coin_plus', name: 'Coin Plus', column: 'plus', colour: 'orange', automatic: false,
    text: 'Можете назвать исход броска монеты заранее [фаза броска]. Угадали: сбросьте роллер другого игрока. [фаза блефа]' },
  { id: 'spinner_plus', name: 'Spinner Plus', column: 'plus', colour: 'orange', automatic: true,
    text: 'Выбирайте результат броска спиннера сами. [фаза броска]' },
  { id: 'dice_plus', name: 'Dice Plus', column: 'plus', colour: 'orange', automatic: true,
    text: 'Кубик бросается дважды, вы выбираете большее или меньшее. [фаза броска]' },
  { id: 'lotto_plus', name: 'Lotto Plus', column: 'plus', colour: 'orange', automatic: false,
    text: 'После броска лото решаете, возвращать ли число в барабан. [фаза блефа]' },
  { id: 'leap', name: 'Leap', column: 'plus', colour: 'purple', automatic: false,
    text: 'Можете двигаться назад на чётных бросках. Назад по лжи двигаться нельзя. [фаза блефа]' },
  { id: 'slow', name: 'Slow', column: 'plus', colour: 'purple', automatic: false,
    text: 'Вы ходите после всех. Любой, кто проходит через вашу клетку, проходит на 1 меньше.' },
  { id: 'shove', name: 'Shove', column: 'plus', colour: 'purple', automatic: true,
    text: 'Тот, кто закончил бы ход на вашей клетке, отбрасывается на 1 клетку назад.' },
  { id: 'reverse', name: 'Reverse', column: 'plus', colour: 'purple', automatic: true,
    text: 'Направления лифтов для вас перевёрнуты.' },
  { id: 'climber', name: 'Climber', column: 'plus', colour: 'purple', automatic: true,
    text: 'Лифты вас не трогают. Свои жизни можете отдавать другим.' },
  { id: 'one', name: 'One', column: 'plus', colour: 'purple', automatic: false,
    text: 'Если вы выбросили 1, каждый, кто тоже выбросил 1, сдвигается на клетку к вам после всех движений.' },
  { id: 'double', name: 'Double', column: 'plus', colour: 'orange', automatic: true,
    text: 'Можете бросить два роллера сразу, результат это сумма. Оба уходят в сброс. С этой силой лгать нельзя. [фаза броска]' },
  { id: 'edit_choice', name: 'Edit', column: 'plus', colour: 'orange', automatic: false,
    text: 'Получите одну из четырёх сил Edit на выбор.' },

  // ---- column three: the specials ----
  { id: 'sniper', name: 'Sniper', column: 'special', colour: 'purple', automatic: false,
    text: 'За 3 жизни уберите один роллер любого игрока из игры. [фаза броска]' },
  { id: 'detective', name: 'Detective', column: 'special', colour: 'orange', automatic: true,
    text: 'Начинаете с 2 жизнями. За каждый верный вызов лжеца получаете жизнь.' },
  { id: 'waste', name: 'Waste', column: 'special', colour: 'orange', automatic: true,
    text: 'Сброс наступает, когда у вас остаётся один роллер. Начинаете с 3 жизнями.' },
  { id: 'spy', name: 'Spy', column: 'special', colour: 'orange', automatic: false,
    text: 'Вам сообщают все исходы бросков монеты, без имён. [начало фазы блефа] Начинаете с 2 жизнями.' },
  { id: 'teleport', name: 'Teleport', column: 'special', colour: 'purple', automatic: false,
    text: 'Вместо броска уберите свой роллер из игры или заплатите 2 жизни и телепортируйтесь к Receiver. [фаза броска]' },
  { id: 'receiver', name: 'Receiver', column: 'special', colour: 'purple', automatic: false,
    text: 'Когда Teleport применяет силу, ваши роллеры возвращаются, и за каждый вы получаете жизнь. [начало фазы блефа]' },
  { id: 'loop', name: 'Loop', column: 'special', colour: 'purple', automatic: false,
    text: 'Можете зациклиться по горизонтали вместо перехода на ряд выше. Стоит 2 псигема. [фаза блефа]' },
  { id: 'silence', name: 'Silence', column: 'special', colour: 'purple', automatic: false,
    text: 'После сброса можете заглушить одну фиолетовую способность до вашего следующего сброса. Дважды подряд на одного нельзя. Начинаете с 2 жизнями. [фаза блефа]' },
  { id: 'insurance', name: 'Insurance', column: 'special', colour: 'orange', automatic: false,
    text: 'Раз за сброс можете перебросить свой бросок. Число будет другим, но двигаться придётся по нему, и блефовать в этот ход нельзя. [фаза блефа]' },
  { id: 'bandit', name: 'Bandit', column: 'special', colour: 'orange', automatic: true,
    text: 'За сброс можете солгать ноль, один или два раза. Пойманы на лжи: дополнительно минус 1 псигем. Начинаете с 2 жизнями.' },
  { id: 'skip', name: 'Skip', column: 'special', colour: 'orange', automatic: false,
    text: 'Вместо броска заплатите 1 жизнь и поднимитесь или опуститесь на ряд. [фаза броска]' },
  { id: 'powered', name: 'Powered', column: 'special', colour: 'orange', automatic: true,
    text: 'Каждый раз, когда встаёте на клетку с квадратным числом, получаете жизнь.' },
]

export const COLUMNS: PowerColumn[] = ['edit', 'plus', 'special']

export function powersIn(column: PowerColumn): Power[] {
  return POWERS.filter(p => p.column === column)
}

export function powerById(id: string): Power | null {
  return POWERS.find(p => p.id === id) ?? null
}

export interface Bid {
  power: string
  amount: number
}

export interface DraftResult {
  /** who ended up with what */
  awarded: Record<string, string>
  /** what each winner actually pays */
  paid: Record<string, number>
  notes: string[]
}

/**
 * Resolves one cycle of the draft. The highest bid takes a contested power and
 * pays for it; everybody else slides down the column to the next free one.
 * Ties go to the deeper pocket, then to whoever bid first.
 */
export function resolveCycle(
  column: PowerColumn,
  bids: Record<string, Bid | null>,
  order: string[],
  totals: Record<string, number>,
  taken: Set<string>,
): DraftResult {
  const awarded: Record<string, string> = {}
  const paid: Record<string, number> = {}
  const notes: string[] = []
  const claimed = new Set(taken)
  const ladder = powersIn(column)

  const better = (a: string, b: string): number => {
    const bidA = bids[a]!.amount
    const bidB = bids[b]!.amount
    if (bidA !== bidB) return bidB - bidA
    const totalA = totals[a] ?? 0
    const totalB = totals[b] ?? 0
    if (totalA !== totalB) return totalB - totalA
    return order.indexOf(a) - order.indexOf(b)
  }

  const wanted: Record<string, string[]> = {}
  for (const [player, bid] of Object.entries(bids)) {
    if (!bid) continue
    wanted[bid.power] = [...(wanted[bid.power] ?? []), player]
  }

  // the strongest bid on every power goes first, so nobody is pushed by a loser
  const contests = Object.entries(wanted).map(([power, players]) => ({
    power,
    players: [...players].sort(better),
  }))
  contests.sort((a, b) => better(a.players[0], b.players[0]))

  for (const contest of contests) {
    for (const player of contest.players) {
      if (awarded[player]) continue
      const start = ladder.findIndex(p => p.id === contest.power)
      const free = ladder.slice(Math.max(0, start)).find(p => !claimed.has(p.id))
        ?? ladder.find(p => !claimed.has(p.id))
      if (!free) continue
      claimed.add(free.id)
      awarded[player] = free.id
      // only the player who actually won the power they bid on pays
      if (free.id === contest.power && contest.players[0] === player) {
        paid[player] = contest.players.length > 1 ? bids[player]!.amount : 0
        if (contest.players.length > 1) {
          notes.push(`${player} перебил ставку на ${free.name} за ${bids[player]!.amount}`)
        }
      } else {
        paid[player] = 0
        notes.push(`${player} не взял желаемое и получает ${free.name}`)
      }
    }
  }

  // silence is taken as a bid on the leftmost power still free
  for (const player of order) {
    if (awarded[player] || bids[player]) continue
    const free = ladder.find(p => !claimed.has(p.id))
    if (!free) continue
    claimed.add(free.id)
    awarded[player] = free.id
    paid[player] = 0
    notes.push(`${player} не сделал ставку и получает ${free.name}`)
  }

  return { awarded, paid, notes }
}
