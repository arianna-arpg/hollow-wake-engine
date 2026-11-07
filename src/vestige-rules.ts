interface Word {categories: readonly string[]; sequence: readonly string[]}

/** Registry order is significant for custom content with overlapping recipes. */
export function matchEpitaph<W extends Word>(words: readonly W[], rarity: string, category: string,
  sockets: readonly (string|null)[]|undefined): W|undefined {
  if(rarity!=='common'||!sockets?.length||sockets.includes(null))return undefined;
  return words.find(word=>word.sequence.length===sockets.length && word.categories.includes(category) &&
    word.sequence.every((id,index)=>id===sockets[index]));
}
