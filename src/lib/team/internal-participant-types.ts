export type InternalParticipantType = 'partner' | 'internal_employee' | 'inactive';
export type InternalParticipantStatus = 'active' | 'inactive';

export type InternalCommissionParticipant = {
  profileId: string;
  displayName: string;
  email: string;
  participantType: InternalParticipantType;
  defaultHouseSharePercent: number;
  houseShareRateOfNet: number | null;
  optionalAgentCommId: string | null;
  notes: string | null;
  status: InternalParticipantStatus;
  updatedAt: string | null;
};

export type InternalParticipantPatch = {
  participantType?: InternalParticipantType;
  defaultHouseSharePercent?: number;
  houseShareRateOfNet?: number | null;
  optionalAgentCommId?: string | null;
  notes?: string | null;
  status?: InternalParticipantStatus;
};
