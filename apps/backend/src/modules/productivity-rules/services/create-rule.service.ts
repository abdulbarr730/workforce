import { ProductivityRule } from "../model/productivity-rule.model";

export const createRule = async (
  payload: any,

  userId: string,
) => {
  return await ProductivityRule.create({
    ...payload,

    createdBy: userId,

    updatedBy: userId,
  });
};
