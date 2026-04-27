export type ScreenshotType = 'text' | 'image'

export type Screenshot = {
  _id: string
  name?: string
  url: string
  thumbnail?: string
  key?: string
  user: string
  libraryEntry: string
  type: ScreenshotType
  createdAt: Date
  updatedAt: Date
}

export type AddTextScreenshot = {
  name?: string
  url: string
}

export type AddImageScreenshot = {
  name?: string
  file: File
}
