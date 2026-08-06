import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// ENABLE word list (public domain), the usual stand-in for the Scrabble dictionary.
const WORDS_PATH = join(process.cwd(), 'data', 'enable1.txt')

let words: Set<string> | null = null

function load(): Set<string> {
  if (words) return words
  if (!existsSync(WORDS_PATH)) {
    words = new Set()
    return words
  }
  words = new Set(
    readFileSync(WORDS_PATH, 'utf-8')
      .split('\n')
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length >= 3),
  )
  return words
}

export function isValidWord(word: string): boolean {
  return load().has(word.trim().toLowerCase())
}

export function dictionaryLoaded(): boolean {
  return load().size > 0
}
