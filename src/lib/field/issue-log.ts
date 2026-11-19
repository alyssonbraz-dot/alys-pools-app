import type {VisitHistory} from './types';
export const ISSUE_PRIORITIES=['routine','soon','urgent'] as const;
export type IssuePriority=typeof ISSUE_PRIORITIES[number];
const prefix=/^\[(routine|soon|urgent)\]\s*/i;
export function issuePriority(text:string):IssuePriority|undefined{return text.match(prefix)?.[1].toLowerCase() as IssuePriority|undefined;}
export function issueText(text:string){return text.replace(prefix,'');}
/** Plain text metadata in the existing staff-only field; old free text stays readable. */
export function withIssuePriority(text:string,priority:IssuePriority){return '['+priority+'] '+issueText(text);}
export const ISSUE_RESOLVED='[ALYS_ISSUE_RESOLVED]';
export const ISSUE_REOPENED='[ALYS_ISSUE_REOPENED]';
export function issueFromVisit(visit:VisitHistory){const finding=visit.service_details?.equipment_problems??'';if(!issueText(finding).trim()&&!visit.issue_flags?.length)return null;const last=visit.corrections?.filter(c=>c.note.startsWith(ISSUE_RESOLVED)||c.note.startsWith(ISSUE_REOPENED)).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id)).at(-1);return {visit,finding:issueText(finding),priority:issuePriority(finding),resolved:!!last?.note.startsWith(ISSUE_RESOLVED),lastAction:last};}
