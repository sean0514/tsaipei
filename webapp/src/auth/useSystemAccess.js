import { useEffect, useState } from 'react';
import { doc, onSnapshot, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { canEdit, canView } from '../lib/permissions';

// A user's membership + role within one system, stored at
// `${system}_users/{uid}` — { email, displayName, role }.
// Doc must be created by an admin (via the 使用人員 page) before a Firebase
// Auth account can access that system; missing doc = no access.
export function useSystemProfile(system) {
  const { user } = useAuth();
  const [profile, setProfile] = useState(undefined); // undefined = loading, null = no access

  useEffect(() => {
    if (!user) { setProfile(null); return; }
    const ref = doc(db, `${system}_users`, user.uid);
    return onSnapshot(ref, (snap) => setProfile(snap.exists() ? snap.data() : null));
  }, [system, user]);

  return profile;
}

// Per-module role-permission overrides for a system, stored as docs in
// `${system}_rolePermissions` with id `${module}__${role}` and a `level` field.
// Falls back to the hardcoded defaults in lib/permissions.js when a doc
// (or the whole collection) doesn't exist yet.
export function useRolePermissions(system) {
  const [overrides, setOverrides] = useState({});

  useEffect(() => {
    const ref = collection(db, `${system}_rolePermissions`);
    return onSnapshot(ref, (snap) => {
      const next = {};
      snap.forEach((d) => {
        const [module, role] = d.id.split('__');
        next[module] = next[module] || {};
        next[module][role] = d.data().level;
      });
      setOverrides(next);
    });
  }, [system]);

  return overrides;
}

export function useModuleAccess(system, module) {
  const profile = useSystemProfile(system);
  const overrides = useRolePermissions(system);
  const role = profile?.role;
  return {
    loading: profile === undefined,
    hasAccess: !!profile,
    role,
    canView: role ? canView(system, module, role, overrides) : false,
    canEdit: role ? canEdit(system, module, role, overrides) : false,
  };
}
