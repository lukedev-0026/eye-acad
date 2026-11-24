import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { useEffect, useState } from 'react';

import { auth } from '@/features/auth/lib/firebase';

// undefined: not known yet. null: signed out.
export function useAuthUser(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  return user;
}
