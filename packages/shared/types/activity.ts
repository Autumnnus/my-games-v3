export type ActivityType =
  | 'game_added'
  | 'game_completed'
  | 'game_abandoned'
  | 'status_changed'
  | 'game_rated'
  | 'game_reviewed'
  | 'screenshot_added'
  | 'game_favorited'
  | 'steam_synced'
  | 'milestone_playtime'

export interface ActivityMetadata {
  platform?: string
  status?: string
  fromStatus?: string
  toStatus?: string
  rating?: number
  review?: string
  screenshotCount?: number
  firstScreenshotUrl?: string
  gamesAdded?: number
  gamesUpdated?: number
  hours?: number
  playTimeMinutes?: number
}

export interface ActivityUser {
  _id: string
  name: string
  profileImage?: string
}

export interface ActivityGame {
  _id: string
  title: string
  coverUrl?: string
  slug: string
}

export interface Activity {
  _id: string
  user: ActivityUser
  type: ActivityType
  game?: ActivityGame
  libraryEntry?: string
  metadata: ActivityMetadata
  createdAt: string
  updatedAt: string
}

export interface ActivityFeedResponse {
  items: Activity[]
  total: number
  page: number
  totalPages: number
}
