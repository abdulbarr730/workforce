"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

export type AdminNotification = {
  _id: string;
  kind: string;
  title: string;
  message: string;
  employeeId: string;
  employeeName: string;
  entityType: "TODO" | "EOD" | "LEAVE";
  entityId: string;
  entityDate?: string | null;
  reason?: string;
  before?: unknown;
  after?: unknown;
  diff?: {
    added?: string[];
    removed?: string[];
    changed?: Array<{ field: string; before: unknown; after: unknown }>;
  };
  deepLink: string;
  readBy?: string[];
  changedBy?: { employeeId?: string; name?: string; role?: string };
  createdAt: string;
};

type NotificationResponse = {
  notifications: AdminNotification[];
  unreadCount: number;
  unreadByEntity: { TODO: number; EOD: number; LEAVE: number };
};

const emptyData: NotificationResponse = {
  notifications: [],
  unreadCount: 0,
  unreadByEntity: { TODO: 0, EOD: 0, LEAVE: 0 },
};

export function useAdminNotifications() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const enabled = Boolean(
    user && ["ADMIN", "SUPER_ADMIN", "HR"].includes(user.role),
  );
  const query = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: () =>
      api
        .get("/api/notifications?limit=40")
        .then((response) => response.data.data as NotificationResponse),
    enabled,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["admin-notifications"] }),
    [queryClient],
  );

  const markRead = useCallback(
    async (id: string) => {
      await api.patch(`/api/notifications/${id}/read`);
      await refresh();
    },
    [refresh],
  );

  const markAllRead = useCallback(async () => {
    await api.patch("/api/notifications/read-all");
    await refresh();
  }, [refresh]);

  const markCategoryRead = useCallback(
    async (entityTypes: Array<"TODO" | "EOD" | "LEAVE">) => {
      await api.patch("/api/notifications/read-category", { entityTypes });
      await refresh();
    },
    [refresh],
  );

  return {
    ...query,
    data: query.data ?? emptyData,
    markRead,
    markAllRead,
    markCategoryRead,
    refresh,
  };
}
