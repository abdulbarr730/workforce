import mongoose, {
  Schema
} from "mongoose";

const departmentSchema =
  new Schema(
    {
      name: {
        type: String,

        required: true,

        trim: true,

        unique: true
      },

      description: {
        type: String,

        default: ""
      },

      managerId: {
        type: String,

        default: null
      },

      isActive: {
        type: Boolean,

        default: true
      }
    },

    {
      timestamps: true
    }
  );

export const Department =
  mongoose.model(
    "Department",

    departmentSchema
  );