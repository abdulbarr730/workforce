import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { errorMiddleware } from "./shared/middlwares/error.middleware";
import authRoutes from "./modules/auth/routes/auth.routes";
import userRoutes from "./modules/users/routes/user.routes";
import trackingRoutes from "./modules/tracking/routes/tracking.routes";
import productivityRuleRoutes from "./modules/productivity-rules/routes/productivity-rule.routes";
import analyticsRoutes from "./modules/analytics/routes/analytics.routes";
import departmentRoutes from "./modules/departments/routes/department.routes";
import meRoutes from "./modules/me/routes/me.routes";
import workSessionRoutes from "./modules/work-sessions/routes/work-session.routes";

import { attendanceRoutes } from "./modules/attendance/routes"; // CORRECT

const app = express();

app.use(express.json());

app.use(cors());

app.use(helmet());

app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Backend running"
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tracking", trackingRoutes);
app.use("/api/productivity-rules", productivityRuleRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/me", meRoutes);
app.use("/api/work-sessions", workSessionRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use(errorMiddleware);


export default app;