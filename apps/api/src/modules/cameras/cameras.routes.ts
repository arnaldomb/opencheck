import type { FastifyInstance } from 'fastify'
import { prisma } from '@alerta-vigia/database'
import { authMiddleware } from '../../middleware/auth.middleware.js'
import { getEzvizClient } from '../../infra/ezviz/ezviz.factory.js'
import { uploadFromUrl } from '../../infra/storage/storage.service.js'

export async function camerasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    const cameras = await prisma.camera.findMany({
      where: { tenantId, ativa: true },
      include: { ponto: { select: { id: true, nome: true } } },
    })

    // Fetch latest snapshot per camera
    const ids = cameras.map(c => c.id)
    const snapshots = await prisma.snapshot.findMany({
      where: { cameraId: { in: ids } },
      orderBy: { criadoEm: 'desc' },
      distinct: ['cameraId'],
      select: { cameraId: true, id: true, imageUrl: true },
    })
    const snapMap = new Map(snapshots.map(s => [s.cameraId, { id: s.id, imageUrl: s.imageUrl }]))

    return cameras.map(c => ({ ...c, latestSnapshot: snapMap.get(c.id) ?? null }))
  })

  // Returns { [deviceSerial]: boolean } — true = online
  app.get('/status', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    const cameras = await prisma.camera.findMany({ where: { tenantId, ativa: true }, select: { deviceSerial: true } })
    if (!cameras.length) return {}

    try {
      const client  = getEzvizClient()
      const devices = await client.getDeviceList()
      const statusMap: Record<string, boolean> = {}
      for (const cam of cameras) {
        const device = devices.find(d => d.deviceSerial === cam.deviceSerial)
        statusMap[cam.deviceSerial] = device?.status === 1
      }
      return statusMap
    } catch {
      // EZVIZ not configured — return all unknown (false)
      return Object.fromEntries(cameras.map(c => [c.deviceSerial, false]))
    }
  })

  app.post('/', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const body = request.body as { deviceSerial: string; deviceName?: string; channelNo?: number; pontoId?: string }
    const camera = await prisma.camera.create({ data: { tenantId, ...body } })
    return reply.status(201).send(camera)
  })

  // Get live HLS stream URL (protocol=3) for a camera
  app.get('/:id/stream', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }

    const camera = await prisma.camera.findFirst({ where: { id, tenantId } })
    if (!camera) return reply.status(404).send({ error: 'Câmera não encontrada' })

    try {
      const client = getEzvizClient()
      // EZVIZ: protocol=2 returns .m3u8 (HLS-compatible), protocol=3 returns RTMP
      const hlsResult  = await client.getLiveStreamUrl(camera.deviceSerial, camera.channelNo, '2')
      const rtmpResult = await client.getLiveStreamUrl(camera.deviceSerial, camera.channelNo, '3').catch(() => null)
      return { hls: hlsResult.url, rtmp: rtmpResult?.url ?? null, expireTime: hlsResult.expireTime }
    } catch (err: unknown) {
      return reply.status(502).send({ error: 'Falha ao obter stream', detail: String(err) })
    }
  })

  // Capture snapshot → upload to MinIO → save to DB
  app.post('/:id/snapshot', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }

    const camera = await prisma.camera.findFirst({ where: { id, tenantId } })
    if (!camera) return reply.status(404).send({ error: 'Câmera não encontrada' })

    const client        = getEzvizClient()
    const { picUrl }    = await client.captureSnapshot(camera.deviceSerial, camera.channelNo)
    const key           = `${tenantId}/${camera.id}/${Date.now()}.jpg`
    const imageUrl      = await uploadFromUrl(picUrl, key)

    const snapshot = await prisma.snapshot.create({ data: { cameraId: camera.id, imageUrl } })
    return snapshot
  })

  app.delete('/:id', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const camera = await prisma.camera.findFirst({ where: { id, tenantId } })
    if (!camera) return reply.status(404).send({ error: 'Câmera não encontrada' })
    await prisma.camera.update({ where: { id }, data: { ativa: false } })
    return { success: true }
  })
}
