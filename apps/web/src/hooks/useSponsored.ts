import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sponsoredApi, type ResolvedSlot } from '../lib/sponsoredApi';

export function useDisclosure() {
  return useQuery({ queryKey: ['sponsored', 'disclosure'], queryFn: () => sponsoredApi.fetchDisclosure(), staleTime: 60_000 });
}

export function useResolveSlots(surface: ResolvedSlot['surface'], categoryId: string | null) {
  return useQuery({
    queryKey: ['sponsored', 'resolve', surface, categoryId],
    queryFn: () => sponsoredApi.resolveSlots(surface, categoryId),
    staleTime: 30_000,
  });
}

export function usePlans() {
  return useQuery({ queryKey: ['sponsored', 'plans'], queryFn: () => sponsoredApi.listPlans() });
}

export function useSubscribe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => sponsoredApi.subscribePlan(planId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sponsored', 'subscription'] });
    },
  });
}

export function useMySubscription(supplierId: string) {
  return useQuery({
    queryKey: ['sponsored', 'subscription', supplierId],
    queryFn: () => sponsoredApi.getMySubscription(supplierId),
    enabled: !!supplierId,
  });
}

export function useCancelSubscription(supplierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sponsoredApi.cancelSubscription(id, supplierId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sponsored', 'subscription'] }),
  });
}

export function useSlots(surface: string, categoryId: string | null, supplierId: string) {
  return useQuery({
    queryKey: ['sponsored', 'slots', surface, categoryId, supplierId],
    queryFn: () => sponsoredApi.listSlots(surface, categoryId, supplierId),
    enabled: !!supplierId && !!surface,
  });
}

export function useCampaigns(supplierId: string, status?: string) {
  return useQuery({
    queryKey: ['sponsored', 'campaigns', supplierId, status],
    queryFn: () => sponsoredApi.listCampaigns(supplierId, status),
    enabled: !!supplierId,
  });
}

export function useCreateCampaign(supplierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof sponsoredApi.createCampaign>[0]) => sponsoredApi.createCampaign(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sponsored', 'campaigns', supplierId] }),
  });
}

export function useCancelCampaign(supplierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sponsoredApi.cancelCampaign(id, supplierId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sponsored', 'campaigns', supplierId] }),
  });
}

export function useInvoices(supplierId: string, status?: string) {
  return useQuery({
    queryKey: ['sponsored', 'invoices', supplierId, status],
    queryFn: () => sponsoredApi.listInvoices(supplierId, status),
    enabled: !!supplierId,
  });
}

export function usePayInvoice(supplierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sponsoredApi.payInvoice(id, supplierId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sponsored', 'invoices', supplierId] }),
  });
}

// Admin hooks
export function useAdminPlans() { return useQuery({ queryKey: ['sponsored', 'admin', 'plans'], queryFn: () => sponsoredApi.adminListPlans() }); }
export function useAdminUpsertPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string | null; input: Parameters<typeof sponsoredApi.adminUpsertPlan>[1] }) => sponsoredApi.adminUpsertPlan(args.id, args.input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sponsored', 'admin', 'plans'] }),
  });
}
export function useAdminDeletePlan() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => sponsoredApi.adminDeletePlan(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['sponsored', 'admin', 'plans'] }) });
}
export function useAdminSlots() { return useQuery({ queryKey: ['sponsored', 'admin', 'slots'], queryFn: () => sponsoredApi.adminListSlots() }); }
export function useAdminUpsertSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string | null; input: Parameters<typeof sponsoredApi.adminUpsertSlot>[1] }) => sponsoredApi.adminUpsertSlot(args.id, args.input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sponsored', 'admin', 'slots'] }),
  });
}
export function useAdminDeleteSlot() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => sponsoredApi.adminDeleteSlot(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['sponsored', 'admin', 'slots'] }) });
}
export function useAdminCampaigns(opts: Parameters<typeof sponsoredApi.adminListCampaigns>[0] = {}) {
  return useQuery({ queryKey: ['sponsored', 'admin', 'campaigns', opts], queryFn: () => sponsoredApi.adminListCampaigns(opts) });
}
export function useAdminApprove() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, adminNotes }: { id: string; adminNotes?: string }) => sponsoredApi.adminApprove(id, adminNotes), onSuccess: () => qc.invalidateQueries({ queryKey: ['sponsored', 'admin', 'campaigns'] }) });
}
export function useAdminReject() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => sponsoredApi.adminReject(id, reason), onSuccess: () => qc.invalidateQueries({ queryKey: ['sponsored', 'admin', 'campaigns'] }) });
}
export function useAdminRevoke() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => sponsoredApi.adminRevoke(id, reason), onSuccess: () => qc.invalidateQueries({ queryKey: ['sponsored', 'admin', 'campaigns'] }) });
}
export function useAdminPin() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => sponsoredApi.adminPin(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['sponsored', 'admin', 'campaigns'] }) });
}
export function useAdminAnalytics(from?: number, to?: number) {
  return useQuery({ queryKey: ['sponsored', 'admin', 'analytics', from, to], queryFn: () => sponsoredApi.adminAnalytics(from, to) });
}