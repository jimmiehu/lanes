// WHAT COUNTS AS A MATCH — the one rule, proved on the case that exposed it.
//
// `vienna facts` returned nothing at all. Not the note actually called "Vienna
// water — historical facts for the river essay", whose title holds both words
// in the wrong order; not the bodies that say them a sentence apart. Four
// things searched in this app and each had its own answer: the palette did one
// `includes` of the whole query, the note index folded diacritics and had a
// word rung, the body scan and the transcript scan took the query as one
// literal string. So `cafe` found Café in a body and not in a title, and two
// words in the wrong order found nothing anywhere.
//
// A pure module, so this runs under node rather than against the app:
//
//   node --experimental-strip-types checks/find-rule.mjs
import { fold, parseQuery, rank, hitAt, PHRASE, WORDS } from '../src/shared/find.ts'

let failed = 0
const is = (got, want, what) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) {
    failed++
    console.log(`  ✗ ${what}\n      got ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`)
  }
  return ok
}

/* ---------- the fold ---------- */

is(fold('Noël'), 'noel', 'Noël folds to noel')
is(fold('Coșuri'), 'cosuri', 'Coșuri folds')
is(fold('Čevapčići'), 'cevapcici', 'Čevapčići folds')
is(fold('Gartenstraße'), 'gartenstraße', 'ß is not a diacritic and survives as itself')
is(fold('VIENNA'), 'vienna', 'case goes')

/* ---------- the query ---------- */

is(parseQuery('  Vienna   Facts  ').terms, ['vienna', 'facts'], 'words split, whitespace collapsed')
is(parseQuery('  Vienna   Facts  ').phrase, 'vienna facts', 'the phrase keeps single spaces')
is(parseQuery('   ').empty, true, 'blank is empty')
is(parseQuery('').terms, [], 'nothing is no words')

/* ---------- THE CASE ---------- */

const title = fold('Vienna water — historical facts for the river essay')
is(rank(parseQuery('vienna facts'), title), WORDS, 'vienna facts finds the note it was typed for')
is(rank(parseQuery('vienna water'), title), PHRASE, 'and the phrase still outranks it')
is(rank(parseQuery('vien facts'), title), WORDS, 'each word is a substring, so a stem works')
is(rank(parseQuery('facts vienna'), title), WORDS, 'order does not matter on the words rung')
is(rank(parseQuery('vienna oslo'), title), 0, 'a word that is not there is still a no')

/* ---------- the phrase rung is unchanged ---------- */

const slug = fold('projects/Garden/companion-planting-map.md')
// The old rule needed the hyphen typed: `companion-plant` matched the slug
// mid-word and `companion plant` — the same thing said with a space, which is
// how anybody types it — matched nothing. Both work now, by different rungs.
is(rank(parseQuery('companion-plant'), slug), PHRASE, 'the hyphenated phrase matches mid-word')
is(rank(parseQuery('companion plant'), slug), WORDS, 'and the spaced one gets there on words')
is(rank(parseQuery('map companion'), slug), WORDS, 'in any order')
is(rank(parseQuery('companion vienna'), slug), 0, 'but every word still has to be there')

/* ---------- one word: the two rungs are the same test ---------- */

is(rank(parseQuery('vienna'), title), PHRASE, 'one word is a phrase')
is(rank(parseQuery('zzz'), title), 0, 'and a wrong one is nothing')

/* ---------- diacritics, on BOTH sides ---------- */

const cafe = fold('Café hours — what I read where')
is(rank(parseQuery('cafe'), cafe), PHRASE, 'typing without the accent finds it')
is(rank(parseQuery('Café'), cafe), PHRASE, 'and typing with it does too')
is(rank(parseQuery('where cafe'), cafe), WORDS, 'both words, folded, in any order')

/* ---------- where the snippet points ---------- */

const body = fold('A line that says water early and Schönbrunn much later on.')
// The longest word leads, because it is the specific one — pointing the snippet
// at `water` here would show the reader the least informative half of the hit.
is(
  hitAt(parseQuery('water schonbrunn'), body),
  body.indexOf('schonbrunn'),
  'the LONGEST word leads the snippet'
)
is(hitAt(parseQuery('much later'), body), body.indexOf('much later'), 'a phrase points at itself')

/*
 * NO THIRD RUNG. Fuzzy subsequence matching is the usual next step and is
 * deliberately not taken: on a vault of real size it returns something for
 * every query, which makes an empty result impossible and a result therefore
 * meaningless.
 */
is(rank(parseQuery('vfacts'), title), 0, 'a subsequence is not a match')
is(rank(parseQuery('vnna'), title), 0, 'nor are dropped letters')

console.log(failed ? `\n${failed} failed` : '\nall find-rule assertions hold')
process.exit(failed ? 1 : 0)
