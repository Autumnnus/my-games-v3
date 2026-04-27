export type UserRole = 'user' | 'admin' | 'vip'

export type UsersData = {
  _id: string
  name: string
  email: string
  role: UserRole
  isVerified: boolean
  profileImage: string
  gameSize: number
  completedGameSize: number
  screenshotSize: number
  favoriteGames: string[]
  createdAt: Date
  updatedAt: Date
}

export type EditUserData = {
  name?: string
  password?: string
  profileImage?: string
}
