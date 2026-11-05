
import {Random} from './random.js';
import {copy,freeze} from './validation.js';

export interface RuneLetter {readonly letter: string; readonly rune: string; readonly name: string}

/** Immutable alphabet and instance-owned lookup tables. Reveal order uses a
 * phrase-local stream and never consumes gameplay randomness. */
export class RuneScript {
  readonly alphabet: readonly RuneLetter[];
  readonly #letters = new Map<string, RuneLetter>();
  readonly #runes = new Map<string, RuneLetter>();
  readonly #digraphs: readonly RuneLetter[];

  constructor(input: readonly RuneLetter[]) {
    if (!Array.isArray(input) || input.length === 0) throw new Error('A rune alphabet is required');
    const alphabet = copy(input);
    for (const row of alphabet) {
      if (!row || typeof row !== 'object' || Object.keys(row).some(key => !['letter','rune','name'].includes(key))
        || typeof row.letter !== 'string' || !row.letter || row.letter !== row.letter.toLowerCase()
        || typeof row.rune !== 'string' || [...row.rune].length !== 1 || typeof row.name !== 'string'
        || this.#letters.has(row.letter) || this.#runes.has(row.rune)) throw new Error('Invalid or duplicate rune letter');
      this.#letters.set(row.letter, row); this.#runes.set(row.rune, row);
    }
    this.alphabet = freeze(alphabet);
    this.#digraphs = Object.freeze(alphabet.filter(row => row.letter.length > 1).sort((a,b) => b.letter.length-a.letter.length));
    Object.freeze(this);
  }
  runeOf(letter: string): string | undefined { return this.#letters.get(letter.toLowerCase())?.rune; }
  runeLetterOf(rune: string): string | undefined { return this.#runes.get(rune)?.letter; }
  runeLetterRow(letter: string): RuneLetter | undefined { return this.#letters.get(letter.toLowerCase()); }
  isRune(character: string): boolean { return this.#runes.has(character); }
  encipher(text: string): string {
    const source = text.toLowerCase(); let output = '';
    for (let i=0;i<source.length;) {
      let matched: RuneLetter | undefined;
      for (const row of this.#digraphs) if (source.startsWith(row.letter,i)) { matched=row;break; }
      if (matched) { output+=matched.rune;i+=matched.letter.length;continue; }
      output+=this.#letters.get(source[i])?.rune??source[i]; i++;
    }
    return output;
  }
  decipher(text: string): string {
    let output=''; for (const rune of text) output+=this.#runes.get(rune)?.letter??rune; return output;
  }
  reveal(text: string, fraction: number): string {
    if (fraction>=1) return text;
    const runes=[...this.encipher(text)], order:number[]=[];
    for (let i=0;i<runes.length;i++) if(this.#runes.has(runes[i]))order.push(i);
    const count=order.length;
    const clear=fraction>0?Math.min(count-1,Math.max(1,Math.floor(count*fraction))):0;
    if(clear<=0)return runes.join('');
    let seed=0x811c9dc5;
    for(const rune of runes)seed=Math.imul(seed^rune.codePointAt(0)!,0x01000193);
    const random=new Random(seed>>>0);
    for(let i=count-1;i>0;i--){
      const j=Math.floor(random.next()*(i+1));[order[i],order[j]]=[order[j],order[i]];
    }
    for(let j=0;j<clear;j++){const i=order[j];runes[i]=this.#runes.get(runes[i])!.letter;}
    return runes.join('');
  }
}
