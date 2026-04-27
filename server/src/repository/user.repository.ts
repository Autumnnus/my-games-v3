import User from "../models/User";

async function getUserById(id: string) {
  return await User.findById(id);
}

async function getUserByEmail(email: string) {
  return await User.findOne({ email });
}

async function findAllUsers() {
  return await User.find({}).select("-password");
}

export default { getUserById, getUserByEmail, findAllUsers };
