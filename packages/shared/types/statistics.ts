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
