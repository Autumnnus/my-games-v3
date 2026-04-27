export type NotificationType =
  | 'game_completed'   // actor senin de oynadığın bir oyunu tamamladı
  | 'game_reviewed'    // actor senin kütüphanende olan bir oyunu inceledi
  | 'milestone_100h'   // actor senin oynadığın oyunda 100 saat geçirdi
  | 'screenshot_added' // actor senin kütüphanendeki oyuna ekran görüntüsü ekledi

export interface NotificationActor {
  _id: string
  name: string
  profileImage?: string
}

export interface NotificationGame {
  _id: string
  title: string
  coverUrl?: string
  slug: string
}

export interface NotificationMetadata {
  review?: string
  rating?: number
  hours?: number
  screenshotCount?: number
  firstScreenshotUrl?: string
  playTimeMinutes?: number
  actorLibraryEntryId?: string // actor'ın library entry ID'si — navigasyon için
}

export interface Notification {
  _id: string
  recipient: string
  actor: NotificationActor
  type: NotificationType
  game?: NotificationGame
  metadata: NotificationMetadata
  isRead: boolean
  readAt?: string
  createdAt: string
}

export interface NotificationListResponse {
  items: Notification[]
  total: number
  unreadCount: number
  page: number
  totalPages: number
}
