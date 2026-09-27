import { relations } from "drizzle-orm";
import { chatMessages, chatThreads } from "./ai";
import { user } from "./auth";
import { games, gameTerms, terms } from "./catalog";
import { libraryEntries, screenshots } from "./library";
import { activities, comments, notifications } from "./social";
import { changeProposals, playSessions, steamAccounts } from "./sync";

export const gamesRelations = relations(games, ({ many }) => ({
  entries: many(libraryEntries),
  terms: many(gameTerms),
}));

export const termsRelations = relations(terms, ({ many }) => ({
  games: many(gameTerms),
}));

export const gameTermsRelations = relations(gameTerms, ({ one }) => ({
  game: one(games, { fields: [gameTerms.gameId], references: [games.id] }),
  term: one(terms, { fields: [gameTerms.termId], references: [terms.id] }),
}));

export const libraryEntriesRelations = relations(libraryEntries, ({ one, many }) => ({
  user: one(user, { fields: [libraryEntries.userId], references: [user.id] }),
  game: one(games, { fields: [libraryEntries.gameId], references: [games.id] }),
  screenshots: many(screenshots),
}));

export const screenshotsRelations = relations(screenshots, ({ one }) => ({
  entry: one(libraryEntries, { fields: [screenshots.entryId], references: [libraryEntries.id] }),
  user: one(user, { fields: [screenshots.userId], references: [user.id] }),
  game: one(games, { fields: [screenshots.gameId], references: [games.id] }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  actor: one(user, { fields: [activities.actorId], references: [user.id] }),
  game: one(games, { fields: [activities.gameId], references: [games.id] }),
  entry: one(libraryEntries, { fields: [activities.entryId], references: [libraryEntries.id] }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  author: one(user, { fields: [comments.authorId], references: [user.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  recipient: one(user, { fields: [notifications.recipientId], references: [user.id] }),
}));

export const changeProposalsRelations = relations(changeProposals, ({ one }) => ({
  entry: one(libraryEntries, {
    fields: [changeProposals.entryId],
    references: [libraryEntries.id],
  }),
  game: one(games, { fields: [changeProposals.gameId], references: [games.id] }),
}));

export const steamAccountsRelations = relations(steamAccounts, ({ one }) => ({
  user: one(user, { fields: [steamAccounts.userId], references: [user.id] }),
}));

export const playSessionsRelations = relations(playSessions, ({ one }) => ({
  game: one(games, { fields: [playSessions.gameId], references: [games.id] }),
}));

export const chatThreadsRelations = relations(chatThreads, ({ many }) => ({
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  thread: one(chatThreads, { fields: [chatMessages.threadId], references: [chatThreads.id] }),
}));
