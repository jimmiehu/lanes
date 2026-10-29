import type { LanesApi } from './index'

declare global {
  interface Window {
    lanes: LanesApi
  }
}

export {}
