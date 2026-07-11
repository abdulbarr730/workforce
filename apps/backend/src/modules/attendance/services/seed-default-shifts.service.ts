import { ShiftPolicy } from "../model/shift-policy.model";

import { ShiftDay } from "../types/shift-days.enum";

export const seedDefaultShifts = async () => {
  const shifts = [
    /*
        WEEKDAY REGULAR
      */

    {
      name: "WEEKDAY_REGULAR",

      description: "Mon-Fri regular shift",

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

      /*
          Login BEFORE 9:55
        */

      loginCutoffTime: "09:55",

      halfDayAfterTime: "12:30",

      absentAfterTime: "15:00",

      minimumWorkMinutes: 480,

      overtimeEnabled: true,

      overtimeAfterMinutes: 510,

      eodTriggerTime: "18:30",

      breakDeductionEnabled: false,

      defaultBreakMinutes: 45,

      isDefault: true,

      isActive: true,

      createdBy: "SYSTEM",

      updatedBy: "SYSTEM",
    },

    /*
        WEEKDAY LATE
      */

    {
      name: "WEEKDAY_LATE",

      description: "Mon-Fri late shift",

      activeDays: [
        ShiftDay.MONDAY,

        ShiftDay.TUESDAY,

        ShiftDay.WEDNESDAY,

        ShiftDay.THURSDAY,

        ShiftDay.FRIDAY,
      ],

      shiftType: "LATE" as const,

      shiftStartTime: "10:30",

      shiftEndTime: "19:00",

      /*
          Applies AFTER 9:55
        */

      loginCutoffTime: "09:56",

      halfDayAfterTime: "12:30",

      absentAfterTime: "15:00",

      minimumWorkMinutes: 480,

      overtimeEnabled: true,

      overtimeAfterMinutes: 510,

      eodTriggerTime: "19:00",

      breakDeductionEnabled: false,

      defaultBreakMinutes: 45,

      isDefault: false,

      isActive: true,

      createdBy: "SYSTEM",

      updatedBy: "SYSTEM",
    },

    /*
        SATURDAY REGULAR
      */

    {
      name: "SATURDAY_REGULAR",

      description: "Saturday regular shift",

      activeDays: [ShiftDay.SATURDAY],

      shiftType: "REGULAR" as const,

      shiftStartTime: "09:30",

      shiftEndTime: "17:00",

      /*
          Login BEFORE 9:25
        */

      loginCutoffTime: "09:25",

      halfDayAfterTime: "12:30",

      absentAfterTime: "15:00",

      minimumWorkMinutes: 450,

      overtimeEnabled: true,

      overtimeAfterMinutes: 450,

      eodTriggerTime: "17:00",

      breakDeductionEnabled: false,

      defaultBreakMinutes: 45,

      isDefault: false,

      isActive: true,

      createdBy: "SYSTEM",

      updatedBy: "SYSTEM",
    },

    /*
        SATURDAY LATE
      */

    {
      name: "SATURDAY_LATE",

      description: "Saturday late shift",

      activeDays: [ShiftDay.SATURDAY],

      shiftType: "LATE" as const,

      shiftStartTime: "10:00",

      shiftEndTime: "17:30",

      /*
          Applies AFTER 9:25
        */

      loginCutoffTime: "09:26",

      halfDayAfterTime: "12:30",

      absentAfterTime: "15:00",

      minimumWorkMinutes: 450,

      overtimeEnabled: true,

      overtimeAfterMinutes: 450,

      eodTriggerTime: "17:30",

      breakDeductionEnabled: false,

      defaultBreakMinutes: 45,

      isDefault: false,

      isActive: true,

      createdBy: "SYSTEM",

      updatedBy: "SYSTEM",
    },
  ];

  for (const shift of shifts) {
    const existing = await ShiftPolicy.findOne({
      name: shift.name,
    });

    if (!existing) {
      await ShiftPolicy.create(shift);

      console.log(`${shift.name} seeded`);
    }
  }
};
