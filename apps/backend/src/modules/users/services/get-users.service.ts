import { User } from "../model/user.model";

export const getUsers = async () => {
  return User.find().select("-password");
};
