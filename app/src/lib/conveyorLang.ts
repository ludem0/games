// The little language the Conveyor machines and buyers are written in. The host
// writes rules as JSON, and this evaluates them against a pip.

export type Expr =
  | number
  | 'pip'
  | { var: 'P' | 'Q' | 'R' | 'T' }
  | { op: '+' | '-' | '*' | '/' | 'mod' | 'cc'; left: Expr; right: Expr }
  | { fn: 'floor' | 'abs' | 'bin' | 'int'; of: Expr }
  | { fn: 'hcf' | 'lcm'; left: Expr; right: Expr }
  | { nth: 1 | 2 | 3 | 4 | 'last' | 'n' }

export type Cond =
  | { is: 'prime' | 'odd' | 'even' | 'square' | 'cube' | 'triangle' | 'fib' | 'lucas' | 'int'; of: Expr }
  | { cmp: '=' | '!=' | '<' | '<=' | '>' | '>='; left: Expr; right: Expr }
  | { and: Cond[] }
  | { or: Cond[] }
  | { not: Cond }
  | true

export type Outcome =
  | { set: Expr }
  | { store: 'P' | 'Q' | 'R' | 'T'; value: Expr }
  | { pass: true }

export interface Rule {
  when: Cond
  then: Outcome
}

export interface Context {
  /** the value on the pip right now */
  pip: number
  vars: Record<'P' | 'Q' | 'R' | 'T', number>
  /** which pip this is for the machine, counting from one */
  index: number
  total: number
}

// ---------- number families ----------

const isInt = (n: number): boolean => Number.isInteger(n)

export function isPrime(n: number): boolean {
  if (!isInt(n) || n < 2) return false
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false
  return true
}

export function isSquare(n: number): boolean {
  return isInt(n) && n >= 0 && isInt(Math.sqrt(n))
}

export function isCube(n: number): boolean {
  if (!isInt(n)) return false
  const root = Math.cbrt(Math.abs(n))
  return isInt(Math.round(root)) && Math.round(root) ** 3 === Math.abs(n)
}

export function isTriangle(n: number): boolean {
  if (!isInt(n) || n < 0) return false
  const root = Math.floor((Math.sqrt(8 * n + 1) - 1) / 2)
  return (root * (root + 1)) / 2 === n
}

function series(first: number, second: number, upTo: number): number[] {
  const list = [first, second]
  while (list[list.length - 1] < upTo) list.push(list[list.length - 1] + list[list.length - 2])
  return list
}

export function isFib(n: number): boolean {
  return isInt(n) && n >= 0 && series(0, 1, Math.max(n, 1)).includes(n)
}

export function isLucas(n: number): boolean {
  return isInt(n) && n >= 0 && series(2, 1, Math.max(n, 2)).includes(n)
}

export function hcf(a: number, b: number): number {
  let x = Math.abs(Math.round(a))
  let y = Math.abs(Math.round(b))
  while (y > 0) {
    const rest = x % y
    x = y
    y = rest
  }
  return x
}

export function lcm(a: number, b: number): number {
  const factor = hcf(a, b)
  return factor === 0 ? 0 : Math.abs(Math.round(a) * Math.round(b)) / factor
}

/** Sticking two numbers together, the way the rules mean concatenation. */
export function concat(a: number, b: number): number {
  return Number(`${Math.trunc(a)}${Math.abs(Math.trunc(b))}`)
}

export function toBinary(n: number): number {
  return Number(Math.abs(Math.trunc(n)).toString(2))
}

// ---------- evaluating ----------

export function evaluate(expr: Expr, ctx: Context): number {
  if (typeof expr === 'number') return expr
  if (expr === 'pip') return ctx.pip
  if ('var' in expr) return ctx.vars[expr.var]
  if ('nth' in expr) {
    if (expr.nth === 'last') return ctx.total
    if (expr.nth === 'n') return ctx.index
    return expr.nth
  }
  if ('fn' in expr) {
    switch (expr.fn) {
      case 'hcf': return hcf(evaluate(expr.left, ctx), evaluate(expr.right, ctx))
      case 'lcm': return lcm(evaluate(expr.left, ctx), evaluate(expr.right, ctx))
      case 'floor': return Math.floor(evaluate(expr.of, ctx))
      case 'abs': return Math.abs(evaluate(expr.of, ctx))
      case 'bin': return toBinary(evaluate(expr.of, ctx))
      case 'int': return Math.trunc(evaluate(expr.of, ctx))
    }
  }
  const left = evaluate(expr.left, ctx)
  const right = evaluate(expr.right, ctx)
  switch (expr.op) {
    case '+': return left + right
    case '-': return left - right
    case '*': return left * right
    case '/': return right === 0 ? left : left / right
    case 'mod': return right === 0 ? left : ((left % right) + Math.abs(right)) % Math.abs(right)
    case 'cc': return concat(left, right)
  }
}

export function test(cond: Cond, ctx: Context): boolean {
  if (cond === true) return true
  if ('and' in cond) return cond.and.every(part => test(part, ctx))
  if ('or' in cond) return cond.or.some(part => test(part, ctx))
  if ('not' in cond) return !test(cond.not, ctx)
  if ('cmp' in cond) {
    const left = evaluate(cond.left, ctx)
    const right = evaluate(cond.right, ctx)
    switch (cond.cmp) {
      case '=': return left === right
      case '!=': return left !== right
      case '<': return left < right
      case '<=': return left <= right
      case '>': return left > right
      case '>=': return left >= right
    }
  }
  const value = evaluate(cond.of, ctx)
  // a fractional pip never satisfies any of these families
  switch (cond.is) {
    case 'prime': return isPrime(value)
    case 'odd': return isInt(value) && Math.abs(value % 2) === 1
    case 'even': return isInt(value) && value % 2 === 0
    case 'square': return isSquare(value)
    case 'cube': return isCube(value)
    case 'triangle': return isTriangle(value)
    case 'fib': return isFib(value)
    case 'lucas': return isLucas(value)
    case 'int': return isInt(value)
  }
}

/**
 * Runs a machine over one pip: the rules are read top to bottom until one of
 * them produces an outcome, and a pip that matches nothing passes through.
 */
export function runMachine(rules: Rule[], ctx: Context): { pip: number; vars: Context['vars'] } {
  const vars = { ...ctx.vars }
  let pip = ctx.pip

  for (const rule of rules) {
    const local: Context = { ...ctx, pip, vars }
    if (!test(rule.when, local)) continue
    if ('store' in rule.then) {
      // storing into a variable is a process, so the machine keeps reading
      vars[rule.then.store] = evaluate(rule.then.value, local)
      continue
    }
    if ('pass' in rule.then) return { pip, vars }
    pip = evaluate(rule.then.set, local)
    return { pip, vars }
  }
  return { pip, vars }
}
