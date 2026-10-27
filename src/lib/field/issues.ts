export const ISSUE_FLAGS=['green_pool','equipment_issue','low_water','access_denied','other'] as const;
export type IssueFlag=typeof ISSUE_FLAGS[number];
export const ISSUE_LABELS:Record<IssueFlag,string>={green_pool:'Green Pool',equipment_issue:'Equipment Issue',low_water:'Low Water',access_denied:'Access Denied',other:'Other'};
