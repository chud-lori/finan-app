import { redirect } from 'next/navigation';

// Settings have been consolidated into the Profile page.
export default function SettingsPage() {
  redirect('/profile');
}
