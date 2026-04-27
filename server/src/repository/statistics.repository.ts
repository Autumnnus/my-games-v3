import Statistics from "../models/Statistics";

async function getAllStatistics() {
  return await Statistics.findOne({ user: null });
}

async function getStatisticsById(user: string) {
  return await Statistics.findOne({ user });
}

export default { getAllStatistics, getStatisticsById };
