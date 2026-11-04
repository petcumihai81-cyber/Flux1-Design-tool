/**
 * Memorie locală pentru planurile de fundal (IndexedDB): are spațiu mult mai mare decât localStorage (~5 MB),
 * așa că planurile mari ale mai multor niveluri se păstrează între sesiuni. Cheia este id-ul nivelului.
 */
import type { Background } from './types'

const DB = 'plansa-securitate'
const STORE = 'fundaluri'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    t.oncomplete = () => {
      db.close()
      resolve(req.result)
    }
    t.onerror = () => {
      db.close()
      reject(t.error ?? req.error)
    }
    t.onabort = () => {
      db.close()
      reject(t.error ?? new Error('Salvare întreruptă'))
    }
  })
}

export const putBackground = (levelId: string, bg: Background) => tx('readwrite', (s) => s.put(bg, levelId))
export const getBackground = (levelId: string) => tx<Background | undefined>('readonly', (s) => s.get(levelId))
export const deleteBackground = (levelId: string) => tx('readwrite', (s) => s.delete(levelId))
export const backgroundKeys = () => tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys())
