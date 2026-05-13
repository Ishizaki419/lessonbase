"use client";

import { useCallback, useEffect, useState } from "react";

import { useClientSupabase } from "@/lib/hooks/useClientSupabase";

type SchoolMemberQueryRow = {
  school_id: string;
  role: string;
  schools: { id: string; name: string; owner_id: string | null } | null;
};

export type UseSchoolResult = {
  schoolId: string | null;
  schoolName: string | null;
  role: string | null;
  isOwner: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
};

export function useSchool(): UseSchoolResult {
  const supabase = useClientSupabase();

  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!supabase) {
      return;
    }
    setLoading(true);
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session?.user) {
      setSchoolId(null);
      setSchoolName(null);
      setRole(null);
      setIsOwner(false);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("school_members")
      .select("school_id, role, schools(id, name, owner_id)")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      setSchoolId(null);
      setSchoolName(null);
      setRole(null);
      setIsOwner(false);
      setLoading(false);
      return;
    }

    const row = data as unknown as SchoolMemberQueryRow;
    const school = row.schools;
    if (!school) {
      setSchoolId(null);
      setSchoolName(null);
      setRole(null);
      setIsOwner(false);
      setLoading(false);
      return;
    }

    setSchoolId(row.school_id);
    setSchoolName(school.name);
    setRole(row.role);
    setIsOwner(school.owner_id === session.user.id);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) {
      return;
    }
    void refresh();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [refresh, supabase]);

  return { schoolId, schoolName, role, isOwner, loading, refresh };
}
