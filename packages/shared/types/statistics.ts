export type StatisticData = {
  _id: string
  playTime: number
  count: number
  averageRating?: number
}

export type Statistics = {
  platformStats: StatisticData[]
  statusStats: StatisticData[]
  genreStats: StatisticData[]
  developerStats: StatisticData[]
  publisherStats: StatisticData[]
  gameModeStats: StatisticData[]
  myGamesRatingStats: StatisticData[]
  ratingStats: StatisticData[]
  themeStats: StatisticData[]
  releaseYearStats: StatisticData[]
  playerPerspectiveStats: StatisticData[]
}

export type StatisticsData = {
  _id: string
  statistics: Statistics
  user?: string
  createdAt: Date
  updatedAt: Date
}

export type UserStatisticsSummary = {
  totalGames: number
  totalPlayTime: number
  avgRating: number
  completedCount: number
  playingCount: number
  backlogCount: number
  droppedCount: number
}

export type UserStatisticsPlatform = {
  platform: string
  count: number
  playTime: number
}

export type UserStatisticsGenre = {
  genre: string
  count: number
}

export type UserStatisticsRating = {
  range: string
  count: number
}

export type UserStatisticsMonthly = {
  month: string
  count: number
}

export type UserAggregateStatistics = {
  summary: UserStatisticsSummary
  platformStats: UserStatisticsPlatform[]
  genreStats: UserStatisticsGenre[]
  ratingStats: UserStatisticsRating[]
  monthlyCompletions: UserStatisticsMonthly[]
}
