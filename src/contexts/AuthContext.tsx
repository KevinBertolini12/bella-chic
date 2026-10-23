import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isSuperAdmin: boolean;
  isSalonAdmin: boolean;
  isProfessional: boolean;
  isClient: boolean;
  salonId: string | null;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isSuperAdmin: false,
  isSalonAdmin: false,
  isProfessional: false,
  isClient: false,
  salonId: null,
  refreshProfile: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (firebaseUser: User) => {
    try {
      const userRef = doc(db, 'users', firebaseUser.uid);
      const userDoc = await getDoc(userRef);
      const bootstrapEmail =
        (import.meta as any)?.env?.VITE_SUPER_ADMIN_EMAIL || 'icaromoreira1313@gmail.com';

      if (userDoc.exists()) {
        const existingProfile = userDoc.data() as UserProfile;

        if (
          firebaseUser.email === bootstrapEmail &&
          firebaseUser.emailVerified &&
          existingProfile.role !== 'SUPER_ADMIN'
        ) {
          await updateDoc(userRef, { role: 'SUPER_ADMIN' });
          setProfile({ ...existingProfile, role: 'SUPER_ADMIN' });
        } else {
          setProfile(existingProfile);
        }
      } else {
        const isBootstrapAdmin =
          firebaseUser.email === bootstrapEmail && firebaseUser.emailVerified;

        const newProfile: any = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || 'Usuário',
          role: isBootstrapAdmin ? 'SUPER_ADMIN' : 'CLIENT',
          createdAt: Date.now(),
        };

        if (firebaseUser.photoURL) newProfile.photoURL = firebaseUser.photoURL;
        if (firebaseUser.phoneNumber) newProfile.phone = firebaseUser.phoneNumber;

        await setDoc(userRef, newProfile);
        setProfile(newProfile as UserProfile);
      }
    } catch (error) {
      console.error('Erro ao carregar/criar perfil do usuário:', error);
      setProfile(null);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await fetchProfile(firebaseUser);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user);
    }
  };

  const value = {
    user,
    profile,
    loading,
    isSuperAdmin: profile?.role === 'SUPER_ADMIN',
    isSalonAdmin: profile?.role === 'SALON_ADMIN',
    isProfessional: profile?.role === 'PROFESSIONAL',
    isClient: profile?.role === 'CLIENT',
    salonId: profile?.salonId || null,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);