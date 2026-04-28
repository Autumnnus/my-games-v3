export type Platform =
  | 'steam'
  | 'epicGames'
  | 'ubisoft'
  | 'xboxPc'
  | 'eaGames'
  | 'torrent'
  | 'playstation'
  | 'xboxSeries'
  | 'nintendo'
  | 'mobile'
  | 'otherPlatforms'

export type GameStatus = 'completed' | 'abandoned' | 'toBeCompleted' | 'activePlaying'

export type IGDBCompany = {
  id: number
  name: string
}

export type IGDBData = {
  id: number
  name?: string
  cover?: { id: number; url: string; game: number }
  aggregated_rating?: number
  aggregated_rating_count?: number
  first_release_date?: number
  category?: number
  game_modes?: { id: number; name: string }[]
  genres?: { id: number; name: string }[]
  involved_companies?: {
    id: number
    company: IGDBCompany
    developer: boolean
    publisher: boolean
  }[]
  player_perspectives?: { id: number; name: string }[]
  release_dates?: { id: number; date: number }[]
  themes?: { id: number; name: string }[]
}

export type GameSourceIds = {
  igdbId?: number
  steamAppId?: number
}

export type GameMetadata = {
  igdb?: IGDBData
}

export type Game = {
  _id: string
  title: string
  slug: string
  coverUrl?: string
  sourceIds?: GameSourceIds
  metadata?: GameMetadata
  createdAt: Date
  updatedAt: Date
}

export type LibraryEntry = {
  _id: string
  user: string
  game: string | Game
  platform: Platform
  status: GameStatus
  rating?: number
  review?: string
  playTimeMinutes: number
  lastPlayedAt: Date
  lastPlayDate?: Date
  firstCompletedAt?: Date
  completionDate?: Date | null
  isFavorite: boolean
  screenshotCount: number
  legacyGameId?: string
  createdAt: Date
  updatedAt: Date
}

export type GamesData = {
  _id: string
  name: string
  photo?: string
  lastPlay: Date
  platform: Platform
  review?: string
  rating?: number
  status: GameStatus
  playTime: number
  screenshotSize: number
  userId: string
  isFavorite: boolean
  firstFinished?: Date
  slug: string
  igdb?: IGDBData
  createdAt: Date
  updatedAt: Date
}

export type GameWithLibraryEntry = GamesData & {
  title: string
  coverUrl?: string
  game: Game
  libraryEntry: LibraryEntry
}

export type FavoriteGamesData = {
  _id: string
  name: string
  rating?: number
  photo?: string
}

export type CreateLibraryEntryInput = {
  name: string
  photo?: string
  lastPlay?: Date
  platform: Platform
  review?: string
  rating?: number
  status: GameStatus
  playTime: number
  firstFinished?: Date
  igdb?: IGDBData
  steamAppId?: number
}

export type UpdateLibraryEntryInput = Partial<CreateLibraryEntryInput>

export type AddGameData = CreateLibraryEntryInput

export type EditGameData = UpdateLibraryEntryInput

export type GetUserGamesParams = {
  userId: string
  sortBy?: string
  order?: 'asc' | 'desc'
  search?: string
  page?: number
  limit?: number
}
