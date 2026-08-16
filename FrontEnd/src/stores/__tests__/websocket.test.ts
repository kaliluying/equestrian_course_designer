import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  sockets: [] as TestWebSocket[],
  userStore: {
    currentUser: {
      id: 7,
      username: 'owner',
      entitlements: { can_collaborate: true },
    },
  },
  courseStore: {
    currentCourse: { id: 'design-1', obstacles: [] },
  },
}))

vi.mock('@/stores/user', () => ({
  useUserStore: () => mocks.userStore,
}))

vi.mock('@/stores/course', () => ({
  useCourseStore: () => mocks.courseStore,
}))

class TestWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly url: string
  readonly sent: string[] = []
  readyState = TestWebSocket.OPEN
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  constructor(url: string) {
    this.url = url
    mocks.sockets.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close(code = 1000, reason = '') {
    this.readyState = TestWebSocket.CLOSED
    this.onclose?.({ code, reason } as CloseEvent)
  }
}

vi.stubGlobal('WebSocket', TestWebSocket)

describe('websocket store session state', () => {
  let useWebSocketStore: typeof import('@/stores/websocket').useWebSocketStore

  beforeEach(async () => {
    setActivePinia(createPinia())
    mocks.sockets.length = 0
    localStorage.clear()
    ;({ useWebSocketStore } = await import('@/stores/websocket'))
  })

  it('uses the server session returned when the connection is established', () => {
    const store = useWebSocketStore()
    store.connect('design-1')
    const socket = mocks.sockets[0]
    socket.onopen?.()

    socket.onmessage?.({
      data: JSON.stringify({
        type: 'connection_established',
        member_id: '7',
        session: {
          id: 'server-session',
          owner: '7',
          created_at: '2026-08-16T00:00:00.000Z',
          collaborators: [{
            id: '7',
            username: 'owner',
            color: '#123456',
            role: 'owner',
            last_active: '2026-08-16T00:01:00.000Z',
          }],
        },
      }),
    } as MessageEvent)

    expect(store.session?.id).toBe('server-session')
    expect(store.session?.owner).toBe('7')
    expect(store.session?.designId).toBe('design-1')
    expect(store.collaborators[0]?.lastActive.toISOString()).toBe('2026-08-16T00:01:00.000Z')
    expect(store.isOwner).toBe(true)
    expect(JSON.parse(socket.sent[0] || '{}').sessionId).toBe('server-session')
  })

  it('clears session-scoped state even when no socket remains', () => {
    const store = useWebSocketStore()
    store.session = {
      id: 'old-session',
      designId: 'old-design',
      collaborators: [],
      owner: '7',
      createdAt: new Date(),
    }
    store.collaborators = [{
      id: '7',
      username: 'owner',
      color: '#123456',
      role: 'owner',
      lastActive: new Date(),
    }]
    store.chatMessages.push({
      id: 'message-1',
      senderId: '7',
      senderName: 'owner',
      content: 'old message',
      timestamp: new Date(),
    })
    store.isOwner = true

    store.disconnect()

    expect(store.session).toBeNull()
    expect(store.collaborators).toEqual([])
    expect(store.chatMessages).toEqual([])
    expect(store.isOwner).toBe(false)
    expect(store.isCollaborating).toBe(false)
  })
})
