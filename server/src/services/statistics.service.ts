import Statistics from "../models/Statistics";
import gameRepository from "../repository/game.repository";
import statisticsRepository from "../repository/statistics.repository";
import userRepository from "../repository/user.repository";

async function getStatisticsService() {
  return await statisticsRepository.getAllStatistics();
}

async function getUserStatisticsService(userId: string) {
  return await statisticsRepository.getStatisticsById(userId);
}

async function updateStatisticsService() {
  const users = await userRepository.findAllUsers();
  const updated = [];

  for (const user of users) {
    const statistics = await gameRepository.getGameStatistics(
      user._id.toString(),
    );
    if (statistics) {
      const data = await Statistics.findOneAndUpdate(
        { user: user._id },
        { statistics },
        { upsert: true, new: true },
      );
      updated.push(data);
    }
  }

  const overall = await gameRepository.getGameStatistics();
  if (overall) {
    const data = await Statistics.findOneAndUpdate(
      { user: undefined },
      { statistics: overall },
      { upsert: true, new: true },
    );
    updated.push(data);
  }

  return updated;
}

export default {
  getStatisticsService,
  getUserStatisticsService,
  updateStatisticsService,
};
