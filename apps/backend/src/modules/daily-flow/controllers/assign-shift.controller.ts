import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { User } from "../../users/model/user.model";
import { WorkSession } from "../../work-sessions/model/work-session.model";
import { ShiftPolicy } from "../../attendance/model/shift-policy.model";

export const assignShiftController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setUTCHours(23, 59, 59, 999);

    let session = await WorkSession.findOne({ 
      employeeId, 
      loginAt: { $gte: startOfDay, $lte: endOfDay }
    }).sort({ loginAt: 1 }).lean();

    const user = await User.findOne({ employeeId }).lean();
    if (!user) throw new AppError("User not found", 404);

    if (!session) {
      session = await WorkSession.create({
        employeeId: user.employeeId,
        employeeName: (user as any).name,
        departmentId: (user as any).departmentId || null,
        departmentName: (user as any).departmentName || null,
        loginAt: new Date(),
        status: "ACTIVE"
      }) as any;
    }

    const exactLoginTime = session?.loginAt ? new Date(session.loginAt) : new Date();

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short'
    });
    const parts = formatter.formatToParts(exactLoginTime);
    const hourStr = parts.find(p => p.type === 'hour')?.value || "00";
    const minStr = parts.find(p => p.type === 'minute')?.value || "00";
    const weekday = parts.find(p => p.type === 'weekday')?.value || "Mon";
    
    const timeVal = parseInt(hourStr, 10) * 60 + parseInt(minStr, 10);
    // Determine applied shift policy
    let policy = null;
    if ((user as any).assignedShiftPolicyId) {
      policy = await ShiftPolicy.findById((user as any).assignedShiftPolicyId).lean();
    }
    
    // Fallback to the default policy if none explicitly assigned
    if (!policy) {
      policy = await ShiftPolicy.findOne({ isDefault: true }).lean();
    }

    // Determine half day status
    let isHalfDay = false;
    if (policy) {
      if ((policy as any).shiftType === 'HALF_DAY') {
        isHalfDay = true;
      } else if ((policy as any).halfDayAfterTime) {
        const [hh, mm] = ((policy as any).halfDayAfterTime as string).split(":");
        const hdMins = Number(hh) * 60 + Number(mm);
        if (timeVal >= hdMins) {
          isHalfDay = true;
        }
      }
    }
    
    // Fallback to the default policy if none explicitly assigned
    if (!policy) {
      policy = await ShiftPolicy.findOne({ isDefault: true }).lean();
    }

    let assignedShift = "No Shift Assigned";
    let shiftStartTime = "00:00";
    let shiftEndTime = "00:00";
    let isLate = false;

    if (policy) {
      const formatName = (name: string) => name.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      assignedShift = formatName((policy as any).name || "Regular Shift");
      shiftStartTime = (policy as any).shiftStartTime || "00:00";
      
      if (isHalfDay) {
        shiftEndTime = weekday === "Sat" ? "17:00" : "18:30";
      } else {
        shiftEndTime = (policy as any).shiftEndTime || "18:30";
      }

      // Late logic check
      if (!isHalfDay && (policy as any).loginCutoffTime) {
        const [ch, cm] = ((policy as any).loginCutoffTime as string).split(":");
        const cutoffMins = Number(ch) * 60 + Number(cm);
        if (timeVal > cutoffMins) {
          isLate = true;
          
          // If late entry, shift the timings by 30 mins
          let [sh, sm] = shiftStartTime.split(":").map(Number);
          sm += 30;
          if (sm >= 60) { sh += 1; sm -= 60; }
          shiftStartTime = `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}`;

          let [eh, em] = shiftEndTime.split(":").map(Number);
          em += 30;
          if (em >= 60) { eh += 1; em -= 60; }
          shiftEndTime = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
        }
      }
    }
    
    res.json(
      successResponse(
        {
          shift: `${shiftStartTime} to ${shiftEndTime} (${assignedShift})`,
          shiftEndTime,
          isLate,
          isHalfDay,
          loginTime: `${hourStr}:${minStr}`,
          weekday
        },
        "Shift assigned successfully"
      )
    );
  }
);
