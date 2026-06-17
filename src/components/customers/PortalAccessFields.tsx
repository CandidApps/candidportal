'use client';

import type { Location } from '@/components/CustomersView';
import type { PortalAccessTier } from '@/lib/portal-access';
import { portalTierLabel } from '@/lib/portal-access';
import { portalInvitesDisabledNotice, portalInvitesEnabled } from '@/lib/portal-invites';

const BRAND = {
  gray: '#6B6B6B',
  grayDark: '#1E1E1E',
  grayLight: '#F5F5F5',
  grayBorder: '#E2E2E2',
  red: '#C8281E',
  redDark: '#8B1A12',
  redLight: '#E8453B',
  green: '#1A7A4A',
  amber: '#B45309',
} as const;

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: `1px solid ${BRAND.grayBorder}`,
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "'DM Sans',sans-serif",
  outline: 'none',
};

type Props = {
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  tier: PortalAccessTier;
  onTierChange: (tier: PortalAccessTier) => void;
  locations: Location[];
  locationIds: string[];
  onLocationIdsChange: (ids: string[]) => void;
  showInvite?: boolean;
  inviteDisabled?: boolean;
  inviteDisabledReason?: string;
  inviteSending?: boolean;
  onSendInvite?: () => void;
  inviteNotice?: string | null;
  inviteSentAt?: string;
};

export function PortalAccessFields({
  enabled,
  onEnabledChange,
  tier,
  onTierChange,
  locations,
  locationIds,
  onLocationIdsChange,
  showInvite = false,
  inviteDisabled = false,
  inviteDisabledReason,
  inviteSending = false,
  onSendInvite,
  inviteNotice,
  inviteSentAt,
}: Props) {
  const invitesLive = portalInvitesEnabled();

  const toggleLocation = (id: string) => {
    if (locationIds.includes(id)) {
      onLocationIdsChange(locationIds.filter((x) => x !== id));
    } else {
      onLocationIdsChange([...locationIds, id]);
    }
  };

  return (
    <div
      style={{
        marginTop: 4,
        padding: 14,
        borderRadius: 8,
        border: `1px solid ${enabled ? 'rgba(200,40,30,0.25)' : BRAND.grayBorder}`,
        background: enabled ? 'rgba(200,40,30,0.04)' : BRAND.grayLight,
      }}
    >
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: BRAND.grayDark }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
        />
        Portal access
      </label>
      <p style={{ margin: '8px 0 0', fontSize: 11, color: BRAND.gray, lineHeight: 1.45 }}>
        Allows this contact to sign in to the member portal.
        {invitesLive
          ? ' Send portal invite emails them a one-time sign-in link.'
          : ' Save the contact to apply access; invite emails are disabled in dev.'}
        {locations.length > 1 ? ' Access can be limited to selected locations below.' : ''}
      </p>

      {enabled && !invitesLive && (
        <p style={{ margin: '10px 0 0', fontSize: 11, color: BRAND.amber, lineHeight: 1.45 }}>
          {portalInvitesDisabledNotice()}
        </p>
      )}

      {enabled && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: BRAND.gray, marginBottom: 8 }}>
            Access level
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(['full', 'trial'] as PortalAccessTier[]).map((value) => (
              <label
                key={value}
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: BRAND.grayDark }}
              >
                <input
                  type="radio"
                  name="portal-access-tier"
                  checked={tier === value}
                  onChange={() => onTierChange(value)}
                />
                {portalTierLabel(value)}
              </label>
            ))}
          </div>

          {locations.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: BRAND.gray, marginBottom: 8 }}>
                Location scope
              </div>
              <p style={{ margin: '0 0 8px', fontSize: 11, color: BRAND.gray }}>
                Leave all unchecked for access to every location. Select specific sites to restrict login.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {locations.map((loc) => (
                  <label
                    key={loc.id}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 12, color: BRAND.grayDark }}
                  >
                    <input
                      type="checkbox"
                      checked={locationIds.includes(loc.id)}
                      onChange={() => toggleLocation(loc.id)}
                      style={{ marginTop: 2 }}
                    />
                    <span>
                      <strong>{loc.label}</strong>
                      {loc.isPrimary && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: BRAND.green, fontWeight: 700 }}>PRIMARY</span>
                      )}
                      <span style={{ display: 'block', color: BRAND.gray, marginTop: 2 }}>
                        {[loc.street, loc.city, loc.state].filter(Boolean).join(', ')}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {showInvite && onSendInvite && (
            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                disabled={inviteDisabled || inviteSending}
                title={inviteDisabled ? inviteDisabledReason : undefined}
                onClick={onSendInvite}
                style={{
                  background: inviteDisabled || inviteSending ? BRAND.grayBorder : `linear-gradient(135deg,${BRAND.redDark},${BRAND.redLight})`,
                  color: inviteDisabled || inviteSending ? BRAND.gray : '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '10px 16px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: inviteDisabled || inviteSending ? 'not-allowed' : 'pointer',
                }}
              >
                {inviteSending ? 'Sending…' : invitesLive ? 'Send portal invite' : 'Save portal access'}
              </button>
              {inviteSentAt && (
                <span style={{ fontSize: 11, color: BRAND.green }}>
                  {invitesLive ? 'Last invited' : 'Access saved'}{' '}
                  {new Date(inviteSentAt).toLocaleDateString()}
                </span>
              )}
            </div>
          )}

          {inviteNotice && (
            <p style={{ margin: '10px 0 0', fontSize: 12, color: BRAND.amber, lineHeight: 1.45 }}>{inviteNotice}</p>
          )}
        </div>
      )}
    </div>
  );
}

export { inputStyle as portalAccessInputStyle };
