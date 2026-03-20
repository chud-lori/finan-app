'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

// Renders "Go to Dashboard" if logged in, "Sign in" otherwise.
// Used in server-component pages (Privacy, Terms) that can't read localStorage directly.
export default function AuthNavLink({ className }) {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(!!localStorage.getItem('token'));
  }, []);

  return loggedIn ? (
    <Link href="/dashboard" className={className}>Dashboard</Link>
  ) : (
    <Link href="/login" className={className}>Sign in</Link>
  );
}
