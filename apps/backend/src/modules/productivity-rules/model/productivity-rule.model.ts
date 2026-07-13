import mongoose, { Schema } from "mongoose";

export enum ScopeType {
  GLOBAL = "GLOBAL",

  DEPARTMENT = "DEPARTMENT",

  ROLE = "ROLE",

  EMPLOYEE = "EMPLOYEE",
}

export enum ProductivityCategory {
  PRODUCTIVE = "PRODUCTIVE",

  UNPRODUCTIVE = "UNPRODUCTIVE",

  NEUTRAL = "NEUTRAL",
}

const productivityRuleSchema = new Schema(
  {
    // companyId removed as it's a single tenant app

    scopeType: {
      type: String,

      enum: Object.values(ScopeType),

      required: true,
    },

    scopeId: {
      type: String,

      default: null,
    },

    appName: {
      type: String,

      required: true,

      trim: true,
    },

    titlePattern: {
      type: String,

      default: null,
    },

    productivityCategory: {
      type: String,

      enum: Object.values(ProductivityCategory),

      required: true,
    },

    productivityScore: {
      type: Number,
      min: 0,
      max: 1,
      required: true,
    },

    allowanceMinutes: {
      type: Number,
      default: 30,
    },

    createdBy: {
      type: String,

      required: true,
    },

    updatedBy: {
      type: String,

      required: true,
    },
  },

  {
    timestamps: true,
  },
);

export const ProductivityRule = mongoose.model(
  "ProductivityRule",

  productivityRuleSchema,
);
