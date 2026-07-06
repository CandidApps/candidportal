'use client';

import { AppIcon, type AppIconName } from '@/components/AppIcon';
import {
  MEMBER_REQUEST_KIND_LABEL,
  type MemberDashboardRequest,
  type MemberDashboardRequestTarget,
} from '@/lib/member-dashboard-requests';
import { memberSlaSummaryCopy } from '@/lib/member-request-sla';

const KIND_ICON: Record<MemberDashboardRequest['kind'], AppIconName> = {
  quote_request: 'reports',
  bill_analysis: 'file',
  service_ticket: 'messages',
  review_request: 'sparkles',
  help_request: 'messages',
};

const STATUS_LABEL: Record<MemberDashboardRequest['status'], string> = {
  submitted: 'Submitted',
  in_progress: 'In progress',
  ready: 'Ready',
};

type Props = {
  requests: MemberDashboardRequest[];
  onNavigate: (target: MemberDashboardRequestTarget) => void;
};

export function MemberRequestsPanel({ requests, onNavigate }: Props) {
  if (requests.length === 0) return null;

  const activeCount = requests.filter((r) => r.status !== 'ready').length;

  return (
    <div className="card member-requests-card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <div className="card-title">Your requests</div>
        <span className="member-requests-count">
          {activeCount > 0
            ? `${activeCount} active`
            : `${requests.length} item${requests.length === 1 ? '' : 's'}`}
        </span>
      </div>
      <div className="card-body">
        <p className="member-requests-intro">{memberSlaSummaryCopy()} Tap a request for details.</p>
        {requests.map((req) => (
          <button
            key={req.id}
            type="button"
            className={`member-request-row member-request-row--${req.status}${req.slaStatus ? ` member-request-row--sla-${req.slaStatus}` : ''}`}
            onClick={() => onNavigate(req.target)}
          >
            <span className={`member-request-icon member-request-icon--${req.kind}`}>
              <AppIcon name={KIND_ICON[req.kind]} size={16} />
            </span>
            <span className="member-request-body">
              <span className="member-request-top">
                <span className="member-request-kind">{MEMBER_REQUEST_KIND_LABEL[req.kind]}</span>
                <span className={`member-request-status member-request-status--${req.status}`}>
                  {STATUS_LABEL[req.status]}
                </span>
              </span>
              <span className="member-request-title">{req.title}</span>
              <span className="member-request-detail">{req.detail}</span>
              {req.slaLabel ? <span className="member-request-sla">{req.slaLabel}</span> : null}
            </span>
            <span className="member-request-go">Open →</span>
          </button>
        ))}
      </div>
    </div>
  );
}
