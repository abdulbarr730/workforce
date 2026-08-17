export type WelcomeCallDistributionMode =
  | "EQUAL"
  | "WEIGHTED"
  | "ALTERNATE_DAYS";
export type WelcomeCallPatternDuration = "WEEK" | "MONTH" | "UNTIL_CHANGED";
export type WelcomeCallReminderFrequency = "DAILY" | "ONCE";
export type WelcomeCallAllocationMode = "IMMEDIATE" | "SCHEDULED";
export type WelcomeCallStatus =
  | "UNASSIGNED"
  | "PENDING"
  | "CONNECTED"
  | "NOT_CONNECTED"
  | "CALLBACK"
  | "WRONG_NUMBER"
  | "DO_NOT_CALL";
export type WelcomeCallOutcome = Exclude<
  WelcomeCallStatus,
  "UNASSIGNED" | "PENDING"
>;

export type WelcomeCallMemberRule = {
  employeeId: string;
  employeeName: string;
  departmentId?: string | null;
  departmentName?: string | null;
  enabled: boolean;
  eligibleWeekdays: string[];
  weight: number;
  dailyCap?: number | null;
};

export type WelcomeCallCampaign = {
  _id: string;
  key: string;
  name: string;
  webinarTitle: string;
  webinarRecurrence: "WEEKLY";
  registrationAmount: number;
  currency: string;
  isActive: boolean;
  distributionMode: WelcomeCallDistributionMode;
  patternDuration: WelcomeCallPatternDuration;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  responsiblePeople: Array<{ employeeId: string; employeeName: string }>;
  memberRules: WelcomeCallMemberRule[];
  excludedDepartmentIds: string[];
  outcomeOptions: WelcomeCallOutcome[];
  customColumns?: Array<{
    key: string;
    label: string;
    options: string[];
    optionColors?: Record<string, string>;
  }>;
  nextAllocationEmployeeIds?: string[];
  scheduleState?: {
    lastUnavailableMembers?: Array<{
      employeeId: string;
      employeeName: string;
      reason: "NOT_PRESENT" | "ON_LEAVE" | "HOLIDAY";
    }>;
    lastAllocationAt?: string | null;
  };
  allocationSchedule: {
    mode: WelcomeCallAllocationMode;
    dailyTime: string;
    timezone: string;
    requireAgentPresence: boolean;
    weeklyRunTimes: Array<{ weekday: string; time: string }>;
    webinarCutoff: {
      enabled: boolean;
      weekday: string;
      time: string;
    };
    postWebinarImmediate: {
      enabled: boolean;
      startTime: string;
      memberEmployeeIds: string[];
    };
  };
  redistribution: {
    enabled: boolean;
    afterDays: number;
    excludePreviousAssignee: boolean;
  };
  reminder: {
    enabled: boolean;
    time: string;
    frequency: WelcomeCallReminderFrequency;
  };
  revision: number;
  updatedAt: string;
};

export type WelcomeCallAttempt = {
  employeeId: string;
  employeeName: string;
  outcome: WelcomeCallOutcome;
  notes?: string;
  calledAt: string;
  nextCallAt?: string | null;
};

export type WelcomeCallAssignment = {
  employeeId: string;
  employeeName: string;
  assignedAt: string;
  reason: string;
  assignedByEmployeeId: string;
};

export type WelcomeCallLead = {
  _id: string;
  campaignId: string;
  externalRegistrationId: string;
  source: string;
  registrantName: string;
  phone: string;
  email?: string;
  registeredAt: string;
  webinarDate?: string | null;
  amount: number;
  status: WelcomeCallStatus;
  lastOutcome?: WelcomeCallOutcome | null;
  assignedToEmployeeId?: string | null;
  assignedToEmployeeName?: string | null;
  assignedAt?: string | null;
  dueDate?: string | null;
  nextCallAt?: string | null;
  attemptCount: number;
  redistributionCount: number;
  assignmentHistory: WelcomeCallAssignment[];
  callAttempts: WelcomeCallAttempt[];
  metadata?: { sheetSyncMissing?: boolean; [key: string]: unknown };
  updatedAt: string;
};

export type WelcomeCallReport = {
  campaign: WelcomeCallCampaign;
  dateFrom?: string;
  dateTo?: string;
  totals: {
    registrations: number;
    assigned: number;
    unassigned: number;
    pending: number;
    connected: number;
    notConnected: number;
    callback: number;
    wrongNumber: number;
    doNotCall: number;
    attempts: number;
    connectionRate: number;
  };
  byAgent: Array<{
    employeeId: string;
    employeeName: string;
    currentlyAssigned: number;
    attempts: number;
    connected: number;
    notConnected: number;
    callback: number;
    connectionRate: number;
  }>;
};

export type WelcomeCallCampaignStats = {
  registrations: number;
  assigned: number;
  unassigned: number;
  connected: number;
  pending: number;
};
