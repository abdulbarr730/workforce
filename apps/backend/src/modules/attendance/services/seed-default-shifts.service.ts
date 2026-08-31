import { ShiftPolicy } from "../model/shift-policy.model";
import { User } from "../../users/model/user.model";

import { ShiftDay } from "../types/shift-days.enum";

export const seedDefaultShifts = async () => {
  const shifts = [
    {
      name: "WEEKDAY",

      description:
        "Mon-Fri shift. Login after the late cutoff automatically uses the late timing.",

      activeDays: [
        ShiftDay.MONDAY,

        ShiftDay.TUESDAY,

        ShiftDay.WEDNESDAY,

        ShiftDay.THURSDAY,

        ShiftDay.FRIDAY,
      ],

      shiftType: "REGULAR" as const,

      shiftStartTime: "10:00",

      shiftEndTime: "18:30",

      loginCutoffTime: "09:55",

      halfDayAfterTime: "12:30",

      halfDayLogoutBeforeTime: "15:00",

      absentAfterTime: "18:00",

      minimumWorkMinutes: 465,

      overtimeEnabled: true,

      overtimeAfterMinutes: 0,

      eodTriggerTime: "18:30",

      breakDeductionEnabled: true,

      defaultBreakMinutes: 45,

      isDefault: true,

      isActive: true,

      createdBy: "SYSTEM",

      updatedBy: "SYSTEM",
    },

    {
      name: "SATURDAY",

      description:
        "Saturday shift. Login after the late cutoff automatically uses the late timing.",

      activeDays: [ShiftDay.SATURDAY],

      shiftType: "REGULAR" as const,

      shiftStartTime: "09:30",

      shiftEndTime: "17:00",

      loginCutoffTime: "09:25",

      halfDayAfterTime: "12:30",

      halfDayLogoutBeforeTime: "15:00",

      absentAfterTime: "15:00",

      minimumWorkMinutes: 405,

      overtimeEnabled: true,

      overtimeAfterMinutes: 0,

      eodTriggerTime: "17:00",

      breakDeductionEnabled: true,

      defaultBreakMinutes: 45,

      isDefault: false,

      isActive: true,

      createdBy: "SYSTEM",

      updatedBy: "SYSTEM",
    },
    {
      name: "SUNDAY",

      description:
        "Sunday working shift for employees whose weekly working days include Sunday.",

      activeDays: [ShiftDay.SUNDAY],

      shiftType: "REGULAR" as const,

      shiftStartTime: "10:00",

      shiftEndTime: "18:30",

      loginCutoffTime: "09:55",

      halfDayAfterTime: "12:30",

      halfDayLogoutBeforeTime: "15:00",

      absentAfterTime: "18:00",

      minimumWorkMinutes: 465,

      overtimeEnabled: true,

      overtimeAfterMinutes: 0,

      eodTriggerTime: "18:30",

      breakDeductionEnabled: true,

      defaultBreakMinutes: 45,

      isDefault: false,

      isActive: true,

      createdBy: "SYSTEM",

      updatedBy: "SYSTEM",
    },
  ];

  for (const shift of shifts) {
    const { createdBy, ...shiftUpdate } = shift;
    await ShiftPolicy.updateOne(
      { name: shift.name },
      {
        $set: {
          ...shiftUpdate,
          updatedBy: "SYSTEM",
        },
        $setOnInsert: {
          createdBy,
        },
      },
      { upsert: true },
    );

    console.log(`${shift.name} seeded`);
  }

  const oldShifts = await ShiftPolicy.find({
    name: {
      $in: [
        "WEEKDAY_REGULAR",
        "WEEKDAY_LATE",
        "SATURDAY_REGULAR",
        "SATURDAY_LATE",
      ],
    },
  })
    .select("_id name")
    .lean();

  await ShiftPolicy.updateMany(
    {
      name: {
        $in: [
          "WEEKDAY_REGULAR",
          "WEEKDAY_LATE",
          "SATURDAY_REGULAR",
          "SATURDAY_LATE",
        ],
      },
    },
    {
      $set: {
        isActive: false,
        updatedBy: "SYSTEM",
      },
    },
  );

  const [weekdayShift, saturdayShift] = await Promise.all([
    ShiftPolicy.findOne({ name: "WEEKDAY" }).lean(),
    ShiftPolicy.findOne({ name: "SATURDAY" }).lean(),
  ]);

  const oldWeekdayShiftIds = oldShifts
    .filter((shift) => ["WEEKDAY_REGULAR", "WEEKDAY_LATE"].includes(shift.name))
    .map((shift) => String(shift._id));
  const oldSaturdayShiftIds = oldShifts
    .filter((shift) =>
      ["SATURDAY_REGULAR", "SATURDAY_LATE"].includes(shift.name),
    )
    .map((shift) => String(shift._id));

  if (weekdayShift) {
    await User.updateMany(
      {
        $or: [
          {
            assignedShiftPolicyName: {
              $in: ["WEEKDAY_REGULAR", "WEEKDAY_LATE"],
            },
          },
          { assignedShiftPolicyId: { $in: oldWeekdayShiftIds } },
        ],
      },
      {
        $set: {
          assignedShiftPolicyId: String(weekdayShift._id),
          assignedShiftPolicyName: "WEEKDAY",
        },
      },
    );
  }

  if (saturdayShift) {
    await User.updateMany(
      {
        $or: [
          {
            assignedShiftPolicyName: {
              $in: ["SATURDAY_REGULAR", "SATURDAY_LATE"],
            },
          },
          { assignedShiftPolicyId: { $in: oldSaturdayShiftIds } },
        ],
      },
      {
        $set: {
          assignedShiftPolicyId: String(saturdayShift._id),
          assignedShiftPolicyName: "SATURDAY",
        },
      },
    );
  }
};
