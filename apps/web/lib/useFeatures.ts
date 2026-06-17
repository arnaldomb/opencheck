'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from './api'

interface Features {
  camerasHabilitadas: boolean
}

const cache: { data: Features | null; ts: number } = { data: null, ts: 0 }
const CACHE_TTL = 60_000 // 1 min

export function useFeatures(): Features {
  const [features, setFeatures] = useState<Features>(
    cache.data ?? { camerasHabilitadas: true }
  )

  useEffect(() => {
    const agora = Date.now()
    if (cache.data && agora - cache.ts < CACHE_TTL) {
      setFeatures(cache.data)
      return
    }
    apiFetch<Features>('/configuracoes/features')
      .then(f => {
        cache.data = f
        cache.ts   = Date.now()
        setFeatures(f)
      })
      .catch(() => {})
  }, [])

  return features
}
