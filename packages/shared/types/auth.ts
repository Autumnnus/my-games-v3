export type AuthLoginData = {
  email: string
  password: string
}

export type AuthSignupData = {
  email: string
  name: string
  password: string
}

export type AuthForgotPasswordData = {
  email: string
}

export type AuthResetPasswordData = {
  password: string
}

export type AuthTokenResponse = {
  token: string
  user: {
    _id: string
    name: string
    email: string
    role: string
    isVerified: boolean
    profileImage: string
    gameSize: number
    completedGameSize: number
    screenshotSize: number
  }
}
