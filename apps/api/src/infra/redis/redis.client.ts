import { Redis } from 'ioredis'

const url = process.env.REDIS_URL ?? 'redis://localhost:6379'

export const redisClient = new Redis(url, { maxRetriesPerRequest: null })
export const redisConnection = { url }
