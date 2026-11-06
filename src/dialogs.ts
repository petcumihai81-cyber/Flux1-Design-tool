/**
 * Ferestrele aplicației în locul celor ale browserului (`prompt` / `confirm` / `alert`):
 * `askText`, `askConfirm`, `showAlert` se pot apela de oriunde și întorc o promisiune;
 * `<DialogHost />` (montat o dată, în App) le afișează, una câte una.
 */

export type Req =
  | { kind: 'text'; title: string; label?: string; value: string; placeholder?: string; multiline?: boolean; okLabel?: string; resolve: (v: string | null) => void }
  | { kind: 'confirm'; title: string; message: string; okLabel?: string; danger?: boolean; resolve: (v: boolean) => void }
  | { kind: 'alert'; title: string; message: string; resolve: () => void }

let queue: Req[] = []
let listener: ((q: Req[]) => void) | null = null
const push = (r: Req) => {
  queue = [...queue, r]
  listener?.(queue)
}

/** Pentru DialogHost: fereastra curentă s-a închis */
export const popDialog = () => {
  queue = queue.slice(1)
  listener?.(queue)
}

/** Pentru DialogHost: ascultă coada de ferestre */
export function subscribeDialogs(fn: ((q: Req[]) => void) | null): Req[] {
  listener = fn
  return queue
}

/** Cere un text (null = Renunță) */
export function askText(
  title: string,
  opts: { label?: string; value?: string; placeholder?: string; multiline?: boolean; okLabel?: string } = {},
): Promise<string | null> {
  return new Promise((resolve) => push({ kind: 'text', title, value: opts.value ?? '', ...opts, resolve }))
}

/** Cere o confirmare (true = da) */
export function askConfirm(message: string, opts: { title?: string; okLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => push({ kind: 'confirm', title: opts.title ?? 'Confirmare', message, okLabel: opts.okLabel, danger: opts.danger, resolve }))
}

/** Un mesaj care trebuie citit (cu „OK”) */
export function showAlert(message: string, title = 'Atenție'): Promise<void> {
  return new Promise((resolve) => push({ kind: 'alert', title, message, resolve }))
}
