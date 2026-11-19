'use client';
// Test-only Next application. Never imported by the production app/router.
import {AppShell} from '../../src/components/shell';
import {MobileDashboard} from '../../src/components/mobile/dashboard';
import {FieldApp} from '../../src/components/field/field-app';
import {OfflineWorkspace} from '../../src/components/field/offline-workspace';
import {CustomerManager} from '../../src/components/customer-manager';
import {TeamManager} from '../../src/components/team-manager';
import {CustomerOnboarding} from '../../src/components/customer-onboarding';
import {ContributionScreen} from '../../src/components/business/contribution-screen';
import {History} from '../../src/components/field/history';
import {IssueLog} from '../../src/components/v4/issue-log';
import {MoreScreen} from '../../src/components/v4/more-screen';
import {CustomerServiceSummary} from '../../src/components/v4/customer-service-summary';
import {BusinessHeader} from '../../src/components/business/ui';
import {reviewData,ownerId} from './fixtures';
export function ReviewScreen({screen,role,stopId}:{screen:string;role:string;stopId?:string}){const data=reviewData(role);if(screen==='offline')return <OfflineWorkspace/>;const customer=data.customers[0];return <AppShell name={data.route.displayName} role={role}>{screen==='home'?<MobileDashboard name={data.route.displayName} date={data.today} timeZone="America/New_York" scope={data.scope} business={data.business.report} pendingReports={1}/>:screen==='route'||screen==='stops'||screen==='visit'||screen==='service'?<FieldApp initialStopId={stopId} startInList={screen!=='visit'&&screen!=='service'} currentMode={role==='technician'} daily={role==='technician'} initialTechnician={role==='owner'?'all':undefined} initialDate={data.today} expectedRole={data.route.role} expectedScope={data.scope}/>:screen==='customers'?<CustomerManager/>:screen==='new'?<CustomerOnboarding technicians={data.people} ownerId={ownerId}/>:screen==='profile'?<div className="business-page"><BusinessHeader title={<>{customer.name}</>}/><CustomerServiceSummary customerId={customer.id} address={customer.properties[0].address} technicians={customer.summary!.technician_names} days={customer.summary!.days} showMoney monthlyCents={14000} serviceHref="/new"/></div>:screen==='team'?<TeamManager/>:screen==='finance'?<ContributionScreen/>:screen==='reports'?<History reports/>:screen==='issues'?<IssueLog/>:<MoreScreen role={role} scope={data.scope}/>}</AppShell>;}
