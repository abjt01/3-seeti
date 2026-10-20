// What the phone says out loud. Built in code, so a count is never mistranslated.

export type Lang = "hi" | "en";

const ORDINAL_HI = ["", "Pehli", "Doosri", "Teesri", "Chauthi", "Paanchvi", "Chhathi", "Saatvi", "Aathvi", "Nauvi", "Dasvi", "Gyarahvi", "Barahvi"];
const ORDINAL_EN = ["", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth"];
const COUNT_HI = ["", "ek", "do", "teen", "chaar", "paanch", "chhe", "saat", "aath", "nau", "das", "gyarah", "barah"];

const ordinal = (n: number, lang: Lang) => (lang === "hi" ? ORDINAL_HI[n] : ORDINAL_EN[n]) || (lang === "hi" ? `${n} number ki` : `Whistle ${n}`);

export function whistleLine(n: number, target: number, lang: Lang): string {
  if (n >= target) {
    return lang === "hi" ? `${ordinal(n, lang)} seeti. Gas band kar do!` : `${ordinal(n, lang)} whistle. Turn off the gas!`;
  }
  const left = target - n;
  if (lang === "hi") return `${ordinal(n, lang)} seeti. ${left === 1 ? "Bas ek aur." : `${COUNT_HI[left] || left} aur.`}`;
  return `${ordinal(n, lang)} whistle. ${left === 1 ? "One more to go." : `${left} more to go.`}`;
}

export function simmerLine(minutes: number, lang: Lang): string {
  return lang === "hi" ? `Ab gas dheemi karke ${minutes} minute pakne do.` : `Now turn the flame down low for ${minutes} minutes.`;
}

export function simmerDoneLine(lang: Lang): string {
  return lang === "hi" ? "Ho gaya. Ab gas band kar do!" : "Done. Turn off the gas!";
}

export function kettleLine(lang: Lang): string {
  return lang === "hi" ? "Yeh kettle lag rahi hai, ise nahi gina." : "That sounded like a kettle. Not counting it.";
}

export function steadyLine(lang: Lang): string {
  return lang === "hi"
    ? "Yeh cooker lagataar seeti de raha hai. Seeti alag alag na ho to gas thodi kam karo."
    : "The cooker is hissing non-stop. If the whistles don't come apart, turn the flame down a little.";
}

export function startLine(target: number, dish: string, lang: Lang): string {
  return lang === "hi" ? `Theek hai. ${dish}, ${COUNT_HI[target] || target} seeti. Main sun raha hoon.` : `Okay. ${dish}, ${target} whistles. I'm listening.`;
}
